import { DEFAULT_GAME } from "../core/games";
import type { GameId } from "../core/games";
import { live, now, pruneTombstones } from "../core/sync";
import { onStorageOwnerChange, scopedKey } from "../lib/storageScope";
import type { SyncMeta } from "../core/sync";

/**
 * Cards you want but don't own.
 *
 * Deliberately the same shape as a collection entry minus the quantity: a
 * wishlist is a set of *printings* you're hunting, and "I want the reverse
 * holo, not the normal" is the whole point. Storing the variant is what lets
 * "I got it" hand the right printing straight to the collection.
 *
 * No folders, pages or pockets. A wishlist is a list you take to a trade, not
 * an object you arrange.
 */
export interface WishlistEntry extends SyncMeta {
  gameId: GameId;
  cardId: string;
  variantId: string;
  addedAt: string;
  note?: string;
}

export function wishlistKey(gameId: GameId, cardId: string, variantId: string): string {
  return `${gameId}:${cardId}:${variantId}`;
}

/** Mirrors `CollectionStore` so the same swap to an API-backed store applies. */
export interface WishlistStore {
  list(gameId: GameId): Promise<WishlistEntry[]>;
  add(gameId: GameId, cardId: string, variantId: string): Promise<void>;
  remove(gameId: GameId, cardId: string, variantId: string): Promise<void>;
  /** Change which printing is wanted, keeping the card's place in the list. */
  setVariant(gameId: GameId, cardId: string, from: string, to: string): Promise<void>;
  clear(gameId: GameId): Promise<void>;
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = "cardcol.wishlist.v2";
/** Pre-sync-metadata wishlist. Read once to migrate, then left as a rollback copy. */
const LEGACY_V1_KEY = "cardcol.wishlist.v1";

interface StoredShape {
  version: 2;
  entries: WishlistEntry[];
}

function isUsable(entry: Partial<WishlistEntry>): boolean {
  return typeof entry?.cardId === "string" && typeof entry?.variantId === "string";
}

function normaliseEntry(entry: Partial<WishlistEntry>): WishlistEntry {
  const addedAt = entry.addedAt ?? now();
  return {
    ...(entry as WishlistEntry),
    gameId: entry.gameId ?? DEFAULT_GAME,
    addedAt,
    updatedAt: entry.updatedAt ?? addedAt,
  };
}

function readAll(): WishlistEntry[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw) as StoredShape;
      if (parsed?.version !== 2 || !Array.isArray(parsed.entries)) return [];
      return parsed.entries.filter(isUsable).map(normaliseEntry);
    }

    const legacy = localStorage.getItem(LEGACY_V1_KEY);
    if (!legacy) return [];
    const parsed = JSON.parse(legacy) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) return [];

    const migrated = (parsed.entries as Partial<WishlistEntry>[])
      .filter(isUsable)
      .map(normaliseEntry);
    write(migrated);
    return migrated;
  } catch {
    return [];
  }
}

function write(entries: WishlistEntry[]): void {
  try {
    const payload: StoredShape = { version: 2, entries: pruneTombstones(entries) };
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(payload));
  } catch {
    /* quota or private mode — in-session state is still correct */
  }
}

export function createLocalWishlistStore(): WishlistStore {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(STORAGE_KEY) || event.key === null) notify();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  onStorageOwnerChange(notify);

  const indexOf = (entries: WishlistEntry[], gameId: GameId, cardId: string, variantId: string) =>
    entries.findIndex(
      (entry) => wishlistKey(entry.gameId, entry.cardId, entry.variantId) === wishlistKey(gameId, cardId, variantId),
    );

  return {
    async list(gameId) {
      // Newest first: a wishlist is a working list, not an archive.
      return live(readAll())
        .filter((entry) => entry.gameId === gameId)
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    },

    async add(gameId, cardId, variantId) {
      const entries = readAll();
      const index = indexOf(entries, gameId, cardId, variantId);
      const timestamp = now();

      if (index >= 0) {
        // Already wanted — unless it was removed, in which case revive the row.
        if (!entries[index].deleted) return;
        entries[index] = {
          ...entries[index],
          deleted: false,
          addedAt: timestamp,
          updatedAt: timestamp,
        };
      } else {
        entries.push({ gameId, cardId, variantId, addedAt: timestamp, updatedAt: timestamp });
      }

      write(entries);
      notify();
    },

    async remove(gameId, cardId, variantId) {
      const entries = readAll();
      const index = indexOf(entries, gameId, cardId, variantId);
      if (index < 0 || entries[index].deleted) return;

      // Tombstone, so another device learns this was removed.
      entries[index] = { ...entries[index], deleted: true, updatedAt: now() };
      write(entries);
      notify();
    },

    async setVariant(gameId, cardId, from, to) {
      if (from === to) return;
      const entries = readAll();
      const index = indexOf(entries, gameId, cardId, from);
      if (index < 0 || entries[index].deleted) return;

      const timestamp = now();
      const target = indexOf(entries, gameId, cardId, to);

      /*
       * The printing is part of the row's identity, so changing it is a delete
       * plus an add rather than an edit — otherwise two devices could disagree
       * about which row a given key refers to.
       */
      entries[index] = { ...entries[index], deleted: true, updatedAt: timestamp };

      if (target >= 0) {
        entries[target] = { ...entries[target], deleted: false, updatedAt: timestamp };
      } else {
        entries.push({
          ...entries[index],
          variantId: to,
          deleted: false,
          addedAt: entries[index].addedAt,
          updatedAt: timestamp,
        });
      }

      write(entries);
      notify();
    },

    async clear(gameId) {
      const timestamp = now();
      write(
        readAll().map((entry) =>
          entry.gameId === gameId && !entry.deleted
            ? { ...entry, deleted: true, updatedAt: timestamp }
            : entry,
        ),
      );
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Shared singleton, for the same reason the collection store is one. */
export const wishlistStore: WishlistStore = createLocalWishlistStore();

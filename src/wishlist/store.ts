import { DEFAULT_GAME } from "../core/games";
import type { GameId } from "../core/games";

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
export interface WishlistEntry {
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

const STORAGE_KEY = "cardcol.wishlist.v1";

interface StoredShape {
  version: 1;
  entries: WishlistEntry[];
}

function isUsable(entry: Partial<WishlistEntry>): boolean {
  return typeof entry?.cardId === "string" && typeof entry?.variantId === "string";
}

function readAll(): WishlistEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return [];

    return parsed.entries
      .filter(isUsable)
      .map((entry) => ({ ...entry, gameId: entry.gameId ?? DEFAULT_GAME }));
  } catch {
    return [];
  }
}

function write(entries: WishlistEntry[]): void {
  try {
    const payload: StoredShape = { version: 1, entries };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode — in-session state is still correct */
  }
}

export function createLocalWishlistStore(): WishlistStore {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) notify();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  const indexOf = (entries: WishlistEntry[], gameId: GameId, cardId: string, variantId: string) =>
    entries.findIndex(
      (entry) => wishlistKey(entry.gameId, entry.cardId, entry.variantId) === wishlistKey(gameId, cardId, variantId),
    );

  return {
    async list(gameId) {
      // Newest first: a wishlist is a working list, not an archive.
      return readAll()
        .filter((entry) => entry.gameId === gameId)
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    },

    async add(gameId, cardId, variantId) {
      const entries = readAll();
      if (indexOf(entries, gameId, cardId, variantId) >= 0) return;

      entries.push({ gameId, cardId, variantId, addedAt: new Date().toISOString() });
      write(entries);
      notify();
    },

    async remove(gameId, cardId, variantId) {
      const entries = readAll();
      const index = indexOf(entries, gameId, cardId, variantId);
      if (index < 0) return;

      entries.splice(index, 1);
      write(entries);
      notify();
    },

    async setVariant(gameId, cardId, from, to) {
      if (from === to) return;
      const entries = readAll();
      const index = indexOf(entries, gameId, cardId, from);
      if (index < 0) return;

      // Wanting a printing you already listed collapses to one entry.
      const existing = indexOf(entries, gameId, cardId, to);
      if (existing >= 0) entries.splice(index, 1);
      else entries[index] = { ...entries[index], variantId: to };

      write(entries);
      notify();
    },

    async clear(gameId) {
      write(readAll().filter((entry) => entry.gameId !== gameId));
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

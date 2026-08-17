import { cardKey, DEFAULT_GAME } from "../core/games";
import type { GameId } from "../core/games";
import { live, now, pruneTombstones } from "../core/sync";
import { onStorageOwnerChange, scopedKey } from "../lib/storageScope";
import type { SyncMeta } from "../core/sync";

/**
 * What we actually own. Deliberately only identity + quantity — full card data
 * is always resolved through the provider cache, never duplicated here, so the
 * collection stays tiny and can't drift out of sync with the API.
 *
 * `SyncMeta` is what lets the same collection be edited on two devices; see
 * `core/sync.ts` for why a delete has to be a tombstone rather than a splice.
 */
export interface CollectionEntry extends SyncMeta {
  gameId: GameId;
  cardId: string;
  /** Which printing this is. Opaque here — the provider defines the values. */
  variantId: string;
  quantity: number;
  /** ISO timestamp, used for "recently added" ordering. */
  addedAt: string;
}

/** Identity of one owned printing. */
export function entryKey(gameId: GameId, cardId: string, variantId: string): string {
  return `${cardKey(gameId, cardId)}:${variantId}`;
}

/**
 * Storage contract. Every method is async even though localStorage is not, so
 * swapping in an HTTP/database store later is a one-line change in
 * `CollectionProvider` with no callers touched.
 */
export interface CollectionStore {
  /** Entries for one game. Never returns another game's rows, so no caller filters. */
  list(gameId: GameId): Promise<CollectionEntry[]>;
  /** `quantity <= 0` removes the entry. */
  setQuantity(
    gameId: GameId,
    cardId: string,
    variantId: string,
    quantity: number,
  ): Promise<void>;
  clear(gameId: GameId): Promise<void>;
  /** Returns an unsubscribe function. Fires on local and cross-tab changes. */
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = "cardcol.collection.v4";
/**
 * Earlier collections, read once to migrate and then kept as rollback copies.
 * v1 predates variants; v2 predates CardCol but already carried `gameId`;
 * v3 predates sync metadata, so its rows get `updatedAt` stamped from `addedAt`.
 */
const LEGACY_V3_KEY = "cardcol.collection.v3";
const LEGACY_V2_KEY = "pokecol.collection.v2";
const LEGACY_V1_KEY = "pokecol.collection.v1";
const MAX_QUANTITY = 99;

/**
 * Ownership recorded before variants existed can't say which printing it was,
 * and guessing would be worse than admitting it — so it migrates onto the
 * explicit "unspecified" printing.
 */
const UNSPECIFIED_VARIANT_ID = "unspecified";

interface StoredShape {
  version: 4;
  entries: CollectionEntry[];
}

function isUsable(entry: { cardId?: unknown; quantity?: unknown }): boolean {
  return typeof entry?.cardId === "string" && Number.isFinite(entry.quantity);
}

function normaliseEntry(entry: Partial<CollectionEntry>): CollectionEntry {
  const addedAt = entry.addedAt ?? now();
  return {
    ...(entry as CollectionEntry),
    // Tolerate entries that predate a field rather than dropping the row: this
    // is the user's collection, and losing it is worse than guessing.
    gameId: entry.gameId ?? DEFAULT_GAME,
    variantId: entry.variantId ?? UNSPECIFIED_VARIANT_ID,
    addedAt,
    // A row written before sync metadata existed was last touched when it was
    // added, as far as anyone can tell.
    updatedAt: entry.updatedAt ?? addedAt,
  };
}

/**
 * Fold the newest legacy key we can find into v4.
 *
 * Legacy keys are deliberately left in place: this is the user's whole
 * collection, and a one-way rewrite with no way back is not a risk worth
 * taking to save a few kilobytes.
 */
function migrateLegacy(): CollectionEntry[] | null {
  for (const key of [LEGACY_V3_KEY, LEGACY_V2_KEY, LEGACY_V1_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as { version?: number; entries?: unknown };
      if (!Array.isArray(parsed.entries)) continue;

      const migrated = (parsed.entries as Partial<CollectionEntry>[])
        .filter(isUsable)
        .map(normaliseEntry);
      write(migrated);
      return migrated;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

function readAll(): CollectionEntry[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return migrateLegacy() ?? [];

    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== 4 || !Array.isArray(parsed.entries)) return [];

    return parsed.entries.filter(isUsable).map(normaliseEntry);
  } catch {
    // Corrupt or unavailable storage shouldn't take the binder down.
    return [];
  }
}

function write(entries: CollectionEntry[]): void {
  try {
    // Expired tombstones are dropped on the way out, so storage stays bounded
    // without a separate sweep.
    const payload: StoredShape = { version: 4, entries: pruneTombstones(entries) };
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(payload));
  } catch {
    /* quota or private mode — the in-session state is still correct */
  }
}

export function createLocalCollectionStore(): CollectionStore {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  // Keep tabs in sync: `storage` fires in *other* tabs when this one writes.
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(STORAGE_KEY) || event.key === LEGACY_V3_KEY || event.key === null) {
      notify();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  // Signing in or out points the same store at a different namespace, which is
  // a bigger change than any single write — tell everyone to re-read.
  onStorageOwnerChange(notify);

  return {
    async list(gameId) {
      // Tombstones are storage's business, not the binder's.
      return live(readAll()).filter((entry) => entry.gameId === gameId);
    },

    async setQuantity(gameId, cardId, variantId, quantity) {
      const entries = readAll();
      const key = entryKey(gameId, cardId, variantId);
      const index = entries.findIndex(
        (entry) => entryKey(entry.gameId, entry.cardId, entry.variantId) === key,
      );
      const timestamp = now();

      if (quantity <= 0) {
        /*
         * Tombstone rather than splice. The row has to stay so another device
         * can learn the card was removed — dropping it outright means the next
         * sync sees a row it doesn't have locally and helpfully puts it back.
         */
        if (index >= 0) {
          entries[index] = {
            ...entries[index],
            quantity: 0,
            deleted: true,
            updatedAt: timestamp,
          };
        }
      } else {
        const clamped = Math.min(Math.floor(quantity), MAX_QUANTITY);
        if (index >= 0) {
          // Re-adding a tombstoned printing revives the same row.
          entries[index] = {
            ...entries[index],
            quantity: clamped,
            deleted: false,
            updatedAt: timestamp,
          };
        } else {
          entries.push({
            gameId,
            cardId,
            variantId,
            quantity: clamped,
            addedAt: timestamp,
            updatedAt: timestamp,
          });
        }
      }

      write(entries);
      notify();
    },

    async clear(gameId) {
      // Only this game's rows — clearing Pokémon must not empty the Magic binder.
      const timestamp = now();
      write(
        readAll().map((entry) =>
          entry.gameId === gameId && !entry.deleted
            ? { ...entry, quantity: 0, deleted: true, updatedAt: timestamp }
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

/**
 * The app's store instance.
 *
 * Deliberately a shared singleton: the `storage` event does not fire in the tab
 * that wrote it, so two instances inside one tab would never see each other's
 * writes. Swap this single binding for an API-backed store and everything
 * downstream follows.
 */
export const collectionStore: CollectionStore = createLocalCollectionStore();

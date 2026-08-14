import type { GameId } from "../core/types";

/**
 * What we actually own. Deliberately only identity + quantity — full card data
 * is always resolved through the provider cache, never duplicated here, so the
 * collection stays tiny and can't drift out of sync with the API.
 */
export interface CollectionEntry {
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
  return `${gameId}:${cardId}:${variantId}`;
}

/**
 * Storage contract. Every method is async even though localStorage is not, so
 * swapping in an HTTP/database store later is a one-line change in
 * `CollectionProvider` with no callers touched.
 */
export interface CollectionStore {
  list(): Promise<CollectionEntry[]>;
  /** `quantity <= 0` removes the entry. */
  setQuantity(
    gameId: GameId,
    cardId: string,
    variantId: string,
    quantity: number,
  ): Promise<void>;
  clear(): Promise<void>;
  /** Returns an unsubscribe function. Fires on local and cross-tab changes. */
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = "pokecol.collection.v2";
/** Pre-variant collections. Read once to migrate, then kept as a rollback copy. */
const LEGACY_STORAGE_KEY = "pokecol.collection.v1";
const MAX_QUANTITY = 99;

/**
 * Ownership recorded before variants existed can't say which printing it was,
 * and guessing would be worse than admitting it — so it migrates onto the
 * explicit "unspecified" printing.
 */
const UNSPECIFIED_VARIANT_ID = "unspecified";

interface StoredShape {
  version: 2;
  entries: CollectionEntry[];
}

interface LegacyStoredShape {
  version: 1;
  entries: Omit<CollectionEntry, "variantId">[];
}

function isUsable(entry: { cardId?: unknown; quantity?: unknown }): boolean {
  return typeof entry?.cardId === "string" && Number.isFinite(entry.quantity);
}

/**
 * Read v1 and convert. The v1 key is deliberately left in place: this is the
 * user's whole collection, and a one-way rewrite with no way back is not a
 * risk worth taking to save a few kilobytes.
 */
function migrateLegacy(): CollectionEntry[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as LegacyStoredShape;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return null;

    const migrated: CollectionEntry[] = parsed.entries
      .filter(isUsable)
      .map((entry) => ({ ...entry, variantId: UNSPECIFIED_VARIANT_ID }));

    write(migrated);
    return migrated;
  } catch {
    return null;
  }
}

function read(): CollectionEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLegacy() ?? [];

    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== 2 || !Array.isArray(parsed.entries)) return [];

    return parsed.entries.filter(isUsable).map((entry) => ({
      ...entry,
      // Tolerate an entry that somehow predates the field rather than dropping it.
      variantId: entry.variantId ?? UNSPECIFIED_VARIANT_ID,
    }));
  } catch {
    // Corrupt or unavailable storage shouldn't take the binder down.
    return [];
  }
}

function write(entries: CollectionEntry[]): void {
  try {
    const payload: StoredShape = { version: 2, entries };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode — the in-session state is still correct */
  }
}

export function createLocalCollectionStore(): CollectionStore {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  // Keep tabs in sync: `storage` fires in *other* tabs when this one writes.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY || event.key === null) {
      notify();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    async list() {
      return read();
    },

    async setQuantity(gameId, cardId, variantId, quantity) {
      const entries = read();
      const key = entryKey(gameId, cardId, variantId);
      const index = entries.findIndex(
        (entry) => entryKey(entry.gameId, entry.cardId, entry.variantId) === key,
      );

      if (quantity <= 0) {
        if (index >= 0) entries.splice(index, 1);
      } else {
        const clamped = Math.min(Math.floor(quantity), MAX_QUANTITY);
        if (index >= 0) entries[index] = { ...entries[index], quantity: clamped };
        else {
          entries.push({
            gameId,
            cardId,
            variantId,
            quantity: clamped,
            addedAt: new Date().toISOString(),
          });
        }
      }

      write(entries);
      notify();
    },

    async clear() {
      write([]);
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

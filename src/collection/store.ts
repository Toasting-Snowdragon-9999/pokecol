import type { GameId } from "../core/types";

/**
 * What we actually own. Deliberately only identity + quantity — full card data
 * is always resolved through the provider cache, never duplicated here, so the
 * collection stays tiny and can't drift out of sync with the API.
 */
export interface CollectionEntry {
  gameId: GameId;
  cardId: string;
  quantity: number;
  /** ISO timestamp, used for "recently added" ordering. */
  addedAt: string;
}

/**
 * Storage contract. Every method is async even though localStorage is not, so
 * swapping in an HTTP/database store later is a one-line change in
 * `CollectionProvider` with no callers touched.
 */
export interface CollectionStore {
  list(): Promise<CollectionEntry[]>;
  /** `quantity <= 0` removes the entry. */
  setQuantity(gameId: GameId, cardId: string, quantity: number): Promise<void>;
  clear(): Promise<void>;
  /** Returns an unsubscribe function. Fires on local and cross-tab changes. */
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = "pokecol.collection.v1";
const MAX_QUANTITY = 99;

interface StoredShape {
  version: 1;
  entries: CollectionEntry[];
}

function read(): CollectionEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter(
      (entry) => typeof entry?.cardId === "string" && Number.isFinite(entry.quantity),
    );
  } catch {
    // Corrupt or unavailable storage shouldn't take the binder down.
    return [];
  }
}

function write(entries: CollectionEntry[]): void {
  try {
    const payload: StoredShape = { version: 1, entries };
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
    if (event.key === STORAGE_KEY || event.key === null) notify();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    async list() {
      return read();
    },

    async setQuantity(gameId, cardId, quantity) {
      const entries = read();
      const index = entries.findIndex(
        (entry) => entry.cardId === cardId && entry.gameId === gameId,
      );

      if (quantity <= 0) {
        if (index >= 0) entries.splice(index, 1);
      } else {
        const clamped = Math.min(Math.floor(quantity), MAX_QUANTITY);
        if (index >= 0) entries[index] = { ...entries[index], quantity: clamped };
        else entries.push({ gameId, cardId, quantity: clamped, addedAt: new Date().toISOString() });
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

/**
 * Persistent read-through cache: in-memory Map in front of IndexedDB.
 *
 * Two jobs. First, the anonymous rate limit is 1000 requests/day, so a card we
 * have already seen must never cost a second request. Second, the API is flaky,
 * so `cached()` deliberately serves *stale* data when the network fails rather
 * than blowing up a page that has perfectly good data sitting on disk.
 */

import { createStore, get, getMany, set } from "idb-keyval";

export const TTL = {
  /** Printed cards never change. */
  card: 30 * 24 * 60 * 60 * 1000,
  sets: 7 * 24 * 60 * 60 * 1000,
  search: 60 * 60 * 1000,
} as const;

interface CacheEntry<T> {
  value: T;
  ts: number;
}

const memory = new Map<string, CacheEntry<unknown>>();

// IndexedDB is unavailable in some private-browsing modes. Degrade to the
// in-memory tier rather than taking the app down with us.
let idbStore: ReturnType<typeof createStore> | null = null;
try {
  idbStore = createStore("pokecol", "cache");
} catch {
  idbStore = null;
}

async function idbGet<T>(key: string): Promise<CacheEntry<T> | undefined> {
  if (!idbStore) return undefined;
  try {
    return await get<CacheEntry<T>>(key, idbStore);
  } catch {
    return undefined;
  }
}

async function idbSet<T>(key: string, entry: CacheEntry<T>): Promise<void> {
  if (!idbStore) return;
  try {
    await set(key, entry, idbStore);
  } catch {
    /* quota exceeded or blocked — the memory tier still works */
  }
}

export async function readEntry<T>(key: string): Promise<CacheEntry<T> | undefined> {
  const hit = memory.get(key) as CacheEntry<T> | undefined;
  if (hit) return hit;

  const stored = await idbGet<T>(key);
  if (stored) memory.set(key, stored);
  return stored;
}

export async function writeEntry<T>(key: string, value: T): Promise<void> {
  const entry: CacheEntry<T> = { value, ts: Date.now() };
  memory.set(key, entry);
  await idbSet(key, entry);
}

/** Batch read. Falls back to IndexedDB only for the keys memory missed. */
export async function readEntries<T>(keys: string[]): Promise<Map<string, T>> {
  const found = new Map<string, T>();
  const missing: string[] = [];

  for (const key of keys) {
    const hit = memory.get(key) as CacheEntry<T> | undefined;
    if (hit) found.set(key, hit.value);
    else missing.push(key);
  }

  if (missing.length > 0 && idbStore) {
    try {
      const stored = await getMany<CacheEntry<T> | undefined>(missing, idbStore);
      stored.forEach((entry, index) => {
        if (!entry) return;
        const key = missing[index];
        memory.set(key, entry);
        found.set(key, entry.value);
      });
    } catch {
      /* fall through with whatever memory gave us */
    }
  }

  return found;
}

function isFresh(entry: CacheEntry<unknown>, ttlMs: number): boolean {
  return Date.now() - entry.ts < ttlMs;
}

/**
 * Read-through with stale-on-failure. If `loader` rejects but we hold an expired
 * entry, the expired entry wins — outdated card art beats an error screen.
 * Aborts always propagate, since those are intentional.
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const entry = await readEntry<T>(key);
  if (entry && isFresh(entry, ttlMs)) return entry.value;

  try {
    const value = await loader();
    await writeEntry(key, value);
    return value;
  } catch (error) {
    if (entry && !(error instanceof DOMException && error.name === "AbortError")) {
      return entry.value;
    }
    throw error;
  }
}

/** Stable cache key for a set of query params. */
export function cacheKey(prefix: string, parts: Record<string, string | number | undefined>): string {
  const serialised = Object.keys(parts)
    .sort()
    .filter((key) => parts[key] !== undefined && parts[key] !== "")
    .map((key) => `${key}=${parts[key]}`)
    .join("&");
  return `${prefix}:${serialised}`;
}

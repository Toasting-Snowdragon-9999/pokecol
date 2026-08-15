/**
 * Persistent read-through cache: in-memory Map in front of IndexedDB.
 *
 * Three jobs. First, the anonymous rate limit is 1000 requests/day, so a card we
 * have already seen must never cost a second request. Second, the API is flaky,
 * so `cached()` deliberately serves *stale* data when the network fails rather
 * than blowing up a page that has perfectly good data sitting on disk. Third,
 * concurrent callers asking for the same key share one request — see the
 * single-flight note on `cached()`.
 */

import { createStore, get, getMany, set } from "idb-keyval";
import { isAbortError } from "./http";

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
  // Renamed from "pokecol": cache holds derived data for six games now, and
  // orphaning the old database just costs one refetch.
  idbStore = createStore("cardcol", "cache");
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

/** A load already on the wire, shared by every caller that wants the same key. */
interface Inflight {
  promise: Promise<unknown>;
  /** Drives the shared loader. Aborted only once *every* caller has left. */
  controller: AbortController;
  waiters: number;
}

const inflight = new Map<string, Inflight>();

/**
 * Reject as soon as `signal` aborts, without disturbing the underlying promise.
 *
 * `onAbandon` fires only on that path — one caller walking away is not the same
 * as the work being unwanted.
 */
function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbandon: () => void,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    onAbandon();
    return Promise.reject(signal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    function onAbort() {
      cleanup();
      onAbandon();
      reject(signal!.reason);
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

/**
 * Read-through with stale-on-failure and single-flight de-duplication.
 *
 * Stale-on-failure: if `loader` rejects but we hold an expired entry, the
 * expired entry wins — outdated card art beats an error screen. Aborts always
 * propagate, since those are intentional.
 *
 * Single flight: two callers can want the same resource in the same tick — the
 * set filter and the "browse the newest set" fallback both need `/sets` the
 * moment Find Cards mounts, and StrictMode doubles each of them. Without
 * sharing that was four identical 500-set requests, which is enough to make
 * this API start returning 500s and turn a cold first load into ten seconds of
 * skeletons.
 *
 * The shared loader runs on its *own* signal rather than the first caller's, so
 * one component unmounting can't cancel the request everyone else is waiting
 * on. It is abandoned only when the last interested caller has gone.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const entry = await readEntry<T>(key);
  if (entry && isFresh(entry, ttlMs)) return entry.value;
  if (signal?.aborted) throw signal.reason;

  /*
   * Synchronous from here to the `set`: callers that missed the cache in the
   * same tick have to find each other, and an `await` in between would let them
   * both start a request.
   */
  let shared = inflight.get(key);
  if (!shared) {
    const controller = new AbortController();
    const created: Inflight = {
      controller,
      waiters: 0,
      promise: (async () => {
        const value = await loader(controller.signal);
        await writeEntry(key, value);
        return value;
      })().finally(() => {
        // Guarded: a later load for the same key may already own the slot.
        if (inflight.get(key) === created) inflight.delete(key);
      }),
    };
    inflight.set(key, created);
    shared = created;
  }

  const joined = shared;
  joined.waiters += 1;
  let abandoned = false;
  const abandon = () => {
    if (abandoned) return;
    abandoned = true;
    joined.waiters -= 1;
    // Nobody is listening any more, so finishing would spend a request from a
    // 1000/day budget on a result no one will read.
    if (joined.waiters === 0) joined.controller.abort();
  };

  try {
    return (await raceAbort(joined.promise as Promise<T>, signal, abandon)) as T;
  } catch (error) {
    if (entry && !isAbortError(error)) return entry.value;
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

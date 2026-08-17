/**
 * What a stored row needs in order to survive being edited in two places.
 *
 * Before accounts, a collection entry only carried `addedAt` and a delete was
 * the row disappearing from an array. That is unmergeable: a row missing from
 * your phone is indistinguishable from a row your phone hasn't seen yet, so the
 * naive merge silently resurrects everything you ever deleted.
 *
 * Two fields fix it. `updatedAt` gives every write an order, and `deleted`
 * turns a removal into a fact that can travel. Both are added now, while there
 * is nothing to migrate, because doing it after people have accounts means
 * migrating live data instead.
 */
export interface SyncMeta {
  /** ISO timestamp of the last write. The field a merge compares. */
  updatedAt: string;
  /** Tombstone. The row is gone as far as the UI is concerned. */
  deleted?: boolean;
}

export type Syncable<T> = T & SyncMeta;

export function now(): string {
  return new Date().toISOString();
}

/** Rows the UI should see — everything not tombstoned. */
export function live<T extends SyncMeta>(entries: T[]): T[] {
  return entries.filter((entry) => !entry.deleted);
}

/**
 * How long a tombstone is worth keeping.
 *
 * It only has to outlive the longest plausible gap between a device deleting
 * something and the next device hearing about it. Ninety days is generous for
 * "I didn't open the app all summer" and still keeps storage bounded.
 */
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function pruneTombstones<T extends SyncMeta>(entries: T[], ttlMs = TOMBSTONE_TTL_MS): T[] {
  const cutoff = Date.now() - ttlMs;
  return entries.filter((entry) => {
    if (!entry.deleted) return true;
    const at = Date.parse(entry.updatedAt);
    // An unparseable timestamp is kept rather than dropped: losing a tombstone
    // resurrects a card, which is the failure mode that actually annoys people.
    return Number.isNaN(at) || at >= cutoff;
  });
}

/**
 * Last-write-wins merge of two sets of rows, keyed by identity.
 *
 * Deliberately not a CRDT. The conflicting edits here are "I set this to 3 on
 * my laptop and 4 on my phone" — where the later number is the honest answer,
 * and no amount of merge cleverness recovers an intent the user never expressed.
 * Tombstones win ties, because undeleting something nobody asked to undelete is
 * worse than losing one late edit.
 */
export function mergeByUpdatedAt<T extends SyncMeta>(
  local: T[],
  remote: T[],
  identity: (entry: T) => string,
): T[] {
  const merged = new Map<string, T>();

  for (const entry of [...local, ...remote]) {
    const key = identity(entry);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      continue;
    }

    const a = Date.parse(existing.updatedAt) || 0;
    const b = Date.parse(entry.updatedAt) || 0;
    if (b > a) merged.set(key, entry);
    else if (b === a && entry.deleted) merged.set(key, entry);
  }

  return [...merged.values()];
}

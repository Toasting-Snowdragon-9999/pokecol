/**
 * Which user's rows a storage key refers to.
 *
 * Two people sharing a laptop should not share a binder, and signing out should
 * not hand your collection to whoever sits down next. Rather than teach every
 * store about accounts, the *key* carries the owner:
 *
 *   signed out   cardcol.collection.v4
 *   signed in    cardcol.collection.v4::u/3f9a…
 *
 * Signed-out storage keeps its original unsuffixed key, so an existing local
 * binder survives this change untouched and the app behaves exactly as it did
 * before accounts existed.
 *
 * A module-level variable rather than context because the stores are plain
 * singletons that run outside React — and the owner is set before the render
 * that reveals a new user, so nothing ever reads the wrong namespace.
 */

let owner: string | null = null;
const listeners = new Set<() => void>();

/** Namespaces a base key for the signed-in user, if any. */
export function scopedKey(baseKey: string): string {
  return owner ? `${baseKey}::u/${owner}` : baseKey;
}

export function currentStorageOwner(): string | null {
  return owner;
}

/** Called by `SessionProvider` on boot, sign-in and sign-out. */
export function setStorageOwner(next: string | null): void {
  if (owner === next) return;
  owner = next;
  listeners.forEach((listener) => listener());
}

/**
 * Notified when the namespace changes, so a store can drop cached snapshots and
 * tell its subscribers to re-read.
 */
export function onStorageOwnerChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { setStorageOwner } from "../lib/storageScope";
import { SessionContext } from "./context";
import type { SessionContextValue } from "./context";
import { authStore } from "./store";
import type { AuthStore, Credentials, SignUpDetails, User } from "./types";

/**
 * Who is signed in.
 *
 * Mounted above every other provider, because the collection, wishlist and
 * layout stores all read from a storage namespace that depends on the answer.
 * Signing in or out re-keys that namespace, which is what stops two profiles on
 * one laptop from sharing a binder.
 */
export function SessionProvider({
  children,
  store = authStore,
}: {
  children: ReactNode;
  store?: AuthStore;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const session = await store.current().catch(() => null);
      if (!active) return;
      // Set the namespace before the state, so the render that reveals a new
      // user is already reading that user's rows.
      setStorageOwner(session?.user.id ?? null);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    void refresh();
    const unsubscribe = store.subscribe(() => void refresh());

    return () => {
      active = false;
      unsubscribe();
    };
  }, [store]);

  const signIn = useCallback(
    async (credentials: Credentials) => {
      const session = await store.signIn(credentials);
      setStorageOwner(session.user.id);
      setUser(session.user);
      return session;
    },
    [store],
  );

  const signUp = useCallback(
    async (details: SignUpDetails) => {
      const session = await store.signUp(details);
      setStorageOwner(session.user.id);
      setUser(session.user);
      return session;
    },
    [store],
  );

  const signOut = useCallback(async () => {
    await store.signOut();
    setStorageOwner(null);
    setUser(null);
  }, [store]);

  const value = useMemo<SessionContextValue>(
    () => ({ user, loading, mode: store.mode, signIn, signUp, signOut }),
    [user, loading, store.mode, signIn, signUp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

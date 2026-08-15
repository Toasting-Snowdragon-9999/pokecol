import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cardKey } from "../core/games";
import type { GameId } from "../core/games";
import { useActiveGame } from "../game/context";
import { WishlistContext } from "./context";
import type { WishlistContextValue } from "./context";
import { wishlistKey, wishlistStore } from "./store";
import type { WishlistEntry, WishlistStore } from "./store";

export function WishlistProvider({
  children,
  store = wishlistStore,
}: {
  children: ReactNode;
  store?: WishlistStore;
}) {
  const { gameId: activeGame } = useActiveGame();
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const refresh = async () => {
      const next = await store.list(activeGame);
      if (active) {
        setEntries(next);
        setLoading(false);
      }
    };

    void refresh();
    const unsubscribe = store.subscribe(() => void refresh());

    return () => {
      active = false;
      unsubscribe();
    };
  }, [store, activeGame]);

  /** Exact printing wanted. */
  const byVariant = useMemo(
    () => new Set(entries.map((entry) => wishlistKey(entry.gameId, entry.cardId, entry.variantId))),
    [entries],
  );

  /** Any printing wanted — what the "on wishlist" marker actually means. */
  const byCard = useMemo(
    () => new Set(entries.map((entry) => cardKey(entry.gameId, entry.cardId))),
    [entries],
  );

  const isWanted = useCallback(
    (cardId: string, gameId: GameId = activeGame) => byCard.has(cardKey(gameId, cardId)),
    [byCard, activeGame],
  );

  const wantsVariant = useCallback(
    (cardId: string, variantId: string, gameId: GameId = activeGame) =>
      byVariant.has(wishlistKey(gameId, cardId, variantId)),
    [byVariant, activeGame],
  );

  const value = useMemo<WishlistContextValue>(
    () => ({
      entries,
      loading,
      isWanted,
      wantsVariant,
      add: (cardId, variantId, gameId = activeGame) => store.add(gameId, cardId, variantId),
      remove: (cardId, variantId, gameId = activeGame) => store.remove(gameId, cardId, variantId),
      setVariant: (cardId, from, to, gameId = activeGame) =>
        store.setVariant(gameId, cardId, from, to),
      clear: () => store.clear(activeGame),
      count: entries.length,
    }),
    [entries, loading, isWanted, wantsVariant, store, activeGame],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

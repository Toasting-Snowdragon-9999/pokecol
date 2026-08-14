import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GameId } from "../core/types";
import { DEFAULT_GAME } from "../core/registry";
import { CollectionContext } from "./context";
import type { CollectionContextValue } from "./context";
import { collectionStore } from "./store";
import type { CollectionEntry, CollectionStore } from "./store";

export function CollectionProvider({
  children,
  store = collectionStore,
}: {
  children: ReactNode;
  store?: CollectionStore;
}) {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const next = await store.list();
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
  }, [store]);

  const byKey = useMemo(() => {
    const map = new Map<string, CollectionEntry>();
    for (const entry of entries) map.set(`${entry.gameId}:${entry.cardId}`, entry);
    return map;
  }, [entries]);

  const quantityOf = useCallback(
    (cardId: string, gameId: GameId = DEFAULT_GAME) =>
      byKey.get(`${gameId}:${cardId}`)?.quantity ?? 0,
    [byKey],
  );

  const setQuantity = useCallback(
    async (cardId: string, quantity: number, gameId: GameId = DEFAULT_GAME) => {
      await store.setQuantity(gameId, cardId, quantity);
    },
    [store],
  );

  const value = useMemo<CollectionContextValue>(
    () => ({
      entries,
      loading,
      quantityOf,
      isOwned: (cardId, gameId) => quantityOf(cardId, gameId) > 0,
      add: (cardId, gameId = DEFAULT_GAME) =>
        setQuantity(cardId, quantityOf(cardId, gameId) + 1, gameId),
      remove: (cardId, gameId = DEFAULT_GAME) => setQuantity(cardId, 0, gameId),
      setQuantity,
      clear: () => store.clear(),
      uniqueCards: entries.length,
      totalCards: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    }),
    [entries, loading, quantityOf, setQuantity, store],
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

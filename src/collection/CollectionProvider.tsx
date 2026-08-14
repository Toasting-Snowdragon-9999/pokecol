import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GameId } from "../core/types";
import { DEFAULT_GAME } from "../core/registry";
import { CollectionContext } from "./context";
import type { CollectionContextValue } from "./context";
import { collectionStore, entryKey } from "./store";
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

  /** Exact printing → entry. */
  const byVariant = useMemo(() => {
    const map = new Map<string, CollectionEntry>();
    for (const entry of entries) {
      map.set(entryKey(entry.gameId, entry.cardId, entry.variantId), entry);
    }
    return map;
  }, [entries]);

  /** Card → every printing owned of it. Keeps card-level lookups O(1). */
  const byCard = useMemo(() => {
    const map = new Map<string, CollectionEntry[]>();
    for (const entry of entries) {
      const key = `${entry.gameId}:${entry.cardId}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    return map;
  }, [entries]);

  const quantityOf = useCallback(
    (cardId: string, gameId: GameId = DEFAULT_GAME) =>
      (byCard.get(`${gameId}:${cardId}`) ?? []).reduce((sum, entry) => sum + entry.quantity, 0),
    [byCard],
  );

  const quantityOfVariant = useCallback(
    (cardId: string, variantId: string, gameId: GameId = DEFAULT_GAME) =>
      byVariant.get(entryKey(gameId, cardId, variantId))?.quantity ?? 0,
    [byVariant],
  );

  const variantsOwned = useCallback(
    (cardId: string, gameId: GameId = DEFAULT_GAME) =>
      (byCard.get(`${gameId}:${cardId}`) ?? []).map((entry) => entry.variantId),
    [byCard],
  );

  const setQuantity = useCallback(
    async (
      cardId: string,
      variantId: string,
      quantity: number,
      gameId: GameId = DEFAULT_GAME,
    ) => {
      await store.setQuantity(gameId, cardId, variantId, quantity);
    },
    [store],
  );

  const value = useMemo<CollectionContextValue>(
    () => ({
      entries,
      loading,
      quantityOf,
      quantityOfVariant,
      variantsOwned,
      isOwned: (cardId, gameId) => quantityOf(cardId, gameId) > 0,
      add: (cardId, variantId, gameId = DEFAULT_GAME) =>
        setQuantity(cardId, variantId, quantityOfVariant(cardId, variantId, gameId) + 1, gameId),
      remove: (cardId, variantId, gameId = DEFAULT_GAME) =>
        setQuantity(cardId, variantId, 0, gameId),
      setQuantity,
      clear: () => store.clear(),
      // A card owned in three printings is still one card in the binder.
      uniqueCards: byCard.size,
      totalCards: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    }),
    [entries, loading, quantityOf, quantityOfVariant, variantsOwned, setQuantity, store, byCard],
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

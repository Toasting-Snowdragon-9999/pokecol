import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cardKey } from "../core/games";
import type { GameId } from "../core/games";
import { useActiveGame } from "../game/context";
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
  const { gameId: activeGame } = useActiveGame();
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Switching games swaps the whole collection, so show the loading state
    // rather than briefly rendering the previous game's cards.
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
      const key = cardKey(entry.gameId, entry.cardId);
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    return map;
  }, [entries]);

  /*
   * An omitted `gameId` means "the game on screen". Cards carry their own
   * `gameId` and callers pass it, so this only fills in for the few places that
   * don't have a card to hand.
   */
  const quantityOf = useCallback(
    (cardId: string, gameId: GameId = activeGame) =>
      (byCard.get(cardKey(gameId, cardId)) ?? []).reduce((sum, entry) => sum + entry.quantity, 0),
    [byCard, activeGame],
  );

  const quantityOfVariant = useCallback(
    (cardId: string, variantId: string, gameId: GameId = activeGame) =>
      byVariant.get(entryKey(gameId, cardId, variantId))?.quantity ?? 0,
    [byVariant, activeGame],
  );

  const variantsOwned = useCallback(
    (cardId: string, gameId: GameId = activeGame) =>
      (byCard.get(cardKey(gameId, cardId)) ?? []).map((entry) => entry.variantId),
    [byCard, activeGame],
  );

  const setQuantity = useCallback(
    async (
      cardId: string,
      variantId: string,
      quantity: number,
      gameId: GameId = activeGame,
    ) => {
      await store.setQuantity(gameId, cardId, variantId, quantity);
    },
    [store, activeGame],
  );

  const value = useMemo<CollectionContextValue>(
    () => ({
      entries,
      loading,
      quantityOf,
      quantityOfVariant,
      variantsOwned,
      isOwned: (cardId, gameId) => quantityOf(cardId, gameId) > 0,
      add: (cardId, variantId, gameId = activeGame) =>
        setQuantity(cardId, variantId, quantityOfVariant(cardId, variantId, gameId) + 1, gameId),
      remove: (cardId, variantId, gameId = activeGame) =>
        setQuantity(cardId, variantId, 0, gameId),
      setQuantity,
      clear: () => store.clear(activeGame),
      // A card owned in three printings is still one card in the binder.
      uniqueCards: byCard.size,
      totalCards: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    }),
    [
      entries,
      loading,
      quantityOf,
      quantityOfVariant,
      variantsOwned,
      setQuantity,
      store,
      byCard,
      activeGame,
    ],
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

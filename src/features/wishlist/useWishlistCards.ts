import { useCallback, useEffect, useMemo, useState } from "react";
import type { Card } from "../../core/types";
import { useActiveGame } from "../../game/context";
import { useWishlist } from "../../wishlist/context";

interface WishlistCardsResult {
  cards: Map<string, Card>;
  loading: boolean;
  error: unknown;
  retry: () => void;
}

/**
 * Resolves wishlist entries into cards, keyed by card id.
 *
 * Same shape as `useCollectionCards` and pointed at the same provider cache, so
 * a card that's already been seen in search or the binder costs no request.
 * Returns a map rather than a sorted list because the wishlist's own order
 * (newest first) belongs to the store, not to this.
 */
export function useWishlistCards(): WishlistCardsResult {
  const { provider } = useActiveGame();
  const { entries, loading: entriesLoading } = useWishlist();
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  const idKey = useMemo(
    () => [...new Set(entries.map((entry) => entry.cardId))].sort().join(","),
    [entries],
  );

  useEffect(() => {
    if (entriesLoading) return;

    if (idKey === "") {
      setCards(new Map());
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    provider
      .getCardsByIds(idKey.split(","), controller.signal)
      .then((resolved) => {
        if (controller.signal.aborted) return;
        setCards(new Map(resolved.map((card) => [card.id, card])));
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause);
        setLoading(false);
      });

    return () => controller.abort();
  }, [idKey, entriesLoading, attempt, provider]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { cards, loading: loading || entriesLoading, error, retry };
}

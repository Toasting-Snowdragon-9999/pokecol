import { useCallback, useEffect, useMemo, useState } from "react";
import type { Card } from "../core/types";
import { DEFAULT_GAME, getProvider } from "../core/registry";
import { isAbortError } from "../lib/http";
import { compareCardsForBinder } from "../lib/sortCards";
import { useCollection } from "./context";

interface CollectionCardsResult {
  cards: Card[];
  loading: boolean;
  error: unknown;
  retry: () => void;
}

/**
 * Turns collection entries into real cards, sorted into binder order.
 *
 * Keyed on the *set of ids* rather than the entries array, so bumping a
 * quantity re-renders without triggering a refetch.
 */
export function useCollectionCards(): CollectionCardsResult {
  const { entries, loading: entriesLoading } = useCollection();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  const ids = useMemo(
    () => entries.map((entry) => entry.cardId).sort(),
    [entries],
  );
  const idKey = ids.join(",");

  useEffect(() => {
    if (entriesLoading) return;

    if (idKey === "") {
      setCards([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getProvider(DEFAULT_GAME)
      .getCardsByIds(idKey.split(","), controller.signal)
      .then((resolved) => {
        if (controller.signal.aborted) return;
        setCards([...resolved].sort(compareCardsForBinder));
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setError(cause);
        setLoading(false);
      });

    return () => controller.abort();
  }, [idKey, entriesLoading, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { cards, loading: loading || entriesLoading, error, retry };
}

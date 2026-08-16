import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "../../core/types";
import { useActiveGame } from "../../game/context";

/** Small enough to keep a page of artwork light; well under the API's 60 ceiling. */
export const PAGE_SIZE = 24;

interface SearchState {
  cards: Card[];
  totalCount: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
}

/**
 * Append a page, dropping ids already on screen.
 *
 * Paged APIs repeat rows across page boundaries — a set released mid-scroll,
 * or a non-deterministic sort. Appending blind produced two grid items with the
 * same React key, at which point React collapses them and the grid quietly
 * loses a card.
 */
function appendUnique(existing: Card[], incoming: Card[]): Card[] {
  const seen = new Set(existing.map((card) => card.id));
  const fresh = incoming.filter((card) => !seen.has(card.id));
  return fresh.length === incoming.length ? [...existing, ...incoming] : [...existing, ...fresh];
}

const INITIAL: SearchState = {
  cards: [],
  totalCount: 0,
  hasMore: false,
  loading: true,
  loadingMore: false,
  error: null,
};

/**
 * Paged search that appends rather than replaces, so scrolling back up keeps
 * everything already fetched. Any in-flight request is aborted when the query
 * changes — both to keep results consistent and to avoid burning requests.
 */
export function useCardSearch(query: string, setId: string) {
  const { provider } = useActiveGame();
  const [state, setState] = useState<SearchState>(INITIAL);
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const pageRef = useRef(1);
  // Guarded with a ref rather than reading state: `loadMore` can fire several
  // times before React commits, and each duplicate would cost a real request.
  const busyRef = useRef(false);
  const hasMoreRef = useRef(false);

  const run = useCallback(
    async (page: number, mode: "replace" | "append") => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      busyRef.current = true;

      setState((prev) => ({
        ...prev,
        loading: mode === "replace",
        loadingMore: mode === "append",
        error: null,
      }));

      try {
        const result = await provider.searchCards({
          query,
          setId,
          page,
          pageSize: PAGE_SIZE,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        pageRef.current = page;
        hasMoreRef.current = result.hasMore;
        busyRef.current = false;
        setState((prev) => ({
          cards: mode === "append" ? appendUnique(prev.cards, result.items) : result.items,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
          loading: false,
          loadingMore: false,
          error: null,
        }));
      } catch (error) {
        /*
         * Only *our* abort means a newer run is already on its way and will set
         * the next state. An abort arriving from anywhere else still has to
         * clear `loading`, or the page sits on skeletons forever.
         */
        if (controller.signal.aborted) return;
        busyRef.current = false;
        setState((prev) => ({ ...prev, loading: false, loadingMore: false, error }));
      }
    },
    // `provider` changes identity when the game does, which re-runs the search
    // against the new catalogue and discards the previous game's results.
    [query, setId, provider],
  );

  useEffect(() => {
    hasMoreRef.current = false;
    void run(1, "replace");
    return () => controllerRef.current?.abort();
  }, [run, attempt]);

  const loadMore = useCallback(() => {
    if (busyRef.current || !hasMoreRef.current) return;
    void run(pageRef.current + 1, "append");
  }, [run]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { ...state, loadMore, retry };
}

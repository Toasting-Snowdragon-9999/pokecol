import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "../../core/types";
import { DEFAULT_GAME, getProvider } from "../../core/registry";
import { isAbortError } from "../../lib/http";

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
        const result = await getProvider(DEFAULT_GAME).searchCards({
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
          cards: mode === "append" ? [...prev.cards, ...result.items] : result.items,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
          loading: false,
          loadingMore: false,
          error: null,
        }));
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        busyRef.current = false;
        setState((prev) => ({ ...prev, loading: false, loadingMore: false, error }));
      }
    },
    [query, setId],
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

import { useEffect, useMemo, useState } from "react";
import type { CardSet } from "../../core/types";
import { useActiveGame } from "../../game/context";

export interface SetGroup {
  series: string;
  sets: CardSet[];
}

/**
 * All 174 sets arrive in one cached request, so the filter can be a plain
 * grouped <select> with no searching or paging of its own.
 */
export function useSets() {
  const { provider } = useActiveGame();
  const [sets, setSets] = useState<CardSet[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Never show the previous game's sets while the new list loads.
    setSets([]);
    setError(null);

    if (!provider.capabilities.setFilter || provider.unavailableReason) return;

    provider
      .listSets(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSets(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause);
      });

    return () => controller.abort();
  }, [provider]);

  // Provider returns newest first; preserve that order for both series and sets.
  const groups = useMemo<SetGroup[]>(() => {
    const bySeries = new Map<string, CardSet[]>();
    for (const set of sets) {
      const series = set.series ?? "Other";
      const bucket = bySeries.get(series);
      if (bucket) bucket.push(set);
      else bySeries.set(series, [set]);
    }
    return [...bySeries].map(([series, grouped]) => ({ series, sets: grouped }));
  }, [sets]);

  return { sets, groups, error };
}

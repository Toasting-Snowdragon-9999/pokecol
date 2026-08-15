import { useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "../../core/types";
import { useActiveGame } from "../../game/context";
import { isAbortError } from "../../lib/http";

export type SetRosters = Map<string, Card[]>;

/**
 * Full card lists for the sets the collection touches.
 *
 * Fetched lazily and one set at a time: a roster costs several requests against
 * a 1000/day anonymous budget, so nothing is fetched speculatively and each set
 * is attempted only once per session. Results are cached for 30 days by the
 * provider, so this is normally a no-op on later visits.
 *
 * Rosters are only needed for full-set layout and exact completion counts, so
 * the binder stays fully usable while they load — or if they never arrive.
 */
export function useSetRosters(setIds: string[], enabled: boolean): SetRosters {
  const { provider } = useActiveGame();
  const [rosters, setRosters] = useState<SetRosters>(new Map());
  // Never retry a set within a session; a failing roster shouldn't loop on the
  // API budget, and the binder degrades gracefully without it.
  const attempted = useRef(new Set<string>());

  const key = useMemo(() => [...setIds].sort().join(","), [setIds]);

  useEffect(() => {
    // Set ids are only unique within a game, so a roster fetched for one game
    // must never satisfy a lookup in another.
    setRosters(new Map());
    attempted.current = new Set<string>();
  }, [provider]);

  useEffect(() => {
    if (!enabled || key === "") return;

    const controller = new AbortController();
    let active = true;

    void (async () => {
      for (const setId of key.split(",")) {
        if (!active || attempted.current.has(setId)) continue;
        attempted.current.add(setId);

        try {
          const cards = await provider.getSetCards(setId, controller.signal);
          if (!active || controller.signal.aborted) return;
          setRosters((previous) => new Map(previous).set(setId, cards));
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return;
          // Allow a later attempt for this set if the user comes back to it.
          attempted.current.delete(setId);
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [key, enabled, provider]);

  return rosters;
}

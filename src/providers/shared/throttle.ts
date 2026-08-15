/**
 * Per-provider request spacing.
 *
 * The APIs behind CardCol have wildly different tolerances and wildly different
 * punishments. Scryfall and Lorcast ask for 50–100ms between requests and
 * answer a burst with a 30-second cooling-off; YGOPRODeck allows far more
 * throughput but bans the caller for a *full hour* on breach. A single global
 * constant would either crawl or get us blocked, so each adapter declares its
 * own spacing and everything it issues goes through that adapter's gate.
 */

export interface Throttle {
  /** Resolves when it is this caller's turn. */
  <T>(task: () => Promise<T>): Promise<T>;
}

/**
 * Serialises callers and holds `minGapMs` between the *start* of each.
 *
 * Deliberately a queue rather than a token bucket: these limits are about not
 * hammering someone else's free service, and a queue degrades into "slower"
 * rather than into "a burst, then a wall".
 */
export function createThrottle(minGapMs: number): Throttle {
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  return function throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(async () => {
      const wait = lastStart + minGapMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      return task();
    });

    // The queue must keep moving even when a task rejects, so the chain that
    // the *next* caller waits on swallows the failure the caller still sees.
    tail = run.catch(() => undefined);
    return run;
  };
}

/** No spacing — for APIs that are explicit about not needing it. */
export const noThrottle: Throttle = <T>(task: () => Promise<T>) => task();

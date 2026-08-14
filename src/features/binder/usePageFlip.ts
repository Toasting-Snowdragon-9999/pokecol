import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../lib/useMediaQuery";

const FLIP_DURATION_MS = 520;
const FLIP_EASING = "cubic-bezier(0.3, 0.1, 0.2, 1)";
/**
 * Safety net for a turn that never lands.
 *
 * A backgrounded or throttled tab stops painting, and a Web Animation started
 * in that state stays play-pending forever — `startTime` never gets set, so
 * `onfinish` never fires. Without this the leaf would sit frozen mid-turn and
 * the binder would stop responding to page changes.
 */
const FLIP_WATCHDOG_MS = FLIP_DURATION_MS + 260;

/**
 * A flip in progress.
 *
 * The leaf is always the same element with the same geometry: hinged at the
 * spine, angle 0 = lying flat on the right, -180 = lying flat on the left.
 * Turning forward runs 0 → -180 and turning back runs -180 → 0, so both
 * directions share one code path.
 *
 * `lowIndex`/`highIndex` are the two spreads either side of the leaf, which is
 * what lets the caller work out which pages to paint on each face without
 * caring about direction.
 */
export interface ActiveFlip {
  lowIndex: number;
  highIndex: number;
  /** Spread index committed when the animation lands. */
  target: number;
  from: number;
  to: number;
}

export interface PageFlipController {
  spread: number;
  flip: ActiveFlip | null;
  isFlipping: boolean;
  leafRef: React.RefObject<HTMLDivElement | null>;
  shadowRef: React.RefObject<HTMLDivElement | null>;
  goNext: () => void;
  goPrev: () => void;
  goTo: (index: number) => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

export function usePageFlip(spreadCount: number): PageFlipController {
  const [spread, setSpread] = useState(0);
  const [flip, setFlip] = useState<ActiveFlip | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Refs shadow the state because a rapid second click has to read the
  // *settled* page synchronously — React hasn't committed the first one yet.
  const spreadRef = useRef(0);
  const flipRef = useRef<ActiveFlip | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leafRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);

  /**
   * Land any in-flight flip immediately, synchronously. This is what stops
   * mashing the arrows from desynchronising the binder: the interrupted turn is
   * treated as completed, so five fast clicks advance exactly five pages.
   */
  const settle = useCallback(() => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    const animation = animationRef.current;
    if (animation) {
      animation.onfinish = null;
      animation.cancel();
      animationRef.current = null;
    }
    const pending = flipRef.current;
    if (pending) {
      spreadRef.current = pending.target;
      flipRef.current = null;
    }
  }, []);

  const goTo = useCallback(
    (index: number) => {
      settle();

      const current = spreadRef.current;
      const target = Math.max(0, Math.min(index, spreadCount - 1));
      if (target === current) {
        // Still flush any interrupted flip into rendered state.
        setSpread(current);
        setFlip(null);
        return;
      }

      // Only ever turn one leaf at a time; a jump lands on the adjacent page.
      const step = target > current ? 1 : -1;
      const next = current + step;
      const forward = step > 0;

      const pending: ActiveFlip = {
        lowIndex: forward ? current : next,
        highIndex: forward ? next : current,
        target: next,
        from: forward ? 0 : -180,
        to: forward ? -180 : 0,
      };

      // No point animating a page nobody is looking at — a hidden tab would
      // leave the animation pending anyway.
      if (reducedMotion || document.hidden) {
        spreadRef.current = next;
        setSpread(next);
        setFlip(null);
        return;
      }

      flipRef.current = pending;
      setSpread(current);
      setFlip(pending);
    },
    [reducedMotion, settle, spreadCount],
  );

  const goNext = useCallback(() => goTo(spreadRef.current + 1), [goTo]);
  const goPrev = useCallback(() => goTo(spreadRef.current - 1), [goTo]);

  // Start the animation once the leaf has rendered with its new faces.
  // Layout effect so it runs before paint and the leaf never flashes at rest.
  useLayoutEffect(() => {
    const leaf = leafRef.current;
    if (!flip || !leaf) return;

    const timing: KeyframeAnimationOptions = {
      duration: FLIP_DURATION_MS,
      easing: FLIP_EASING,
      fill: "forwards",
    };

    const animation = leaf.animate(
      [{ transform: `rotateY(${flip.from}deg)` }, { transform: `rotateY(${flip.to}deg)` }],
      timing,
    );
    animationRef.current = animation;

    // Shadow sweeps in and back out as the page passes overhead.
    shadowRef.current?.animate([{ opacity: 0 }, { opacity: 0.45 }, { opacity: 0 }], timing);

    // Land the turn exactly once, whether the animation finished properly or
    // the watchdog had to step in.
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      if (watchdogRef.current !== null) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      animationRef.current = null;
      flipRef.current = null;
      spreadRef.current = flip.target;
      setSpread(flip.target);
      setFlip(null);
    };

    animation.onfinish = land;
    watchdogRef.current = setTimeout(land, FLIP_WATCHDOG_MS);

    return () => {
      animation.onfinish = null;
      if (watchdogRef.current !== null) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
  }, [flip]);

  // Cards can be added or removed while the binder is open; never strand the
  // reader on a page that no longer exists.
  useEffect(() => {
    const max = Math.max(0, spreadCount - 1);
    if (spreadRef.current > max) {
      settle();
      spreadRef.current = max;
      setSpread(max);
      setFlip(null);
    }
  }, [spreadCount, settle]);

  useEffect(() => {
    return () => {
      animationRef.current?.cancel();
      animationRef.current = null;
      if (watchdogRef.current !== null) clearTimeout(watchdogRef.current);
    };
  }, []);

  return {
    spread,
    flip,
    isFlipping: flip !== null,
    leafRef,
    shadowRef,
    goNext,
    goPrev,
    goTo,
    canGoNext: spread < spreadCount - 1,
    canGoPrev: spread > 0,
  };
}

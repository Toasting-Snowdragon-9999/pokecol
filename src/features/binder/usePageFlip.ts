import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../lib/useMediaQuery";

const FLIP_DURATION_MS = 520;
const FLIP_EASING = "cubic-bezier(0.3, 0.1, 0.2, 1)";
/**
 * Releasing a dragged page. Eased out only and scaled to the arc still to
 * travel, because the leaf is already moving — a full-length ease-in-out here
 * would read as the page stalling the moment you let go.
 */
const SETTLE_EASING = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const SETTLE_MIN_MS = 130;
/** Peak darkness of the travelling shadow, shared by both drivers. */
const SHADOW_PEAK = 0.45;

const WATCHDOG_SLACK_MS = 260;
/**
 * Safety net for a turn that never lands.
 *
 * A backgrounded or throttled tab stops painting, and a Web Animation started
 * in that state stays play-pending forever — `startTime` never gets set, so
 * `onfinish` never fires. Without this the leaf would sit frozen mid-turn and
 * the binder would stop responding to page changes.
 */
const FLIP_WATCHDOG_MS = FLIP_DURATION_MS + WATCHDOG_SLACK_MS;

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
  /**
   * The angle is being written by a pointer drag rather than by an animation.
   * The leaf still mounts exactly the same way — only its driver differs.
   */
  scrub: boolean;
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
  /**
   * Mount the leaf at rest and hand its angle to the caller. Returns false when
   * the turn can't be scrubbed — no page that way, or reduced motion — and the
   * caller should fall back to `goNext`/`goPrev`.
   */
  beginScrub: (direction: "next" | "prev") => boolean;
  /** Drive the mounted leaf. `progress` is 0 (at rest) to 1 (fully turned). */
  scrubTo: (progress: number) => void;
  /** Release: animate the rest of the arc and commit, or spring back and drop. */
  endScrub: (commit: boolean) => void;
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

  // A scrub the pointer is still holding, plus the angle it has reached. The
  // angle lives in a ref rather than in state so a drag never rerenders.
  const scrubRef = useRef<ActiveFlip | null>(null);
  const scrubAngleRef = useRef(0);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  /** Finish a turn: adopt `target` as the page and unmount the leaf. */
  const land = useCallback(
    (target: number) => {
      clearWatchdog();
      animationRef.current = null;
      flipRef.current = null;
      scrubRef.current = null;
      spreadRef.current = target;
      setSpread(target);
      setFlip(null);
    },
    [clearWatchdog],
  );

  /**
   * Land any in-flight flip immediately, synchronously. This is what stops
   * mashing the arrows from desynchronising the binder: the interrupted turn is
   * treated as completed, so five fast clicks advance exactly five pages.
   */
  const settle = useCallback(() => {
    clearWatchdog();
    const animation = animationRef.current;
    if (animation) {
      animation.onfinish = null;
      animation.cancel();
      animationRef.current = null;
    }
    const pending = flipRef.current;
    if (pending) {
      /*
       * A drag still under the finger is abandoned where it started, not
       * completed. The reader never let go, so no turn was ever asked for —
       * committing one because an arrow key arrived mid-drag would move the
       * binder somewhere nobody chose. A released drag has already rewritten
       * `target` to whatever it settles on, so this stays correct there too.
       */
      if (!scrubRef.current) spreadRef.current = pending.target;
      scrubRef.current = null;
      flipRef.current = null;
    }
  }, [clearWatchdog]);

  /**
   * Work out the leaf for a move to `index`, or null if it goes nowhere.
   * Shared by the button/keyboard path and the drag path so both mount exactly
   * the same leaf and can hand off to each other.
   */
  const planFlip = useCallback(
    (index: number): ActiveFlip | null => {
      const current = spreadRef.current;
      const target = Math.max(0, Math.min(index, spreadCount - 1));
      if (target === current) return null;

      // Only ever turn one leaf at a time; a jump lands on the adjacent page.
      const step = target > current ? 1 : -1;
      const next = current + step;
      const forward = step > 0;

      return {
        lowIndex: forward ? current : next,
        highIndex: forward ? next : current,
        target: next,
        from: forward ? 0 : -180,
        to: forward ? -180 : 0,
        scrub: false,
      };
    },
    [spreadCount],
  );

  const goTo = useCallback(
    (index: number) => {
      settle();

      const pending = planFlip(index);
      if (!pending) {
        // Still flush any interrupted flip into rendered state.
        setSpread(spreadRef.current);
        setFlip(null);
        return;
      }

      // No point animating a page nobody is looking at — a hidden tab would
      // leave the animation pending anyway.
      if (reducedMotion || document.hidden) {
        spreadRef.current = pending.target;
        setSpread(pending.target);
        setFlip(null);
        return;
      }

      flipRef.current = pending;
      setSpread(spreadRef.current);
      setFlip(pending);
    },
    [planFlip, reducedMotion, settle],
  );

  /**
   * Step one page relative to the *settled* binder.
   *
   * The settle has to happen before the arithmetic, not inside `goTo`. Read
   * first and a second click during a turn computes its target from the page
   * still on screen — which `goTo` then settles onto, making target and current
   * the same page and turning nothing. Every other click in a fast run was
   * being swallowed that way, so five clicks advanced three pages.
   */
  const goBy = useCallback(
    (step: number) => {
      settle();
      goTo(spreadRef.current + step);
    },
    [goTo, settle],
  );

  const goNext = useCallback(() => goBy(1), [goBy]);
  const goPrev = useCallback(() => goBy(-1), [goBy]);

  const beginScrub = useCallback(
    (direction: "next" | "prev") => {
      // Reduced motion means no half-turned page hanging off the spine; the
      // caller turns the page outright instead.
      if (reducedMotion || document.hidden) return false;

      settle();
      const pending = planFlip(spreadRef.current + (direction === "next" ? 1 : -1));
      if (!pending) {
        setSpread(spreadRef.current);
        setFlip(null);
        return false;
      }

      const scrubbed: ActiveFlip = { ...pending, scrub: true };
      scrubAngleRef.current = scrubbed.from;
      scrubRef.current = scrubbed;
      flipRef.current = scrubbed;
      setSpread(spreadRef.current);
      setFlip(scrubbed);
      return true;
    },
    [planFlip, reducedMotion, settle, setSpread],
  );

  const scrubTo = useCallback((progress: number) => {
    const active = scrubRef.current;
    if (!active) return;

    const clamped = Math.min(1, Math.max(0, progress));
    const angle = active.from + (active.to - active.from) * clamped;
    scrubAngleRef.current = angle;

    /*
     * Written straight to the element. Routing a drag through React state would
     * rerender the whole binder — two full sheets of card art — on every
     * pointermove; this touches one transform and reads no layout, so the drag
     * costs a compositor update and nothing else.
     */
    const leaf = leafRef.current;
    if (leaf) leaf.style.transform = `rotateY(${angle}deg)`;

    // Same arc the animated sweep uses: darkest as the page passes overhead.
    const shadow = shadowRef.current;
    if (shadow) shadow.style.opacity = String(Math.sin(clamped * Math.PI) * SHADOW_PEAK);
  }, []);

  const endScrub = useCallback(
    (commit: boolean) => {
      const active = scrubRef.current;
      if (!active) return;
      scrubRef.current = null;

      const start = scrubAngleRef.current;
      const end = commit ? active.to : active.from;
      /*
       * Springing back means no turn happened, so from here the leaf "lands" on
       * the page it started from. Keeping that in `flipRef` is what lets
       * `settle()` interrupt the spring-back without committing a turn the
       * reader deliberately abandoned.
       */
      const resting: ActiveFlip = {
        ...active,
        scrub: false,
        target: commit ? active.target : spreadRef.current,
      };
      flipRef.current = resting;

      const leaf = leafRef.current;
      if (!leaf || start === end) {
        land(resting.target);
        return;
      }

      // Proportional to the arc left to travel, so a page released just shy of
      // the spine snaps shut instead of drifting.
      const remaining = Math.abs(end - start) / 180;
      const duration = Math.max(SETTLE_MIN_MS, FLIP_DURATION_MS * remaining);
      const timing: KeyframeAnimationOptions = {
        duration,
        easing: SETTLE_EASING,
        fill: "forwards",
      };

      const animation = leaf.animate(
        [{ transform: `rotateY(${start}deg)` }, { transform: `rotateY(${end}deg)` }],
        timing,
      );
      animationRef.current = animation;

      // Both endings are flat against a page — fully turned or back at rest —
      // so the shadow fades out either way, just from wherever the drag left it.
      const shadow = shadowRef.current;
      if (shadow) {
        const held = Math.sin((Math.abs(start - active.from) / 180) * Math.PI) * SHADOW_PEAK;
        shadow.animate([{ opacity: String(held) }, { opacity: "0" }], timing);
      }

      let landed = false;
      const finish = () => {
        if (landed) return;
        landed = true;
        land(resting.target);
      };
      animation.onfinish = finish;
      watchdogRef.current = setTimeout(finish, duration + WATCHDOG_SLACK_MS);
    },
    [land],
  );

  // Start the animation once the leaf has rendered with its new faces.
  // Layout effect so it runs before paint and the leaf never flashes at rest.
  useLayoutEffect(() => {
    const leaf = leafRef.current;
    if (!flip || !leaf) return;

    /*
     * A scrub has no animation to start: the pointer owns the angle. Park the
     * leaf where the drag has already reached — moves can arrive before React
     * has mounted it, and those must not be lost or the page would jump on the
     * next one.
     */
    if (flip.scrub) {
      leaf.style.transform = `rotateY(${scrubAngleRef.current}deg)`;
      return;
    }

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
    shadowRef.current?.animate([{ opacity: 0 }, { opacity: SHADOW_PEAK }, { opacity: 0 }], timing);

    // Land the turn exactly once, whether the animation finished properly or
    // the watchdog had to step in.
    let landed = false;
    const finish = () => {
      if (landed) return;
      landed = true;
      land(flip.target);
    };

    animation.onfinish = finish;
    watchdogRef.current = setTimeout(finish, FLIP_WATCHDOG_MS);

    return () => {
      animation.onfinish = null;
      clearWatchdog();
    };
  }, [flip, land, clearWatchdog]);

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
    beginScrub,
    scrubTo,
    endScrub,
  };
}

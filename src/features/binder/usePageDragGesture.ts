import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Outer band of each page that turns no matter what else is on the sheet. Wide
 * enough to hit on a phone, narrow enough that it never eats a card.
 */
const EDGE_ZONE_RATIO = 0.12;
/** Movement before a press becomes a page drag, so a tap still opens a card. */
const START_THRESHOLD_PX = 8;
/** Fraction of a page's width that has to be dragged for the turn to complete. */
const COMMIT_RATIO = 0.35;
/** A flick this fast completes the turn however far it actually travelled. */
const FLICK_VELOCITY_PX_PER_MS = 0.5;
/** Below this, a fast pointer is a twitch on release rather than a flick. */
const FLICK_MIN_PROGRESS = 0.05;

/**
 * `pending` — pressed, but not yet past the threshold that separates a tap from
 * a drag. `scrub` — the leaf is mounted and following the pointer. `coarse` —
 * reduced motion declined the scrub, so the gesture is measured but nothing
 * moves until release.
 */
type GestureMode = "pending" | "scrub" | "coarse";

interface Gesture {
  pointerId: number;
  originX: number;
  originY: number;
  /** Width of one page — the travel that equals a complete turn. */
  pageWidth: number;
  mode: GestureMode;
  direction: "next" | "prev" | null;
  progress: number;
  lastX: number;
  lastT: number;
  velocity: number;
}

export interface PageDragGestureOptions {
  enabled: boolean;
  singlePage: boolean;
  /**
   * Custom order: cards are draggable, so they own the middle of the page and
   * only the outer band turns. In set order nothing competes for the middle.
   */
  cardsOwnMiddle: boolean;
  canGoNext: boolean;
  canGoPrev: boolean;
  beginScrub: (direction: "next" | "prev") => boolean;
  scrubTo: (progress: number) => void;
  endScrub: (commit: boolean) => void;
  goNext: () => void;
  goPrev: () => void;
}

/**
 * Turn pages by dragging them.
 *
 * The leaf, its faces and its geometry are entirely `usePageFlip`'s; this hook
 * only decides when a pointer is asking for a turn and how far through it is.
 * Nothing here touches React state — a drag writes one transform per move via
 * `scrubTo`, so a gesture across a spread of eighteen cards costs no renders.
 *
 * Pointer Events cover mouse, touch and pen in one path. The stroke is tracked
 * on `window` rather than on the binder, so a drag that wanders off the pages —
 * over the cover, past the edge of the viewport — keeps reporting; capture is
 * requested as well, which additionally covers a release outside the window.
 */
export function usePageDragGesture(options: PageDragGestureOptions) {
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const swallowClickRef = useRef(false);

  /*
   * Options change identity every render. Reading them through a ref keeps the
   * handlers stable — so React never rebinds them mid-drag — while a gesture in
   * flight still sees current values for things like `canGoNext`.
   */
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // A fresh press is always allowed to act, whatever the last one did.
    swallowClickRef.current = false;

    const { enabled, singlePage, cardsOwnMiddle, canGoNext, canGoPrev } = optionsRef.current;
    if (!enabled) return;
    // A second finger during a drag is ignored: two pointers can't sensibly
    // turn one page, and pinch-zoom should stay the browser's.
    if (gestureRef.current !== null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!canGoNext && !canGoPrev) return;

    const pages = pagesRef.current;
    if (!pages) return;

    /*
     * A card belongs to the card-drag gesture. Pressing one is either a tap to
     * open it or the start of a rearrange — never a page turn, or the two
     * surfaces would fight over the same pointer.
     */
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-card-grip]")) return;

    const rect = pages.getBoundingClientRect();
    const pageWidth = rect.width / (singlePage ? 1 : 2);
    const band = pageWidth * EDGE_ZONE_RATIO;
    const onEdge = event.clientX - rect.left < band || rect.right - event.clientX < band;
    if (!onEdge && cardsOwnMiddle) return;

    gestureRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      pageWidth,
      mode: "pending",
      direction: null,
      progress: 0,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
    };

    // Best effort: it keeps a release outside the window reportable. Nothing
    // depends on it — the stroke is tracked on `window` either way — so a
    // pointer the browser no longer considers active is not a failure.
    try {
      pages.setPointerCapture(event.pointerId);
    } catch {
      /* pointer already gone; window listeners still cover the stroke */
    }
  }, []);

  const finish = useCallback((commit: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;

    const { endScrub, goNext, goPrev } = optionsRef.current;
    if (gesture.mode === "scrub") {
      endScrub(commit);
    } else if (gesture.mode === "coarse" && commit) {
      if (gesture.direction === "next") goNext();
      else goPrev();
    }

    /*
     * A release also produces a click on whatever sits under the pointer, and
     * under the pointer are the page-edge buttons and the pockets. Left alone,
     * a swipe that started on the next-page edge would turn the page twice.
     */
    if (gesture.mode !== "pending") swallowClickRef.current = true;
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;

      const dx = event.clientX - gesture.originX;
      const dy = event.clientY - gesture.originY;

      // Speed at the moment of release is what decides a flick, so this tracks
      // the latest sample rather than an average over the whole drag.
      const dt = event.timeStamp - gesture.lastT;
      if (dt > 0) {
        gesture.velocity = (event.clientX - gesture.lastX) / dt;
        gesture.lastX = event.clientX;
        gesture.lastT = event.timeStamp;
      }

      if (gesture.mode === "pending") {
        if (Math.abs(dx) < START_THRESHOLD_PX && Math.abs(dy) < START_THRESHOLD_PX) return;

        // Mostly vertical means the reader is scrolling the page, not turning
        // it. Dropping the gesture hands the rest of the stroke to the browser.
        if (Math.abs(dy) > Math.abs(dx)) {
          gestureRef.current = null;
          return;
        }

        const direction = dx < 0 ? "next" : "prev";
        const { canGoNext, canGoPrev, beginScrub } = optionsRef.current;
        if (direction === "next" ? !canGoNext : !canGoPrev) {
          gestureRef.current = null;
          return;
        }

        gesture.direction = direction;
        gesture.mode = beginScrub(direction) ? "scrub" : "coarse";
      }

      // Stops the stroke from also selecting page text or dragging card art.
      event.preventDefault();

      /*
       * The threshold is subtracted so the page starts from flat rather than
       * jumping to wherever the finger already was. Dragging back past the
       * origin clamps at 0, which returns the leaf to rest — the turn is
       * abandonable without lifting the finger.
       */
      const travelled = Math.max(0, (gesture.direction === "next" ? -dx : dx) - START_THRESHOLD_PX);
      gesture.progress = Math.min(1, travelled / gesture.pageWidth);
      if (gesture.mode === "scrub") optionsRef.current.scrubTo(gesture.progress);
    };

    const onUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;

      // Positive means the pointer was still moving the way the turn is going.
      const closing = gesture.direction === "next" ? -gesture.velocity : gesture.velocity;
      const flicked = closing > FLICK_VELOCITY_PX_PER_MS && gesture.progress > FLICK_MIN_PROGRESS;

      finish(gesture.progress >= COMMIT_RATIO || flicked);
    };

    // Cancelled, or the window lost the pointer entirely: nobody completed a
    // turn, so the page springs back to where it was.
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId === gestureRef.current?.pointerId) finish(false);
    };
    const onBlur = () => finish(false);

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onBlur);
    };
  }, [finish]);

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (!swallowClickRef.current) return;
    swallowClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handlers = useMemo(
    () => ({ onPointerDown, onClickCapture }),
    [onPointerDown, onClickCapture],
  );

  return { pagesRef, handlers };
}

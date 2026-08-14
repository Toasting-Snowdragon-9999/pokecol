import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "../../core/types";

/** Movement before a press becomes a drag, so a tap still opens the card. */
const DRAG_THRESHOLD_PX = 6;
/** Hover time over a page edge before it turns, while carrying a card. */
const EDGE_TURN_DELAY_MS = 500;

export interface PocketAddress {
  page: number;
  slot: number;
}

export interface DragState {
  card: Card;
  from: PocketAddress;
  /** Viewport position of the lifted card's centre. */
  x: number;
  y: number;
  over: PocketAddress | null;
}

interface UseCardDragOptions {
  enabled: boolean;
  onDrop: (card: Card, from: PocketAddress, to: PocketAddress) => void;
  onEdgeHold: (direction: "prev" | "next") => void;
}

/**
 * Pointer-driven card dragging.
 *
 * Pointer Events cover mouse, touch and pen in one path, so there is no
 * separate touch implementation. HTML5 drag-and-drop is deliberately avoided:
 * it has no touch support and its drag image can't be styled, which would break
 * the illusion of lifting a card out of a sleeve.
 *
 * Drop targets are resolved by hit-testing the DOM at the pointer rather than
 * by tracking rectangles, so it stays correct while pages turn mid-drag.
 */
export function useCardDrag({ enabled, onDrop, onEdgeHold }: UseCardDragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const pointerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const pendingRef = useRef<{ card: Card; from: PocketAddress } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const edgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeSideRef = useRef<"prev" | "next" | null>(null);
  const swallowClickRef = useRef(false);

  const clearEdgeTimer = useCallback(() => {
    if (edgeTimerRef.current !== null) {
      clearTimeout(edgeTimerRef.current);
      edgeTimerRef.current = null;
    }
    edgeSideRef.current = null;
  }, []);

  const reset = useCallback(() => {
    pointerRef.current = null;
    originRef.current = null;
    pendingRef.current = null;
    dragRef.current = null;
    clearEdgeTimer();
    setDrag(null);
  }, [clearEdgeTimer]);

  /** Which pocket is under the pointer, read straight from the DOM. */
  const pocketAt = useCallback((x: number, y: number): PocketAddress | null => {
    const element = document
      .elementsFromPoint(x, y)
      .find((node) => node instanceof HTMLElement && node.dataset.pocket) as
      | HTMLElement
      | undefined;
    if (!element?.dataset.pocket) return null;

    const [page, slot] = element.dataset.pocket.split(":").map(Number);
    return Number.isInteger(page) && Number.isInteger(slot) ? { page, slot } : null;
  }, []);

  /** Hovering a page edge while carrying a card turns the page, once. */
  const handleEdge = useCallback(
    (x: number, y: number) => {
      const edge = document
        .elementsFromPoint(x, y)
        .find((node) => node instanceof HTMLElement && node.dataset.edge) as
        | HTMLElement
        | undefined;
      const side = (edge?.dataset.edge as "prev" | "next" | undefined) ?? null;

      if (side !== edgeSideRef.current) {
        clearEdgeTimer();
        if (side) {
          edgeSideRef.current = side;
          edgeTimerRef.current = setTimeout(() => {
            onEdgeHold(side);
            // Re-arm so a continued hold keeps turning.
            edgeSideRef.current = null;
          }, EDGE_TURN_DELAY_MS);
        }
      }
    },
    [clearEdgeTimer, onEdgeHold],
  );

  const start = useCallback(
    (event: React.PointerEvent, card: Card, from: PocketAddress) => {
      // One pointer at a time, primary button only.
      if (!enabled || pointerRef.current !== null || (event.pointerType === "mouse" && event.button !== 0)) {
        return;
      }
      // A fresh press always acts, whatever the previous one left armed.
      swallowClickRef.current = false;
      pointerRef.current = event.pointerId;
      originRef.current = { x: event.clientX, y: event.clientY };
      pendingRef.current = { card, from };
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerRef.current) return;
      const origin = originRef.current;
      const pending = pendingRef.current;
      if (!origin || !pending) return;

      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;

      // Below the threshold this is still a click, not a drag.
      if (!dragRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      event.preventDefault();
      const over = pocketAt(event.clientX, event.clientY);
      const next: DragState = {
        card: pending.card,
        from: pending.from,
        x: event.clientX,
        y: event.clientY,
        over,
      };
      dragRef.current = next;
      setDrag(next);
      handleEdge(event.clientX, event.clientY);
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerRef.current) return;
      const active = dragRef.current;
      if (active) {
        const target = pocketAt(event.clientX, event.clientY);
        // Dropping outside any pocket cancels rather than losing the card.
        if (target && (target.page !== active.from.page || target.slot !== active.from.slot)) {
          onDrop(active.card, active.from, target);
        }
        /*
         * Releasing over the sleeve the card started in still produces a click
         * on it, which would open the card you just spent a gesture putting
         * back. A drag is not a tap, however it ends.
         */
        swallowClickRef.current = true;
      }
      reset();
    };

    const onCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerRef.current) reset();
    };

    // Capture phase, so the sleeve's own handler never sees the click.
    const onClickCapture = (event: MouseEvent) => {
      if (!swallowClickRef.current) return;
      swallowClickRef.current = false;
      event.stopPropagation();
      event.preventDefault();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("click", onClickCapture, true);
    };
  }, [enabled, handleEdge, onDrop, pocketAt, reset]);

  // Leaving custom mode mid-drag must not strand a lifted card.
  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  return { drag, startDrag: start, isDragging: drag !== null };
}

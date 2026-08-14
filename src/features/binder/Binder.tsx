import { useCallback } from "react";
import { Link } from "react-router";
import type { Card } from "../../core/types";
import { BinderSheet } from "./BinderSheet";
import type { BinderSpread, BinderView } from "./useBinderPages";
import { usePageFlip } from "./usePageFlip";
import { usePageDragGesture } from "./usePageDragGesture";
import { useCardDrag } from "./useCardDrag";
import type { PocketAddress } from "./useCardDrag";
import type { BinderOrder } from "./useBinderPages";
import { CardImage } from "../../components/CardImage";
import styles from "./binder.module.css";

interface BinderProps {
  spreads: BinderSpread[];
  singlePage: boolean;
  onOpenCard: (card: Card) => void;
  empty: boolean;
  view: BinderView;
  onViewChange: (view: BinderView) => void;
  showViewToggle: boolean;
  order: BinderOrder;
  onOrderChange: (order: BinderOrder) => void;
  onMoveCard: (card: Card, from: PocketAddress, to: PocketAddress) => void;
}

export function Binder({
  spreads,
  singlePage,
  onOpenCard,
  empty,
  view,
  onViewChange,
  showViewToggle,
  order,
  onOrderChange,
  onMoveCard,
}: BinderProps) {
  const {
    spread,
    flip,
    isFlipping,
    leafRef,
    shadowRef,
    goNext,
    goPrev,
    canGoNext,
    canGoPrev,
    beginScrub,
    scrubTo,
    endScrub,
  } = usePageFlip(spreads.length);

  // Turning pages by dragging them. Shares the pointer surface with card
  // dragging, so it defers to cards and to the middle of a custom-order page.
  const { pagesRef, handlers: pageGesture } = usePageDragGesture({
    enabled: !empty,
    singlePage,
    cardsOwnMiddle: order === "custom",
    canGoNext,
    canGoPrev,
    beginScrub,
    scrubTo,
    endScrub,
    goNext,
    goPrev,
  });

  const handleEdgeHold = useCallback(
    (direction: "prev" | "next") => {
      if (direction === "next") goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  // Dragging is only meaningful where placements are honoured. In set order the
  // layout is canonical and read-only, so cards stay put.
  const { drag, startDrag } = useCardDrag({
    enabled: order === "custom",
    onDrop: onMoveCard,
    onEdgeHold: handleEdgeHold,
  });

  const handleDragStart = useCallback(
    (event: React.PointerEvent, card: Card, page: number, slot: number) => {
      startDrag(event, card, { page, slot });
    },
    [startDrag],
  );

  /*
   * Absolute page indices for the two visible sheets. Drag addresses must be
   * page-absolute, not per-spread, or a placement would mean something
   * different depending on which spread happened to be open.
   */
  const leftPageIndex = singlePage ? spread : spread * 2;
  const rightPageIndex = leftPageIndex + 1;

  const liftedOn = (pageIndex: number) =>
    drag && drag.from.page === pageIndex ? drag.from.slot : null;
  const dropOn = (pageIndex: number) =>
    drag?.over && drag.over.page === pageIndex ? drag.over.slot : null;

  const current = spreads[spread] ?? { left: null, right: null };

  /*
   * While a leaf is mid-turn we paint four pages instead of two.
   *
   * `lowIndex`/`highIndex` are the spreads either side of the leaf, so the same
   * expressions work in both directions:
   *   - the leaf's front face is the low spread's right page
   *   - its back face is the high spread's left page
   *   - underneath, the reader sees the low spread's left and the high
   *     spread's right, which is exactly what the turn should uncover.
   */
  const low = flip ? spreads[flip.lowIndex] : null;
  const high = flip ? spreads[flip.highIndex] : null;

  const staticLeft = flip
    ? singlePage
      ? (spreads[flip.target]?.left ?? null)
      : (low?.left ?? null)
    : current.left;
  const staticRight = flip ? (high?.right ?? null) : current.right;

  const leafFront = flip ? (singlePage ? (low?.left ?? null) : (low?.right ?? null)) : null;
  const leafBack = flip ? (high?.left ?? null) : null;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goPrev();
      }
    },
    [goNext, goPrev],
  );

  return (
    <div className={styles.stage}>
      {showViewToggle && (
        <div className={styles.toolbar}>
          <div className={styles.viewToggle} role="group" aria-label="Binder arrangement">
            {(["set", "custom"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.viewOption} ${order === option ? styles.viewOptionActive : ""}`}
                onClick={() => onOrderChange(option)}
                aria-pressed={order === option}
              >
                {option === "set" ? "Set order" : "Custom"}
              </button>
            ))}
          </div>

          {/* Owned/Full set describes a set-organised binder; a custom
              arrangement has no set structure for it to act on. */}
          {order === "set" && (
            <div className={styles.viewToggle} role="group" aria-label="Binder layout">
              {(["owned", "full"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.viewOption} ${view === option ? styles.viewOptionActive : ""}`}
                  onClick={() => onViewChange(option)}
                  aria-pressed={view === option}
                >
                  {option === "owned" ? "Owned" : "Full set"}
                </button>
              ))}
            </div>
          )}

          {order === "custom" && (
            <p className={styles.toolbarHint}>Drag cards between sleeves to arrange them.</p>
          )}
        </div>
      )}

      <div
        className={styles.binder}
        role="group"
        aria-roledescription="card binder"
        aria-label="Your Pokémon card binder"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.pages} ref={pagesRef} {...pageGesture}>
          <BinderSheet
            sheet={staticLeft}
            side="left"
            onOpen={onOpenCard}
            interactive={!isFlipping}
            pageIndex={leftPageIndex}
            draggable={order === "custom" && !isFlipping}
            onDragStart={handleDragStart}
            liftedSlot={liftedOn(leftPageIndex)}
            dropSlot={dropOn(leftPageIndex)}
          />

          {!singlePage && (
            <BinderSheet
              sheet={staticRight}
              side="right"
              onOpen={onOpenCard}
              interactive={!isFlipping && !flip}
              pageIndex={rightPageIndex}
              draggable={order === "custom" && !isFlipping}
              onDragStart={handleDragStart}
              liftedSlot={liftedOn(rightPageIndex)}
              dropSlot={dropOn(rightPageIndex)}
            />
          )}

          {/* The turning leaf. Cards live inside it as ordinary DOM, so they
              stay attached to the page as it rotates. */}
          {flip && (
            <div
              ref={leafRef}
              className={`${styles.leaf} ${singlePage ? styles.leafSingle : ""} ${styles.leafFlipping}`}
              style={{ transform: `rotateY(${flip.from}deg)` }}
              aria-hidden="true"
            >
              <div className={styles.face}>
                <BinderSheet
                  sheet={leafFront}
                  side={singlePage ? "left" : "right"}
                  onOpen={onOpenCard}
                  interactive={false}
                />
              </div>
              <div className={`${styles.face} ${styles.faceBack}`}>
                <BinderSheet
                  sheet={leafBack}
                  side="left"
                  onOpen={onOpenCard}
                  interactive={false}
                />
              </div>
            </div>
          )}

          {flip && <div ref={shadowRef} className={styles.leafShadow} aria-hidden="true" />}

          {!singlePage && (
            <div className={styles.spine} aria-hidden="true">
              <span className={styles.ring} />
              <span className={styles.ring} />
              <span className={styles.ring} />
            </div>
          )}

          <button
            type="button"
            className={`${styles.edge} ${styles.edgePrev}`}
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label="Previous page"
            tabIndex={-1}
            data-edge="prev"
          />
          <button
            type="button"
            className={`${styles.edge} ${styles.edgeNext}`}
            onClick={goNext}
            disabled={!canGoNext}
            aria-label="Next page"
            tabIndex={-1}
            data-edge="next"
          />

          {empty && (
            <div className={styles.emptyOverlay}>
              <p className={styles.emptyTitle}>This binder is empty</p>
              <p className={styles.emptyText}>
                Find a card and it'll drop straight into the first sleeve.
              </p>
              <Link to="/find" className={styles.emptyLink}>
                Find cards
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* The lifted card. Rendered outside the binder's 3D context so the
          perspective transform can't distort it while it follows the pointer. */}
      {drag && (
        <div
          className={styles.dragGhost}
          style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0) translate(-50%, -50%)` }}
          aria-hidden="true"
        >
          <CardImage
            src={drag.card.images.small}
            alt=""
            fallbackName={drag.card.name}
            eager
          />
        </div>
      )}

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.navButton}
          onClick={goPrev}
          disabled={!canGoPrev}
        >
          ‹ Previous
        </button>
        <p className={styles.pageCount} aria-live="polite">
          {empty ? "No pages yet" : `Page ${spread + 1} of ${spreads.length}`}
        </p>
        <button
          type="button"
          className={styles.navButton}
          onClick={goNext}
          disabled={!canGoNext}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

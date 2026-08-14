import { useCallback } from "react";
import { Link } from "react-router";
import type { Card } from "../../core/types";
import { BinderSheet } from "./BinderSheet";
import type { BinderSpread } from "./useBinderPages";
import { usePageFlip } from "./usePageFlip";
import styles from "./binder.module.css";

interface BinderProps {
  spreads: BinderSpread[];
  singlePage: boolean;
  onOpenCard: (card: Card) => void;
  empty: boolean;
}

export function Binder({ spreads, singlePage, onOpenCard, empty }: BinderProps) {
  const { spread, flip, isFlipping, leafRef, shadowRef, goNext, goPrev, canGoNext, canGoPrev } =
    usePageFlip(spreads.length);

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
      <div
        className={styles.binder}
        role="group"
        aria-roledescription="card binder"
        aria-label="Your Pokémon card binder"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.pages}>
          <BinderSheet
            sheet={staticLeft}
            side="left"
            onOpen={onOpenCard}
            interactive={!isFlipping}
          />

          {!singlePage && (
            <BinderSheet
              sheet={staticRight}
              side="right"
              onOpen={onOpenCard}
              interactive={!isFlipping && !flip}
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
          />
          <button
            type="button"
            className={`${styles.edge} ${styles.edgeNext}`}
            onClick={goNext}
            disabled={!canGoNext}
            aria-label="Next page"
            tabIndex={-1}
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

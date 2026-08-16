import { memo } from "react";
import type { Card } from "../../core/types";
import { Pocket } from "./Pocket";
import { SetProgress } from "./SetProgress";
import type { BinderSheetData } from "./useBinderPages";
import styles from "./binder.module.css";

interface BinderSheetProps {
  sheet: BinderSheetData | null;
  side: "left" | "right";
  onOpen: (card: Card) => void;
  interactive: boolean;
  /** Absolute page index, so pockets carry a stable drag address. */
  pageIndex?: number;
  draggable?: boolean;
  onDragStart?: (event: React.PointerEvent, card: Card, page: number, slot: number) => void;
  liftedSlot?: number | null;
  dropSlot?: number | null;
}

function releaseYear(iso: string | undefined): string | undefined {
  return iso?.slice(0, 4);
}

/**
 * A single binder page: set header plus a 3x3 block of sleeves.
 *
 * `sheet === null` renders a blank filler page, which is what the reader sees
 * on the back side of the last leaf.
 */
export const BinderSheet = memo(function BinderSheet({
  sheet,
  side,
  onOpen,
  interactive,
  pageIndex,
  draggable = false,
  onDragStart,
  liftedSlot = null,
  dropSlot = null,
}: BinderSheetProps) {
  const sideClass = side === "left" ? styles.sheetLeft : styles.sheetRight;

  if (!sheet) {
    return <div className={`${styles.sheet} ${sideClass} ${styles.sheetBlank}`} aria-hidden="true" />;
  }

  const set = sheet.set;
  const year = releaseYear(set?.releaseDate);

  return (
    <section
      className={`${styles.sheet} ${sideClass}`}
      aria-label={
        set ? `${set.name}, page ${sheet.sheetInSet} of ${sheet.sheetsInSet}` : "Empty binder page"
      }
    >
      <header className={styles.sheetHeader}>
        {set ? (
          <>
            {set.symbolUrl && (
              <img className={styles.sheetSymbol} src={set.symbolUrl} alt="" aria-hidden="true" />
            )}
            <h2 className={styles.sheetTitle}>{set.name}</h2>
            <span className={styles.sheetSub}>
              {year ? `${year} · ` : ""}
              {sheet.sheetInSet}/{sheet.sheetsInSet}
            </span>
          </>
        ) : (
          sheet.note && <span className={styles.sheetSpare}>{sheet.note}</span>
        )}
      </header>

      {sheet.completion && sheet.completion.total > 0 && (
        <SetProgress completion={sheet.completion} />
      )}

      <div className={styles.pockets}>
        {sheet.slots.map((slot, index) => (
          <Pocket
            /*
             * Keyed by position, not by card. A pocket *is* a position — and a
             * card-id key breaks badly the moment the same id lands in two
             * pockets (a set roster that repeats a card, say): React collapses
             * the duplicates, one pocket's `data-pocket` node never reaches the
             * DOM, and drag-and-drop hit-testing silently fails on it.
             */
            key={`${sheet.id}-${index}`}
            slot={slot}
            onOpen={onOpen}
            interactive={interactive}
            page={pageIndex}
            index={index}
            draggable={draggable}
            onDragStart={onDragStart}
            lifted={liftedSlot === index}
            dropTarget={dropSlot === index}
          />
        ))}
      </div>
    </section>
  );
});

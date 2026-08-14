import { memo } from "react";
import { CardImage } from "../../components/CardImage";
import type { Card } from "../../core/types";
import type { BinderSlot } from "./useBinderPages";
import styles from "./binder.module.css";

interface PocketProps {
  slot: BinderSlot;
  onOpen: (card: Card) => void;
  /** Sheets that aren't currently readable are taken out of the tab order. */
  interactive: boolean;
  /** Absolute address, used by drag hit-testing and drop targeting. */
  page?: number;
  index?: number;
  draggable?: boolean;
  onDragStart?: (event: React.PointerEvent, card: Card, page: number, slot: number) => void;
  /** This pocket's card is currently lifted out of it. */
  lifted?: boolean;
  /** The dragged card would land here on release. */
  dropTarget?: boolean;
}

/**
 * One sleeve. Empty pockets keep the full sleeve treatment — the well, the lip,
 * the sheen — minus the card, so a half-filled set reads as a physical gap
 * rather than as missing UI.
 */
export const Pocket = memo(function Pocket({
  slot,
  onOpen,
  interactive,
  page,
  index,
  draggable = false,
  onDragStart,
  lifted = false,
  dropTarget = false,
}: PocketProps) {
  const { card, quantity, variantCount, missingCard } = slot;

  // Present on every pocket in custom mode so hit-testing can resolve a target.
  const address = page !== undefined && index !== undefined ? `${page}:${index}` : undefined;
  const targetClass = dropTarget ? styles.pocketTarget : "";

  if (!card) {
    /*
     * A gap whose card is known: clickable, showing only its number. The
     * restraint is deliberate — a mostly-empty set page would be unreadable if
     * every hole shouted, so this is a faint numeral and nothing else until
     * you actually reach for it.
     */
    if (missingCard) {
      return (
        <button
          type="button"
          data-pocket={address}
          className={`${styles.pocket} ${styles.pocketEmpty} ${styles.pocketMissing} ${targetClass}`}
          onClick={() => onOpen(missingCard)}
          tabIndex={interactive ? 0 : -1}
          aria-label={`Missing: ${missingCard.name}, number ${missingCard.number}. View card.`}
        >
          <span className={styles.missingNumber} aria-hidden="true">
            {missingCard.number}
          </span>
        </button>
      );
    }
    return (
      <div
        data-pocket={address}
        className={`${styles.pocket} ${styles.pocketEmpty} ${targetClass}`}
        aria-hidden="true"
      />
    );
  }

  // Several printings of one card still share a single sleeve; the offset edges
  // behind it read as a small stack rather than adding a badge to the page.
  const stacked = variantCount > 1;

  return (
    <div
      data-pocket={address}
      className={`${styles.pocket} ${styles.pocketFilled} ${stacked ? styles.pocketStacked : ""} ${
        lifted ? styles.pocketLifted : ""
      } ${targetClass}`}
    >
      <button
        type="button"
        className={`${styles.cardButton} ${draggable ? styles.cardDraggable : ""}`}
        onClick={() => onOpen(card)}
        onPointerDown={
          draggable && onDragStart && page !== undefined && index !== undefined
            ? (event) => onDragStart(event, card, page, index)
            : undefined
        }
        tabIndex={interactive ? 0 : -1}
        aria-label={`${card.name}, ${card.set.name} number ${card.number}${
          quantity > 1 ? `, ${quantity} copies` : ""
        }${stacked ? `, ${variantCount} printings` : ""}`}
      >
        {/* Eager: only the current spread and the turning leaf are ever
            mounted, so every pocket on screen is genuinely visible. Lazy
            loading here just delays the page you're already looking at. */}
        <CardImage
          className={styles.cardArt}
          src={card.images.small}
          alt=""
          fallbackName={card.name}
          eager
        />
      </button>
      {quantity > 1 && <span className={styles.dupe}>×{quantity}</span>}
    </div>
  );
});

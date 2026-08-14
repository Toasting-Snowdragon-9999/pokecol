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
}

/**
 * One sleeve. Empty pockets keep the full sleeve treatment — the well, the lip,
 * the sheen — minus the card, so a half-filled set reads as a physical gap
 * rather than as missing UI.
 */
export const Pocket = memo(function Pocket({ slot, onOpen, interactive }: PocketProps) {
  const { card, quantity, variantCount } = slot;

  if (!card) {
    return <div className={`${styles.pocket} ${styles.pocketEmpty}`} aria-hidden="true" />;
  }

  // Several printings of one card still share a single sleeve; the offset edges
  // behind it read as a small stack rather than adding a badge to the page.
  const stacked = variantCount > 1;

  return (
    <div className={`${styles.pocket} ${styles.pocketFilled} ${stacked ? styles.pocketStacked : ""}`}>
      <button
        type="button"
        className={styles.cardButton}
        onClick={() => onOpen(card)}
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

import { useCollection } from "../collection/context";
import type { Card } from "../core/types";
import styles from "./QuantityStepper.module.css";

interface QuantityStepperProps {
  card: Card;
  /** Which printing to add or remove. Defaults to the card's base print. */
  variantId?: string;
  /** Shown on the −/+ buttons' labels so screen readers can tell rows apart. */
  variantLabel?: string;
  compact?: boolean;
}

/**
 * Collapses to a single "Add" button when unowned, and expands into a
 * −/count/+ control once the printing is in the collection — so ownership is
 * readable from the control itself, not just a badge.
 */
export function QuantityStepper({
  card,
  variantId,
  variantLabel,
  compact = false,
}: QuantityStepperProps) {
  const { quantityOfVariant, setQuantity } = useCollection();
  const targetVariant = variantId ?? card.defaultVariantId;
  const quantity = quantityOfVariant(card.id, targetVariant, card.gameId);
  const suffix = variantLabel ? ` (${variantLabel})` : "";

  if (quantity === 0) {
    return (
      <button
        type="button"
        className={`${styles.add} ${compact ? styles.addCompact : ""}`}
        onClick={() => void setQuantity(card.id, targetVariant, 1, card.gameId)}
        aria-label={variantLabel ? `Add ${card.name}${suffix} to binder` : undefined}
      >
        {compact ? "Add" : "Add to binder"}
      </button>
    );
  }

  return (
    <div className={`${styles.stepper} ${compact ? styles.stepperCompact : ""}`}>
      <button
        type="button"
        className={styles.step}
        onClick={() => void setQuantity(card.id, targetVariant, quantity - 1, card.gameId)}
        aria-label={
          quantity === 1
            ? `Remove ${card.name}${suffix} from collection`
            : `Decrease ${card.name}${suffix} quantity`
        }
      >
        −
      </button>
      <span className={styles.count}>
        {quantity}{" "}
        {/* In the grid a card total ("In binder ×3") sits right next to this
            stepper, which only controls one printing — so name the printing
            rather than letting two different numbers look contradictory. In the
            detail list the row already carries the label. */}
        <span className={styles.countLabel}>{!compact && variantLabel ? variantLabel : "owned"}</span>
      </span>
      <button
        type="button"
        className={styles.step}
        onClick={() => void setQuantity(card.id, targetVariant, quantity + 1, card.gameId)}
        disabled={quantity >= 99}
        aria-label={`Increase ${card.name}${suffix} quantity`}
      >
        +
      </button>
    </div>
  );
}

import { useCollection } from "../collection/context";
import type { Card } from "../core/types";
import styles from "./QuantityStepper.module.css";

/**
 * Collapses to a single "Add" button when unowned, and expands into a
 * −/count/+ control once the card is in the collection — so ownership is
 * readable from the control itself, not just a badge.
 */
export function QuantityStepper({ card }: { card: Card }) {
  const { quantityOf, setQuantity } = useCollection();
  const quantity = quantityOf(card.id, card.gameId);

  if (quantity === 0) {
    return (
      <button
        type="button"
        className={styles.add}
        onClick={() => void setQuantity(card.id, 1, card.gameId)}
      >
        Add to binder
      </button>
    );
  }

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.step}
        onClick={() => void setQuantity(card.id, quantity - 1, card.gameId)}
        aria-label={quantity === 1 ? `Remove ${card.name} from collection` : `Decrease ${card.name} quantity`}
      >
        −
      </button>
      <span className={styles.count}>
        {quantity} <span className={styles.countLabel}>owned</span>
      </span>
      <button
        type="button"
        className={styles.step}
        onClick={() => void setQuantity(card.id, quantity + 1, card.gameId)}
        disabled={quantity >= 99}
        aria-label={`Increase ${card.name} quantity`}
      >
        +
      </button>
    </div>
  );
}

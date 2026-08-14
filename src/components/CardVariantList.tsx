import { useCollection } from "../collection/context";
import type { Card } from "../core/types";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./CardVariantList.module.css";

/**
 * One row per printing, each with its own stepper, so variants are added and
 * removed independently.
 *
 * A card that only exists in one printing renders a single row and reads
 * essentially the way the plain stepper did before variants existed — the
 * common case shouldn't pay for the uncommon one.
 */
export function CardVariantList({ card }: { card: Card }) {
  const { quantityOfVariant, quantityOf } = useCollection();
  const total = quantityOf(card.id, card.gameId);
  const multiple = card.variants.length > 1;

  return (
    <div className={styles.list}>
      <p className={styles.heading}>
        <span>{multiple ? "Printings" : "Your copies"}</span>
        {total > 0 && (
          <span className={styles.total}>
            {total} {total === 1 ? "copy" : "copies"} in binder
          </span>
        )}
      </p>

      {card.variants.map((variant) => {
        const owned = quantityOfVariant(card.id, variant.id, card.gameId) > 0;
        return (
          <div
            key={variant.id}
            className={`${styles.row} ${owned ? styles.rowOwned : ""}`}
          >
            {multiple && <span className={styles.label}>{variant.label}</span>}
            <div className={multiple ? styles.control : styles.label}>
              <QuantityStepper
                card={card}
                variantId={variant.id}
                variantLabel={multiple ? variant.label : undefined}
                compact={multiple}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

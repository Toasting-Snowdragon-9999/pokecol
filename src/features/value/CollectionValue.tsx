import { formatMoney } from "../../core/pricing";
import type { ValueTotal } from "../../core/pricing";
import styles from "./CollectionValue.module.css";

/**
 * The collection's estimated worth.
 *
 * Two things it must never do: imply precision it doesn't have, and quietly
 * count unpriced cards as zero. Hence "estimated" on the face of it and an
 * explicit count of what couldn't be priced, rather than a bare number that
 * looks like an appraisal.
 */
export function CollectionValue({ total }: { total: ValueTotal }) {
  if (total.pricedCards === 0) return null;

  const missing = total.unpricedCards;

  return (
    <div className={styles.root}>
      <span className={styles.label}>Estimated value</span>
      <span className={styles.amount}>{formatMoney(total.amount, total.currency)}</span>
      <span className={styles.note}>
        {missing > 0
          ? `${total.pricedCards} of ${total.pricedCards + missing} cards priced`
          : "current market prices"}
      </span>
    </div>
  );
}

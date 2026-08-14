import { memo } from "react";
import { CardImage } from "../../components/CardImage";
import { QuantityStepper } from "../../components/QuantityStepper";
import { useCollection } from "../../collection/context";
import type { Card } from "../../core/types";
import styles from "./ResultCard.module.css";

interface ResultCardProps {
  card: Card;
  onOpen: (card: Card) => void;
  eager?: boolean;
}

/**
 * A search result. Memoised because a collection change re-renders the whole
 * grid, and there can be a few hundred of these mounted after paging.
 */
export const ResultCard = memo(function ResultCard({ card, onOpen, eager }: ResultCardProps) {
  const { quantityOf } = useCollection();
  const quantity = quantityOf(card.id, card.gameId);
  const total = card.set.printedTotal ?? card.set.total;

  return (
    <article className={`${styles.card} ${quantity > 0 ? styles.owned : ""}`}>
      {quantity > 0 && (
        <span className={styles.badge}>
          ✓ In binder{quantity > 1 ? ` ×${quantity}` : ""}
        </span>
      )}

      <button
        type="button"
        className={styles.artButton}
        onClick={() => onOpen(card)}
        aria-label={`View details for ${card.name}`}
      >
        <CardImage
          src={card.images.small}
          alt={card.name}
          fallbackName={card.name}
          eager={eager}
        />
      </button>

      <div className={styles.meta}>
        <h3 className={styles.name} title={card.name}>
          {card.name}
        </h3>
        <p className={styles.setLine}>
          {card.set.symbolUrl && (
            <img className={styles.setSymbol} src={card.set.symbolUrl} alt="" aria-hidden="true" />
          )}
          <span className={styles.setName} title={card.set.name}>
            {card.set.name}
          </span>
        </p>
        <p className={styles.subline}>
          <span>
            #{card.number}
            {total ? `/${total}` : ""}
          </span>
          {card.rarity && <span className={styles.rarity}>{card.rarity}</span>}
        </p>
      </div>

      <QuantityStepper card={card} />
    </article>
  );
});

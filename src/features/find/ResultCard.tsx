import { memo } from "react";
import { CardImage } from "../../components/CardImage";
import { QuantityStepper } from "../../components/QuantityStepper";
import { useCollection } from "../../collection/context";
import { formatMoney, priceFor } from "../../core/pricing";
import type { Card } from "../../core/types";
import { useWishlist } from "../../wishlist/context";
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
  const { isWanted, wantsVariant, add: want, remove: unwant } = useWishlist();
  const quantity = quantityOf(card.id, card.gameId);
  const total = card.set.printedTotal ?? card.set.total;
  const price = priceFor(card.prices, card.defaultVariantId);
  const wanted = isWanted(card.id, card.gameId);

  // The star toggles the default printing; picking a specific one is the card
  // detail's job, where every printing is listed.
  const toggleWant = () =>
    void (wantsVariant(card.id, card.defaultVariantId, card.gameId)
      ? unwant(card.id, card.defaultVariantId, card.gameId)
      : want(card.id, card.defaultVariantId, card.gameId));

  return (
    <article className={`${styles.card} ${quantity > 0 ? styles.owned : ""}`}>
      {quantity > 0 && (
        <span className={styles.badge}>
          ✓ In binder{quantity > 1 ? ` ×${quantity}` : ""}
        </span>
      )}

      <button
        type="button"
        className={`${styles.want} ${wanted ? styles.wantActive : ""}`}
        onClick={toggleWant}
        aria-pressed={wanted}
        aria-label={`${wanted ? "Remove" : "Add"} ${card.name} ${wanted ? "from" : "to"} wishlist`}
        title={wanted ? "On your wishlist" : "Add to wishlist"}
      >
        {wanted ? "★" : "☆"}
      </button>

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
        {price && (
          <p className={styles.price}>
            {formatMoney(price.amount, price.currency)}
            <span className={styles.priceNote}>est.</span>
          </p>
        )}
        {/* Only surfaced when there is genuinely a choice to make — the add
            button below still adds the base print in one click. */}
        {card.variants.length > 1 && (
          <button type="button" className={styles.variantHint} onClick={() => onOpen(card)}>
            ▾ {card.variants.length} printings
          </button>
        )}
      </div>

      <QuantityStepper
        card={card}
        variantLabel={
          card.variants.length > 1
            ? card.variants.find((variant) => variant.id === card.defaultVariantId)?.label
            : undefined
        }
      />
    </article>
  );
});

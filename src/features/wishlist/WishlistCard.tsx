import { memo } from "react";
import { CardImage } from "../../components/CardImage";
import { useCollection } from "../../collection/context";
import { formatMoney, priceFor } from "../../core/pricing";
import type { Card } from "../../core/types";
import { useWishlist } from "../../wishlist/context";
import type { WishlistEntry } from "../../wishlist/store";
import styles from "./WishlistCard.module.css";

interface WishlistCardProps {
  entry: WishlistEntry;
  card: Card | undefined;
  onOpen: (card: Card) => void;
}

/**
 * One wanted card.
 *
 * The two things a wishlist has to answer are "which printing do I want?" and
 * "what will it cost me?", so the variant is a live control rather than a
 * label, and the price shown tracks whichever printing is selected.
 */
export const WishlistCard = memo(function WishlistCard({
  entry,
  card,
  onOpen,
}: WishlistCardProps) {
  const { remove, setVariant } = useWishlist();
  const { setQuantity, quantityOfVariant } = useCollection();

  // Entries resolve asynchronously; hold the slot rather than collapsing the grid.
  if (!card) {
    return (
      <div className={styles.card}>
        <div className={styles.skeletonArt} />
        <div className={styles.body}>
          <p className={styles.name}>Loading…</p>
        </div>
      </div>
    );
  }

  const price = priceFor(card.prices, entry.variantId, card.defaultVariantId);
  const owned = quantityOfVariant(card.id, entry.variantId, card.gameId);

  const acquire = async () => {
    // "I got one" is add-then-forget: the printing wanted is the printing owned.
    await setQuantity(card.id, entry.variantId, owned + 1, card.gameId);
    await remove(card.id, entry.variantId, card.gameId);
  };

  return (
    <div className={styles.card}>
      <button
        type="button"
        className={styles.art}
        onClick={() => onOpen(card)}
        aria-label={`${card.name}, ${card.set.name} number ${card.number}. View card.`}
      >
        <CardImage src={card.images.small} alt="" fallbackName={card.name} />
      </button>

      <div className={styles.body}>
        <p className={styles.name} title={card.name}>
          {card.name}
        </p>
        <p className={styles.meta} title={card.set.name}>
          {card.set.name} · {card.number}
        </p>

        {card.variants.length > 1 ? (
          <label className={styles.variantRow}>
            <span className="srOnly">Wanted printing for {card.name}</span>
            <select
              className={styles.variant}
              value={entry.variantId}
              onChange={(event) =>
                void setVariant(card.id, entry.variantId, event.target.value, card.gameId)
              }
            >
              {card.variants.map((variant) => (
                <option value={variant.id} key={variant.id}>
                  {variant.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className={styles.meta}>{card.variants[0]?.label}</p>
        )}

        <p className={styles.price}>
          {price ? (
            <>
              <span className={styles.priceAmount}>
                {formatMoney(price.amount, price.currency)}
              </span>
              <span className={styles.priceNote}>est. {price.source}</span>
            </>
          ) : (
            <span className={styles.priceNote}>No price available</span>
          )}
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.got} onClick={() => void acquire()}>
            I got this
          </button>
          <button
            type="button"
            className={styles.remove}
            onClick={() => void remove(card.id, entry.variantId, card.gameId)}
            aria-label={`Remove ${card.name} from wishlist`}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
});

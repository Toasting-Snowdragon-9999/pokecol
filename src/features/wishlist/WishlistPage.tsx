import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CardDetailModal } from "../../components/CardDetailModal";
import { EmptyState, ErrorState, UnavailableState } from "../../components/States";
import { formatMoney } from "../../core/pricing";
import type { Card } from "../../core/types";
import { useActiveGame } from "../../game/context";
import { useWishlist } from "../../wishlist/context";
import { WishlistCard } from "./WishlistCard";
import { useWishlistCards } from "./useWishlistCards";
import styles from "./WishlistPage.module.css";

export function WishlistPage() {
  const { meta, provider } = useActiveGame();
  const { entries, loading: entriesLoading, clear } = useWishlist();
  const { cards, loading, error, retry } = useWishlistCards();
  const [openCard, setOpenCard] = useState<Card | null>(null);

  /** What clearing the whole list would cost — the useful number here. */
  const total = useMemo(() => {
    let amount = 0;
    let priced = 0;
    for (const entry of entries) {
      const card = cards.get(entry.cardId);
      const price = card?.prices?.[entry.variantId] ?? card?.prices?.[card.defaultVariantId];
      if (!price) continue;
      amount += price.amount;
      priced += 1;
    }
    return { amount, priced };
  }, [entries, cards]);

  if (provider.unavailableReason) {
    return (
      <div className={styles.page}>
        <UnavailableState game={provider.label} reason={provider.unavailableReason} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{meta.label} wishlist</h1>
        <p className={styles.lede}>
          Cards you're hunting, with the printing you actually want. Mark one as yours and it
          moves straight into the binder.
        </p>
      </div>

      {entries.length > 0 && (
        <div className={styles.summary}>
          <p className={styles.count}>
            <span className={styles.countValue}>{entries.length}</span>
            {entries.length === 1 ? " card wanted" : " cards wanted"}
          </p>
          {total.priced > 0 && (
            <p className={styles.total}>
              ≈ {formatMoney(total.amount)}{" "}
              <span className={styles.totalNote}>
                estimated
                {total.priced < entries.length ? ` · ${total.priced} of ${entries.length} priced` : ""}
              </span>
            </p>
          )}
          <button type="button" className={styles.clear} onClick={() => void clear()}>
            Clear wishlist
          </button>
        </div>
      )}

      {error && entries.length > 0 && cards.size === 0 ? (
        <ErrorState error={error} onRetry={retry} />
      ) : entries.length === 0 && !entriesLoading ? (
        <EmptyState
          title="Nothing on the wishlist yet"
          message={`Search the ${meta.label} catalogue and add the cards you're after.`}
          action={
            <Link to="/find" className={styles.findLink}>
              Find cards
            </Link>
          }
        />
      ) : (
        <div className={styles.grid}>
          {entries.map((entry) => (
            <WishlistCard
              key={`${entry.cardId}:${entry.variantId}`}
              entry={entry}
              card={cards.get(entry.cardId)}
              onOpen={setOpenCard}
            />
          ))}
        </div>
      )}

      {loading && entries.length > 0 && cards.size === 0 && (
        <p className={styles.loadingNote}>Loading card details…</p>
      )}

      <CardDetailModal card={openCard} onClose={() => setOpenCard(null)} />
    </div>
  );
}

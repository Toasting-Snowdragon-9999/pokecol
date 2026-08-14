import { useState } from "react";
import { CardDetailModal } from "../../components/CardDetailModal";
import { ErrorState, Spinner } from "../../components/States";
import { useCollection } from "../../collection/context";
import { useCollectionCards } from "../../collection/useCollectionCards";
import type { Card } from "../../core/types";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { Binder } from "./Binder";
import { useBinderPages } from "./useBinderPages";
import styles from "./BinderPage.module.css";

/** Below this, a two-page spread can't hold readable 3x3 grids. */
const SINGLE_PAGE_QUERY = "(max-width: 760px)";

export function BinderPage() {
  const { quantityOf } = useCollection();
  const { cards, loading, error, retry } = useCollectionCards();
  const singlePage = useMediaQuery(SINGLE_PAGE_QUERY);
  const [openCard, setOpenCard] = useState<Card | null>(null);

  const { spreads } = useBinderPages(cards, quantityOf, singlePage);

  if (error && cards.length === 0) {
    return (
      <div className={styles.page}>
        <ErrorState error={error} onRetry={retry} />
      </div>
    );
  }

  if (loading && cards.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <Spinner label="Opening your binder" />
          <p>Opening your binder…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${singlePage ? styles.singlePage : ""}`}>
      <Binder
        spreads={spreads}
        singlePage={singlePage}
        onOpenCard={setOpenCard}
        empty={cards.length === 0}
      />
      <CardDetailModal card={openCard} onClose={() => setOpenCard(null)} />
    </div>
  );
}

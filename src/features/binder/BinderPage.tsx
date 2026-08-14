import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CardDetailModal } from "../../components/CardDetailModal";
import { ErrorState, Spinner } from "../../components/States";
import { useCollection } from "../../collection/context";
import { useCollectionCards } from "../../collection/useCollectionCards";
import type { Card } from "../../core/types";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { Binder } from "./Binder";
import { useBinderPages } from "./useBinderPages";
import type { BinderView } from "./useBinderPages";
import type { BinderOrder } from "./useBinderPages";
import { useSetRosters } from "./useSetRosters";
import { layoutStore, placementKey } from "./layoutStore";
import type { ArrangementEntry, CollectionLayout } from "./layoutStore";
import type { PocketAddress } from "./useCardDrag";
import styles from "./BinderPage.module.css";

/**
 * Subscribes to the manual layout. `useSyncExternalStore` caches the snapshot,
 * so this stays referentially stable between writes and doesn't re-run the
 * binder's layout memo on every render.
 */
function useLayout(): CollectionLayout {
  return useSyncExternalStore(
    (listener) => layoutStore.subscribe(listener),
    () => layoutStore.read(),
  );
}

/** Below this, a two-page spread can't hold readable 3x3 grids. */
const SINGLE_PAGE_QUERY = "(max-width: 760px)";

export function BinderPage() {
  const { quantityOf, variantsOwned } = useCollection();
  const { cards, loading, error, retry } = useCollectionCards();
  const singlePage = useMediaQuery(SINGLE_PAGE_QUERY);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [view, setView] = useState<BinderView>("owned");
  const [order, setOrder] = useState<BinderOrder>("set");
  const layout = useLayout();

  const arrangementRef = useRef<ArrangementEntry[]>([]);

  const handleMoveCard = useCallback((card: Card, _from: PocketAddress, to: PocketAddress) => {
    layoutStore.place(
      placementKey(card.gameId, card.id),
      to.page,
      to.slot,
      arrangementRef.current,
    );
  }, []);

  // Only the sets actually started — rosters are several requests each.
  const setIds = useMemo(() => [...new Set(cards.map((card) => card.set.id))], [cards]);
  const rosters = useSetRosters(setIds, cards.length > 0);

  const counts = useMemo(
    () => ({
      quantityOf: (cardId: string) => quantityOf(cardId),
      variantCountOf: (cardId: string) => variantsOwned(cardId).length,
    }),
    [quantityOf, variantsOwned],
  );

  const { sheets, spreads } = useBinderPages(cards, counts, singlePage, {
    view,
    rosters,
    order,
    placements: layout.placements,
  });

  /** Where every card sits right now, used to pin the layout on the first move. */
  const arrangement = useMemo(
    () =>
      order === "custom"
        ? sheets.flatMap((sheet, page) =>
            sheet.slots.flatMap((slot, index) =>
              slot.card
                ? [{ key: placementKey(slot.card.gameId, slot.card.id), page, slot: index }]
                : [],
            ),
          )
        : [],
    [sheets, order],
  );
  // Read through a ref so the drop handler stays stable and never re-subscribes
  // the pointer listeners mid-drag.
  arrangementRef.current = arrangement;

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
        view={view}
        onViewChange={setView}
        showViewToggle={cards.length > 0}
        order={order}
        onOrderChange={setOrder}
        onMoveCard={handleMoveCard}
      />
      <CardDetailModal
        card={openCard}
        onClose={() => setOpenCard(null)}
        moveTarget={
          order === "custom" && openCard
            ? {
                pageCount: singlePage ? spreads.length : spreads.length * 2,
                onMove: (page, slot) => {
                  layoutStore.place(
                    placementKey(openCard.gameId, openCard.id),
                    page,
                    slot,
                    arrangementRef.current,
                  );
                  setOpenCard(null);
                },
              }
            : undefined
        }
      />
    </div>
  );
}

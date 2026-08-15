import { useEffect, useMemo, useRef, useState } from "react";
import { CardDetailModal } from "../../components/CardDetailModal";
import { EmptyState, ErrorState, Spinner, UnavailableState } from "../../components/States";
import type { Card } from "../../core/types";
import { useActiveGame } from "../../game/context";
import { useDebounced } from "../../lib/useDebounced";
import { ResultCard } from "./ResultCard";
import { PAGE_SIZE, useCardSearch } from "./useCardSearch";
import { useSets } from "./useSets";
import styles from "./FindCardsPage.module.css";

/** Artwork in the first row loads eagerly; everything below it stays lazy. */
const EAGER_COUNT = 6;

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.skeletonCard} key={index}>
          <div className={styles.skeletonArt} />
          <div className={styles.skeletonLine} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
        </div>
      ))}
    </div>
  );
}

export function FindCardsPage() {
  const { meta, provider } = useActiveGame();
  const [rawQuery, setRawQuery] = useState("");
  const [setId, setSetId] = useState("");
  const [openCard, setOpenCard] = useState<Card | null>(null);

  /*
   * Switching games invalidates both filters: a Pokémon set id means nothing to
   * Scryfall, and carrying a query across is at best a coincidence.
   */
  useEffect(() => {
    setRawQuery("");
    setSetId("");
  }, [provider]);

  const query = useDebounced(rawQuery, 350);
  const { groups, error: setsError } = useSets();
  const { cards, totalCount, hasMore, loading, loadingMore, error, loadMore, retry } =
    useCardSearch(query, setId);

  const selectedSet = useMemo(
    () => groups.flatMap((group) => group.sets).find((set) => set.id === setId),
    [groups, setId],
  );

  // Infinite scroll. The sentinel is a real button too, so this stays usable if
  // the observer never fires (or the user prefers to click).
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const isBrowsingDefault = !query && !setId;

  // A game with no data source explains itself rather than searching nothing.
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
        <h1 className={styles.title}>Find cards</h1>
        <p className={styles.lede}>
          Search the {meta.label} catalogue and slot cards straight into your binder.
        </p>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            ⌕
          </span>
          <input
            className={styles.search}
            type="search"
            value={rawQuery}
            onChange={(event) => setRawQuery(event.target.value)}
            placeholder={`Search ${meta.shortLabel} cards by name`}
            aria-label="Search cards by name"
            autoComplete="off"
          />
          {rawQuery && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => setRawQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {provider.capabilities.setFilter && (
          <select
            className={styles.setSelect}
            value={setId}
            onChange={(event) => setSetId(event.target.value)}
            aria-label="Filter by set"
          >
            <option value="">All sets</option>
            {groups.map((group) => (
              <optgroup label={group.series} key={group.series}>
                {group.sets.map((set) => (
                  <option value={set.id} key={set.id}>
                    {set.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>

      <p className={styles.resultMeta} aria-live="polite">
        {loading
          ? "Searching…"
          : error
            ? ""
            : isBrowsingDefault && cards.length > 0
              ? `Browsing the latest set — ${cards[0].set.name} · ${totalCount} cards`
              : totalCount > 0
                ? `${totalCount.toLocaleString()} card${totalCount === 1 ? "" : "s"}${
                    selectedSet ? ` in ${selectedSet.name}` : ""
                  }`
                : ""}
      </p>

      {Boolean(setsError) && !error && (
        <p className={styles.resultMeta}>Set list unavailable — search still works.</p>
      )}

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : loading ? (
        <SkeletonGrid count={PAGE_SIZE} />
      ) : cards.length === 0 ? (
        <EmptyState
          title="No cards found"
          message={
            query
              ? `Nothing matched "${query}". Try a shorter name, or clear the set filter.`
              : "Try a different set."
          }
        />
      ) : (
        <>
          <div className={styles.grid}>
            {cards.map((card, index) => (
              <ResultCard
                card={card}
                key={card.id}
                onOpen={setOpenCard}
                eager={index < EAGER_COUNT}
              />
            ))}
          </div>

          {hasMore && (
            <div className={styles.sentinel} ref={sentinelRef}>
              {loadingMore ? (
                <Spinner label="Loading more cards" />
              ) : (
                <button type="button" className={styles.loadMore} onClick={loadMore}>
                  Load more
                </button>
              )}
            </div>
          )}
        </>
      )}

      <CardDetailModal card={openCard} onClose={() => setOpenCard(null)} />
    </div>
  );
}

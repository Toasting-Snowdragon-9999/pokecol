import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Card } from "../core/types";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./CardDetailModal.module.css";

function formatNumber(card: Card): string {
  const total = card.set.printedTotal ?? card.set.total;
  return total ? `${card.number} / ${total}` : card.number;
}

function formatReleaseDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Detail view for a single card.
 *
 * Rendered as an overlay with no state of its own beyond image loading, so
 * opening it from inside the binder never disturbs which page you're on.
 * Uses a native <dialog> for the focus trap, Esc handling and inert background.
 */
export function CardDetailModal({ card, onClose }: { card: Card | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hiResRef = useRef<HTMLImageElement>(null);
  const [hiResLoaded, setHiResLoaded] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (card && !dialog.open) dialog.showModal();
    else if (!card && dialog.open) dialog.close();
  }, [card]);

  // Same cached-image race as CardImage: reopening a card whose hi-res art is
  // already cached would otherwise leave the blurred preview showing.
  useLayoutEffect(() => {
    const img = hiResRef.current;
    setHiResLoaded(Boolean(img?.complete && img.naturalWidth > 0));
  }, [card?.id]);

  if (!card) return null;

  const releaseDate = formatReleaseDate(card.set.releaseDate);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="card-detail-name"
      // `close` also fires on Esc and on backdrop-dismiss, so this is the single exit path.
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop lands on the dialog element itself.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.art}>
          <img
            className={`${styles.artImg} ${styles.artPreview}`}
            src={card.images.small}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <img
            ref={hiResRef}
            className={`${styles.artImg} ${styles.artFull} ${hiResLoaded ? styles.artFullLoaded : ""}`}
            src={card.images.large}
            alt={card.name}
            draggable={false}
            decoding="async"
            onLoad={() => setHiResLoaded(true)}
            onError={() => setHiResLoaded(false)}
          />
        </div>

        <div className={styles.body}>
          <div className={styles.heading}>
            <div>
              <h2 className={styles.name} id="card-detail-name">
                {card.name}
              </h2>
              {card.subtitle && <p className={styles.subtitle}>{card.subtitle}</p>}
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => dialogRef.current?.close()}
              aria-label="Close card details"
            >
              ✕
            </button>
          </div>

          <div className={styles.setRow}>
            {card.set.symbolUrl && (
              <img className={styles.setSymbol} src={card.set.symbolUrl} alt="" aria-hidden="true" />
            )}
            <div>
              <div className={styles.setName}>{card.set.name}</div>
              <div className={styles.setMeta}>
                {[card.set.series, releaseDate].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>

          <div className={styles.facts}>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Number</span>
              <span className={styles.factValue}>{formatNumber(card)}</span>
            </div>
            {card.rarity && (
              <div className={styles.fact}>
                <span className={styles.factLabel}>Rarity</span>
                <span className={styles.factValue}>{card.rarity}</span>
              </div>
            )}
            {card.artist && (
              <div className={styles.fact}>
                <span className={styles.factLabel}>Illustrator</span>
                <span className={styles.factValue}>{card.artist}</span>
              </div>
            )}
          </div>

          {card.details && card.details.length > 0 && (
            <dl className={styles.details}>
              {card.details.map((detail, index) => (
                <div className={styles.detailRow} key={`${detail.label}-${index}`}>
                  <dt className={styles.detailLabel}>{detail.label}</dt>
                  <dd className={styles.detailValue}>{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className={styles.actions}>
            <QuantityStepper card={card} />
          </div>
        </div>
      </div>
    </dialog>
  );
}

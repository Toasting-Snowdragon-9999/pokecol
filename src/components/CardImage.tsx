import { useLayoutEffect, useRef, useState } from "react";
import styles from "./CardImage.module.css";

/** Intrinsic size of the API's `small` image — reserves space so nothing reflows. */
const SMALL_WIDTH = 245;
const SMALL_HEIGHT = 342;

interface CardImageProps {
  src: string;
  alt: string;
  /** Shown if the image 404s or the network drops. */
  fallbackName: string;
  /** Above-the-fold images skip lazy loading to avoid a visible pop-in. */
  eager?: boolean;
  className?: string;
}

/**
 * Card artwork with a skeleton, fade-in and a card-back fallback.
 *
 * Always uses the `small` asset (~160KB). The `large` variant is ~845KB, so a
 * single 3x3 spread of them would be over 7MB — those are reserved for the
 * detail view, one at a time.
 */
export function CardImage({ src, alt, fallbackName, eager = false, className }: CardImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const imgRef = useRef<HTMLImageElement>(null);

  /*
   * Reset for a recycled instance, and — importantly — reconcile against an
   * image that is already done.
   *
   * A cached image can finish decoding before React attaches `onLoad`, so that
   * event never fires and the skeleton would stay up forever. That hits every
   * returning visitor, whose whole binder would render as empty sleeves.
   */
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img?.complete) {
      setStatus(img.naturalWidth > 0 ? "loaded" : "error");
    } else {
      setStatus("loading");
    }
  }, [src]);

  return (
    <div className={className ? `${styles.wrap} ${className}` : styles.wrap}>
      {status === "loading" && <div className={styles.skeleton} aria-hidden="true" />}

      {status === "error" ? (
        <div className={styles.fallback} role="img" aria-label={`${alt} (artwork unavailable)`}>
          <span className={styles.fallbackMark} aria-hidden="true" />
          <span className={styles.fallbackName}>{fallbackName}</span>
          <span className={styles.fallbackNote}>Art unavailable</span>
        </div>
      ) : (
        <img
          ref={imgRef}
          className={`${styles.img} ${status === "loaded" ? styles.loaded : ""}`}
          src={src}
          alt={alt}
          width={SMALL_WIDTH}
          height={SMALL_HEIGHT}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
    </div>
  );
}

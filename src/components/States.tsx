import type { ReactNode } from "react";
import { describeError } from "../lib/http";
import styles from "./States.module.css";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className={styles.spinner} role="status" aria-label={label}>
      <span className="srOnly">{label}</span>
    </span>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.block}>
      <p className={styles.title}>{title}</p>
      {message && <p className={styles.message}>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className={styles.block} role="alert">
      <p className={styles.title}>Couldn't load cards</p>
      <p className={styles.message}>{describeError(error)}</p>
      {onRetry && (
        <button type="button" className={styles.action} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

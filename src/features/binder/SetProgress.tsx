import { memo } from "react";
import type { SetCompletion } from "./setCompletion";
import styles from "./binder.module.css";

/**
 * Set progress, printed onto the binder page rather than presented as a
 * dashboard widget: a line of type and a thin rule, in the page's own ink.
 *
 * Secret rares are reported separately instead of being folded into the
 * percentage — a set with 3 of 14 secrets is still a completed set, and
 * blending them would make 100% unreachable for most collectors.
 */
export const SetProgress = memo(function SetProgress({
  completion,
}: {
  completion: SetCompletion;
}) {
  const { owned, total, percent, secretsOwned, secretsTotal, rosterKnown } = completion;

  return (
    <div
      className={styles.progress}
      aria-label={`${owned} of ${total} collected, ${percent} percent`}
    >
      <div className={styles.progressRule} aria-hidden="true">
        <span className={styles.progressFill} style={{ width: `${percent}%` }} />
      </div>
      <p className={styles.progressText}>
        <span className={styles.progressCount}>
          {owned} / {total}
        </span>
        <span>collected · {percent}%</span>
        {secretsOwned > 0 && (
          <span className={styles.progressSecret}>
            +{secretsOwned} secret
            {rosterKnown && secretsTotal > 0 ? `/${secretsTotal}` : ""}
          </span>
        )}
      </p>
    </div>
  );
});

import { useState } from "react";
import { POCKETS_PER_SHEET } from "./useBinderPages";
import styles from "./MoveCardControl.module.css";

export interface MoveTarget {
  /** Pages available to move into, including the trailing spare. */
  pageCount: number;
  onMove: (page: number, slot: number) => void;
}

/**
 * Keyboard-operable alternative to dragging.
 *
 * Dragging must not be the only way to arrange a binder — a pointer isn't
 * available to every user, and a precise move across many pages is genuinely
 * easier to type than to drag. Only shown while a custom arrangement is active,
 * since set order is read-only.
 */
export function MoveCardControl({ target }: { target: MoveTarget }) {
  const [page, setPage] = useState(1);
  const [slot, setSlot] = useState(1);

  return (
    <div className={styles.wrap}>
      <p className={styles.heading}>Move to pocket</p>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Page</span>
          <select
            className={styles.select}
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {Array.from({ length: target.pageCount }, (_, index) => (
              <option key={index} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Pocket</span>
          <select
            className={styles.select}
            value={slot}
            onChange={(event) => setSlot(Number(event.target.value))}
          >
            {Array.from({ length: POCKETS_PER_SHEET }, (_, index) => (
              <option key={index} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={styles.submit}
          // Both pickers are 1-based for humans; placements are 0-based.
          onClick={() => target.onMove(page - 1, slot - 1)}
        >
          Move
        </button>
      </div>
    </div>
  );
}

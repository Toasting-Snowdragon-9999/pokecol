import type { Card } from "../core/types";

/**
 * Natural compare, so card numbers order the way a collector expects:
 * 2 < 10 < 100, and TG01 < TG10 rather than falling into lexicographic order
 * where "10" sorts before "2".
 */
export function naturalCompare(a: string, b: string): number {
  const chunks = /(\d+)|(\D+)/g;
  const left = a.match(chunks) ?? [];
  const right = b.match(chunks) ?? [];

  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    const lNum = Number(l);
    const rNum = Number(r);
    const bothNumeric = !Number.isNaN(lNum) && !Number.isNaN(rNum);

    if (bothNumeric) {
      if (lNum !== rNum) return lNum - rNum;
    } else {
      const cmp = l.localeCompare(r, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp;
    }
  }

  return left.length - right.length;
}

/** Oldest set first, so flipping forward walks the collection chronologically. */
export function compareSetsByRelease(
  a: { releaseDate?: string; name: string; id: string },
  b: { releaseDate?: string; name: string; id: string },
): number {
  const dateA = a.releaseDate ?? "";
  const dateB = b.releaseDate ?? "";
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  return a.id.localeCompare(b.id);
}

/** Binder order: set by release date, then card number within the set. */
export function compareCardsForBinder(a: Card, b: Card): number {
  const bySet = compareSetsByRelease(a.set, b.set);
  if (bySet !== 0) return bySet;
  return naturalCompare(a.number, b.number);
}

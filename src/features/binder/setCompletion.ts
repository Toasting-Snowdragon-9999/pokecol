import type { Card } from "../../core/types";

/**
 * How far through a set the collection is.
 *
 * Measured in **distinct card numbers**, never quantities. Three copies of #4,
 * or #4 owned in normal + holo + reverse, all still mean exactly one thing:
 * "#4 collected". Anything else would let duplicates and printings inflate the
 * figure into meaninglessness.
 */
export interface SetCompletion {
  setId: string;
  /** Distinct numbers owned within the printed set. */
  owned: number;
  /** Nominal size of the printed set. */
  total: number;
  /** 0–100, rounded. `0` when the total is unknown. */
  percent: number;
  /** Secret rares owned — numbered beyond the printed total. */
  secretsOwned: number;
  /** Secret rares that exist in the set, when the roster is known. */
  secretsTotal: number;
  /** True once the full roster is loaded, so counts are trustworthy. */
  rosterKnown: boolean;
}

/**
 * Secret rares are numbered above the set's printed total — Sword & Shield
 * prints 202 cards but numbers run to 216. Anything non-numeric (`TG01`,
 * `SV49`) is treated as outside the printed run too, since it isn't part of
 * the plain 1..printedTotal sequence a collector is completing.
 */
export function isSecretNumber(number: string, printedTotal: number | undefined): boolean {
  if (!printedTotal) return false;
  const numeric = Number(number);
  return Number.isNaN(numeric) ? true : numeric > printedTotal;
}

export function computeSetCompletion(
  setId: string,
  printedTotal: number | undefined,
  ownedCards: Card[],
  roster: Card[] | undefined,
): SetCompletion {
  const ownedNumbers = new Set(ownedCards.map((card) => card.number));

  let owned = 0;
  let secretsOwned = 0;
  for (const number of ownedNumbers) {
    if (isSecretNumber(number, printedTotal)) secretsOwned++;
    else owned++;
  }

  /*
   * Prefer the roster's own count of main-set cards over `printedTotal`. The
   * two normally agree, but the roster is what actually exists — and when it
   * hasn't loaded yet, `printedTotal` still gives a usable denominator rather
   * than showing nothing.
   */
  let total = printedTotal ?? 0;
  let secretsTotal = 0;
  if (roster) {
    total = roster.filter((card) => !isSecretNumber(card.number, printedTotal)).length;
    secretsTotal = roster.length - total;
  }

  return {
    setId,
    owned,
    total,
    percent: total > 0 ? Math.round((owned / total) * 100) : 0,
    secretsOwned,
    secretsTotal,
    rosterKnown: roster !== undefined,
  };
}

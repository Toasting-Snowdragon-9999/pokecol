import { useMemo } from "react";
import type { Card, CardSet } from "../../core/types";

/** Classic binder page: three rows of three sleeves. */
export const POCKETS_PER_SHEET = 9;

export interface BinderSlot {
  card: Card | null;
  /** Total copies across every printing — what's physically in the sleeve. */
  quantity: number;
  /** Distinct printings owned. >1 renders the sleeve as a small stack. */
  variantCount: number;
}

export interface BinderSheetData {
  /** Stable key — a set can span several sheets. */
  id: string;
  /** `null` on a spare sheet that exists only to back the final leaf. */
  set: CardSet | null;
  /** 1-based index of this sheet within its set, for the page header. */
  sheetInSet: number;
  sheetsInSet: number;
  /** Header text for a set-less sheet. Omitted on a brand-new empty binder. */
  note?: string;
  slots: BinderSlot[];
}

function emptySlots(): BinderSlot[] {
  return Array.from({ length: POCKETS_PER_SHEET }, () => ({
    card: null,
    quantity: 0,
    variantCount: 0,
  }));
}

/** A spare sheet of empty pockets — room left to grow, like a real binder. */
function spareSheet(index: number, note?: string): BinderSheetData {
  return { id: `spare-${index}`, set: null, sheetInSet: 1, sheetsInSet: 1, note, slots: emptySlots() };
}

export interface BinderSpread {
  left: BinderSheetData | null;
  right: BinderSheetData | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Lay cards out into physical binder sheets.
 *
 * Cards arrive already sorted into binder order (set by release date, then card
 * number). Each set starts on a fresh sheet and its final sheet is padded with
 * empty pockets — the same way a real binder looks while you're still filling a
 * set, and the reason empty sleeves carry meaning here rather than being filler.
 */
export interface SlotCounts {
  quantityOf: (cardId: string) => number;
  variantCountOf: (cardId: string) => number;
}

export function buildSheets(cards: Card[], counts: SlotCounts): BinderSheetData[] {
  const sheets: BinderSheetData[] = [];

  let index = 0;
  while (index < cards.length) {
    const set = cards[index].set;

    const group: Card[] = [];
    while (index < cards.length && cards[index].set.id === set.id) {
      group.push(cards[index]);
      index++;
    }

    const groupSheets = chunk(group, POCKETS_PER_SHEET);
    groupSheets.forEach((sheetCards, sheetIndex) => {
      const slots: BinderSlot[] = sheetCards.map((card) => ({
        card,
        quantity: counts.quantityOf(card.id),
        variantCount: counts.variantCountOf(card.id),
      }));
      // Pad the set's last sheet so the 3x3 grid always holds nine pockets.
      while (slots.length < POCKETS_PER_SHEET) {
        slots.push({ card: null, quantity: 0, variantCount: 0 });
      }

      sheets.push({
        id: `${set.id}-${sheetIndex}`,
        set,
        sheetInSet: sheetIndex + 1,
        sheetsInSet: groupSheets.length,
        slots,
      });
    });
  }

  return sheets;
}

/**
 * Pair sheets into spreads. On a wide screen you see two facing pages; on a
 * narrow one the binder shows a single page at a time and the right side of
 * each spread stays empty.
 */
export function buildSpreads(sheets: BinderSheetData[], singlePage: boolean): BinderSpread[] {
  // An empty collection still gets a real page of sleeves — an open binder
  // waiting to be filled, rather than a collapsed shell.
  if (sheets.length === 0) {
    return singlePage
      ? [{ left: spareSheet(0), right: null }]
      : [{ left: spareSheet(0), right: spareSheet(1) }];
  }

  if (singlePage) return sheets.map((sheet) => ({ left: sheet, right: null }));

  /*
   * Every leaf is a physical sheet with pockets on both faces, so an odd sheet
   * count would leave the last leaf with a bare back. Padding to an even count
   * means both sides of every page always show sleeves.
   */
  const padded =
    sheets.length % 2 === 0 ? sheets : [...sheets, spareSheet(sheets.length, "Room to grow")];

  const spreads: BinderSpread[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    spreads.push({ left: padded[i], right: padded[i + 1] });
  }
  return spreads;
}

export function useBinderPages(cards: Card[], counts: SlotCounts, singlePage: boolean) {
  const sheets = useMemo(() => buildSheets(cards, counts), [cards, counts]);
  const spreads = useMemo(() => buildSpreads(sheets, singlePage), [sheets, singlePage]);
  return { sheets, spreads };
}

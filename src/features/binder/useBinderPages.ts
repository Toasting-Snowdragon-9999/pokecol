import { useMemo } from "react";
import type { Card, CardSet } from "../../core/types";
import { naturalCompare } from "../../lib/sortCards";
import { computeSetCompletion } from "./setCompletion";
import type { SetCompletion } from "./setCompletion";
import type { SetRosters } from "./useSetRosters";

/** Classic binder page: three rows of three sleeves. */
export const POCKETS_PER_SHEET = 9;

/**
 * `owned` shows only what you have, packed tight — the original behaviour and
 * still the default. `full` lays out a set's whole roster so an empty pocket
 * sits at the real position of the card that's missing from it.
 */
export type BinderView = "owned" | "full";

export interface BinderSlot {
  card: Card | null;
  /** Total copies across every printing — what's physically in the sleeve. */
  quantity: number;
  /** Distinct printings owned. >1 renders the sleeve as a small stack. */
  variantCount: number;
  /**
   * In `full` view an empty pocket still knows which card belongs there, so it
   * can be inspected and added. `card` stays null — nothing is owned yet.
   */
  missingCard?: Card;
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
  /** Progress through this sheet's set. Absent on set-less spare sheets. */
  completion?: SetCompletion;
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

export function buildSheets(
  cards: Card[],
  counts: SlotCounts,
  view: BinderView = "owned",
  rosters?: SetRosters,
): BinderSheetData[] {
  const sheets: BinderSheetData[] = [];

  let index = 0;
  while (index < cards.length) {
    const set = cards[index].set;

    const group: Card[] = [];
    while (index < cards.length && cards[index].set.id === set.id) {
      group.push(cards[index]);
      index++;
    }

    const roster = rosters?.get(set.id);
    const completion = computeSetCompletion(set.id, set.printedTotal, group, roster);

    /*
     * In full-set view the roster drives the layout and owned cards are slotted
     * into their real positions, so a gap sits exactly where the missing card
     * belongs. Without a roster (still loading, or the fetch failed) this falls
     * back to the owned layout rather than showing nothing.
     */
    const owned = new Map(group.map((card) => [card.id, card]));
    const layout: Card[] =
      view === "full" && roster
        ? [...roster].sort((a, b) => naturalCompare(a.number, b.number))
        : group;

    const groupSheets = chunk(layout, POCKETS_PER_SHEET);
    groupSheets.forEach((sheetCards, sheetIndex) => {
      const slots: BinderSlot[] = sheetCards.map((card) => {
        const held = owned.get(card.id);
        if (!held) {
          // A known gap: the pocket is empty but can still say what goes in it.
          return { card: null, quantity: 0, variantCount: 0, missingCard: card };
        }
        return {
          card: held,
          quantity: counts.quantityOf(card.id),
          variantCount: counts.variantCountOf(card.id),
        };
      });

      // Pad the set's last sheet so the 3x3 grid always holds nine pockets.
      while (slots.length < POCKETS_PER_SHEET) {
        slots.push({ card: null, quantity: 0, variantCount: 0 });
      }

      sheets.push({
        id: `${set.id}-${sheetIndex}`,
        set,
        sheetInSet: sheetIndex + 1,
        sheetsInSet: groupSheets.length,
        completion,
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

export function useBinderPages(
  cards: Card[],
  counts: SlotCounts,
  singlePage: boolean,
  view: BinderView = "owned",
  rosters?: SetRosters,
) {
  const sheets = useMemo(
    () => buildSheets(cards, counts, view, rosters),
    [cards, counts, view, rosters],
  );
  const spreads = useMemo(() => buildSpreads(sheets, singlePage), [sheets, singlePage]);
  return { sheets, spreads };
}

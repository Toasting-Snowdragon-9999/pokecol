import { describe, expect, it } from "vitest";
import { buildCustomSheets, buildSheets, buildSpreads, POCKETS_PER_SHEET } from "./useBinderPages";
import { placementKey } from "./layoutStore";
import type { Card, CardSet } from "../../core/types";

const counts = { quantityOf: () => 1, variantCountOf: () => 1 };

function set(id: string, releaseDate: string): CardSet {
  return { id, gameId: "pokemon", name: id, releaseDate, printedTotal: 100 };
}

function card(id: string, cardSet: CardSet, number = "1"): Card {
  return {
    id,
    gameId: "pokemon",
    name: id,
    number,
    set: cardSet,
    images: { small: "", large: "" },
    variants: [{ id: "normal", label: "Normal", finish: "normal" }],
    defaultVariantId: "normal",
  };
}

const base = set("base1", "1999-01-09");
const jungle = set("base2", "1999-06-16");

/** `n` cards in one set, numbered from 1. */
const many = (cardSet: CardSet, n: number) =>
  Array.from({ length: n }, (_, i) => card(`${cardSet.id}-${i + 1}`, cardSet, String(i + 1)));

describe("buildSheets — set order", () => {
  it("returns nothing for an empty collection", () => {
    expect(buildSheets([], counts)).toEqual([]);
  });

  it("always fills a sheet to nine pockets", () => {
    const sheets = buildSheets(many(base, 4), counts);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].slots).toHaveLength(POCKETS_PER_SHEET);
    // The four cards, then five real empty sleeves.
    expect(sheets[0].slots.filter((s) => s.card).length).toBe(4);
  });

  it("starts every set on a fresh sheet", () => {
    const sheets = buildSheets([...many(base, 2), ...many(jungle, 2)], counts);

    expect(sheets).toHaveLength(2);
    expect(sheets[0].set?.id).toBe("base1");
    expect(sheets[1].set?.id).toBe("base2");
    // A set never bleeds across a page break, even with room to spare.
    expect(sheets[0].slots.slice(2).every((s) => !s.card)).toBe(true);
  });

  it("chunks a large set across sheets and numbers them", () => {
    const sheets = buildSheets(many(base, 20), counts);

    expect(sheets).toHaveLength(3);
    expect(sheets.map((s) => s.sheetInSet)).toEqual([1, 2, 3]);
    expect(sheets.every((s) => s.sheetsInSet === 3)).toBe(true);
  });
});

describe("buildCustomSheets — hand-made order", () => {
  it("puts a placed card exactly where it was put", () => {
    const cards = many(base, 2);
    const placements = { [placementKey("pokemon", "base1-1")]: { page: 0, slot: 7 } };
    const sheets = buildCustomSheets(cards, counts, placements, "pokemon");

    expect(sheets[0].slots[7].card?.id).toBe("base1-1");
  });

  it("flows unplaced cards into the first free pockets", () => {
    const cards = many(base, 3);
    const placements = { [placementKey("pokemon", "base1-3")]: { page: 0, slot: 0 } };
    const sheets = buildCustomSheets(cards, counts, placements, "pokemon");

    expect(sheets[0].slots[0].card?.id).toBe("base1-3");
    expect(sheets[0].slots[1].card?.id).toBe("base1-1");
    expect(sheets[0].slots[2].card?.id).toBe("base1-2");
  });

  it("never loses a card to a stale duplicate placement", () => {
    const cards = many(base, 2);
    // Both claim the same pocket — one has to flow instead of vanishing.
    const placements = {
      [placementKey("pokemon", "base1-1")]: { page: 0, slot: 3 },
      [placementKey("pokemon", "base1-2")]: { page: 0, slot: 3 },
    };
    const sheets = buildCustomSheets(cards, counts, placements, "pokemon");

    const placed = sheets.flatMap((s) => s.slots).filter((s) => s.card).map((s) => s.card!.id);
    expect(placed.sort()).toEqual(["base1-1", "base1-2"]);
  });

  it("ignores another game's placements", () => {
    const cards = many(base, 1);
    const placements = { [placementKey("magic", "base1-1")]: { page: 0, slot: 8 } };
    const sheets = buildCustomSheets(cards, counts, placements, "pokemon");

    // Keyed by game, so a Magic placement can't move a Pokémon card.
    expect(sheets[0].slots[8].card).toBeNull();
    expect(sheets[0].slots[0].card?.id).toBe("base1-1");
  });

  it("always leaves a spare page to drag onto", () => {
    const sheets = buildCustomSheets(many(base, 2), counts, {}, "pokemon");
    expect(sheets.length).toBeGreaterThanOrEqual(2);
    expect(sheets[sheets.length - 1].slots.every((s) => !s.card)).toBe(true);
  });
});

describe("buildSpreads", () => {
  it("shows an open, empty binder rather than nothing at all", () => {
    const spreads = buildSpreads([], false);
    expect(spreads).toHaveLength(1);
    expect(spreads[0].left).not.toBeNull();
    expect(spreads[0].right).not.toBeNull();
  });

  it("gives one page per spread on a narrow screen", () => {
    const spreads = buildSpreads(buildSheets(many(base, 20), counts), true);
    expect(spreads).toHaveLength(3);
    expect(spreads.every((s) => s.right === null)).toBe(true);
  });

  it("pads to an even sheet count so no leaf has a bare back", () => {
    const spreads = buildSpreads(buildSheets(many(base, 20), counts), false);
    expect(spreads).toHaveLength(2);
    expect(spreads[1].right).not.toBeNull();
  });
});

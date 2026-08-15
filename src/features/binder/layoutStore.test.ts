import { beforeEach, describe, expect, it } from "vitest";
import { createLayoutStore, placementKey } from "./layoutStore";
import type { ArrangementEntry } from "./layoutStore";

const A = placementKey("pokemon", "base1-1");
const B = placementKey("pokemon", "base1-2");
const C = placementKey("pokemon", "base1-3");

beforeEach(() => localStorage.clear());

describe("place — swap semantics", () => {
  it("moves a card into an empty pocket", () => {
    const store = createLayoutStore();
    store.place("pokemon", A, 0, 4);

    expect(store.read("pokemon").placements[A]).toEqual({ page: 0, slot: 4 });
  });

  it("swaps two placed cards rather than displacing one", () => {
    const store = createLayoutStore();
    store.place("pokemon", A, 0, 0);
    store.place("pokemon", B, 0, 1);
    store.place("pokemon", A, 0, 1);

    const { placements } = store.read("pokemon");
    expect(placements[A]).toEqual({ page: 0, slot: 1 });
    // B takes A's old pocket — a card can never be pushed out of the binder.
    expect(placements[B]).toEqual({ page: 0, slot: 0 });
  });

  it("evicts the occupant when the moved card had no placement", () => {
    const store = createLayoutStore();
    store.place("pokemon", B, 0, 1);
    store.place("pokemon", A, 0, 1);

    const { placements } = store.read("pokemon");
    expect(placements[A]).toEqual({ page: 0, slot: 1 });
    // Nothing to swap into, so B goes back to flowing.
    expect(placements[B]).toBeUndefined();
  });
});

describe("place — baseline freeze", () => {
  const baseline: ArrangementEntry[] = [
    { key: A, page: 0, slot: 0 },
    { key: B, page: 0, slot: 1 },
    { key: C, page: 0, slot: 2 },
  ];

  it("pins every visible card so the page can't re-pack around the move", () => {
    const store = createLayoutStore();
    store.place("pokemon", A, 0, 5, baseline);

    const { placements } = store.read("pokemon");
    expect(placements[A]).toEqual({ page: 0, slot: 5 });
    expect(placements[B]).toEqual({ page: 0, slot: 1 });
    expect(placements[C]).toEqual({ page: 0, slot: 2 });
  });

  it("does not overwrite a placement the collector already made", () => {
    const store = createLayoutStore();
    store.place("pokemon", B, 1, 8);
    store.place("pokemon", A, 0, 5, baseline);

    expect(store.read("pokemon").placements[B]).toEqual({ page: 1, slot: 8 });
  });
});

describe("undo", () => {
  it("restores both pockets exactly", () => {
    const store = createLayoutStore();
    store.place("pokemon", A, 0, 0);
    store.place("pokemon", B, 0, 1);
    const before = { ...store.read("pokemon").placements };

    store.place("pokemon", A, 0, 1);
    store.undo();

    expect(store.read("pokemon").placements).toEqual(before);
  });

  it("undoes the baseline freeze along with the move", () => {
    const store = createLayoutStore();
    store.place("pokemon", A, 0, 5, [
      { key: A, page: 0, slot: 0 },
      { key: B, page: 0, slot: 1 },
    ]);
    store.undo();

    // The freeze was part of the move, so taking the move back takes it too.
    expect(store.read("pokemon").placements).toEqual({});
  });

  it("is a single step, not a redo toggle", () => {
    const store = createLayoutStore();
    store.place("pokemon", A, 0, 0);
    store.place("pokemon", A, 0, 3);

    store.undo();
    const afterUndo = { ...store.read("pokemon").placements };
    store.undo();

    expect(store.canUndo()).toBe(false);
    expect(store.read("pokemon").placements).toEqual(afterUndo);
  });

  it("only ever reverts the most recent move", () => {
    const store = createLayoutStore();
    store.place("pokemon", A, 0, 0);
    store.place("pokemon", A, 0, 3);
    store.place("pokemon", A, 0, 6);
    store.undo();

    expect(store.read("pokemon").placements[A]).toEqual({ page: 0, slot: 3 });
    expect(store.canUndo()).toBe(false);
  });

  it("tracks availability across move, undo and clear", () => {
    const store = createLayoutStore();
    expect(store.canUndo()).toBe(false);

    store.place("pokemon", A, 0, 0);
    expect(store.canUndo()).toBe(true);

    store.undo();
    expect(store.canUndo()).toBe(false);

    store.place("pokemon", A, 0, 1);
    store.clear("pokemon");
    expect(store.canUndo()).toBe(false);
  });
});

describe("per-game partitioning", () => {
  it("keeps each game's arrangement to itself", () => {
    const store = createLayoutStore();
    store.place("pokemon", A, 0, 0);
    store.place("magic", placementKey("magic", "abc"), 0, 4);

    expect(Object.keys(store.read("pokemon").placements)).toEqual([A]);
    expect(Object.keys(store.read("magic").placements)).toEqual([placementKey("magic", "abc")]);
  });

  it("clears one game without touching another", () => {
    const store = createLayoutStore();
    store.place("pokemon", A, 0, 0);
    store.place("magic", placementKey("magic", "abc"), 0, 4);

    store.clear("pokemon");

    expect(store.read("pokemon").placements).toEqual({});
    expect(store.read("magic").placements).not.toEqual({});
  });

  it("undoes into the game the move was made in", () => {
    const store = createLayoutStore();
    store.place("magic", placementKey("magic", "abc"), 0, 4);
    store.place("pokemon", A, 0, 0);
    store.undo();

    expect(store.read("pokemon").placements).toEqual({});
    expect(store.read("magic").placements[placementKey("magic", "abc")]).toEqual({
      page: 0,
      slot: 4,
    });
  });
});

describe("migration", () => {
  it("folds a pre-CardCol Pokémon layout into the per-game shape", () => {
    localStorage.setItem(
      "pokecol.layout.v1",
      JSON.stringify({ version: 1, placements: { [A]: { page: 2, slot: 3 } } }),
    );

    const store = createLayoutStore();
    expect(store.read("pokemon").placements[A]).toEqual({ page: 2, slot: 3 });
    // Kept as a rollback copy rather than rewritten away.
    expect(localStorage.getItem("pokecol.layout.v1")).not.toBeNull();
  });

  it("drops malformed rows instead of failing the whole layout", () => {
    localStorage.setItem(
      "cardcol.layout.v2",
      JSON.stringify({
        version: 2,
        byGame: { pokemon: { [A]: { page: 0, slot: 1 }, [B]: { page: -1, slot: "x" } } },
      }),
    );

    const store = createLayoutStore();
    const { placements } = store.read("pokemon");
    expect(placements[A]).toEqual({ page: 0, slot: 1 });
    expect(placements[B]).toBeUndefined();
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("cardcol.layout.v2", "{not json");
    expect(createLayoutStore().read("pokemon").placements).toEqual({});
  });
});

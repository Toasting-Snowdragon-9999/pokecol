import { beforeEach, describe, expect, it } from "vitest";
import { live, mergeByUpdatedAt, pruneTombstones, TOMBSTONE_TTL_MS } from "./sync";
import { createLocalCollectionStore } from "../collection/store";
import { createLocalWishlistStore } from "../wishlist/store";

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe("mergeByUpdatedAt", () => {
  const identity = (e: { id: string }) => e.id;

  it("takes the later write", () => {
    const merged = mergeByUpdatedAt(
      [{ id: "a", updatedAt: iso(-1000), quantity: 1 }],
      [{ id: "a", updatedAt: iso(0), quantity: 4 }],
      identity,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(4);
  });

  it("keeps rows only one side has ever seen", () => {
    const merged = mergeByUpdatedAt(
      [{ id: "a", updatedAt: iso(0) }],
      [{ id: "b", updatedAt: iso(0) }],
      identity,
    );
    expect(merged.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("does not resurrect a card deleted on the other device", () => {
    // The whole reason tombstones exist: without one, the remote's live row
    // looks like news and the delete is silently undone.
    const merged = mergeByUpdatedAt(
      [{ id: "a", updatedAt: iso(0), deleted: true }],
      [{ id: "a", updatedAt: iso(-5000) }],
      identity,
    );
    expect(merged[0].deleted).toBe(true);
  });

  it("lets a later re-add win over an earlier delete", () => {
    const merged = mergeByUpdatedAt(
      [{ id: "a", updatedAt: iso(-5000), deleted: true }],
      [{ id: "a", updatedAt: iso(0) }],
      identity,
    );
    expect(merged[0].deleted).toBeUndefined();
  });

  it("breaks an exact tie in favour of the delete", () => {
    const at = iso(0);
    const merged = mergeByUpdatedAt(
      [{ id: "a", updatedAt: at }],
      [{ id: "a", updatedAt: at, deleted: true }],
      identity,
    );
    expect(merged[0].deleted).toBe(true);
  });
});

describe("pruneTombstones", () => {
  it("keeps live rows regardless of age", () => {
    const entries = [{ updatedAt: iso(-TOMBSTONE_TTL_MS * 3) }];
    expect(pruneTombstones(entries)).toHaveLength(1);
  });

  it("drops tombstones past the window", () => {
    const entries = [{ updatedAt: iso(-TOMBSTONE_TTL_MS - 1000), deleted: true }];
    expect(pruneTombstones(entries)).toHaveLength(0);
  });

  it("keeps tombstones inside the window", () => {
    const entries = [{ updatedAt: iso(-1000), deleted: true }];
    expect(pruneTombstones(entries)).toHaveLength(1);
  });

  it("keeps a tombstone whose timestamp is unreadable", () => {
    // Losing one costs a resurrected card, which is the worse failure.
    expect(pruneTombstones([{ updatedAt: "not a date", deleted: true }])).toHaveLength(1);
  });
});

describe("live", () => {
  it("hides tombstones from callers", () => {
    const entries = [{ updatedAt: iso(0) }, { updatedAt: iso(0), deleted: true }];
    expect(live(entries)).toHaveLength(1);
  });
});

beforeEach(() => localStorage.clear());

describe("collection store — tombstones", () => {
  it("stamps updatedAt on a new entry", async () => {
    const store = createLocalCollectionStore();
    await store.setQuantity("pokemon", "base1-4", "holofoil", 1);

    const [entry] = await store.list("pokemon");
    expect(entry.updatedAt).toBeTruthy();
    expect(Date.parse(entry.updatedAt)).not.toBeNaN();
  });

  it("tombstones on removal instead of dropping the row", async () => {
    const store = createLocalCollectionStore();
    await store.setQuantity("pokemon", "base1-4", "holofoil", 1);
    await store.setQuantity("pokemon", "base1-4", "holofoil", 0);

    // Gone from the binder…
    expect(await store.list("pokemon")).toHaveLength(0);
    // …but still on disk, so another device can learn about the delete.
    const stored = JSON.parse(localStorage.getItem("cardcol.collection.v4")!);
    expect(stored.entries).toHaveLength(1);
    expect(stored.entries[0].deleted).toBe(true);
  });

  it("revives the same row when a removed printing is re-added", async () => {
    const store = createLocalCollectionStore();
    await store.setQuantity("pokemon", "base1-4", "holofoil", 2);
    await store.setQuantity("pokemon", "base1-4", "holofoil", 0);
    await store.setQuantity("pokemon", "base1-4", "holofoil", 3);

    const entries = await store.list("pokemon");
    expect(entries).toHaveLength(1);
    expect(entries[0].quantity).toBe(3);

    const stored = JSON.parse(localStorage.getItem("cardcol.collection.v4")!);
    expect(stored.entries).toHaveLength(1);
  });

  it("tombstones a whole game on clear, leaving other games alone", async () => {
    const store = createLocalCollectionStore();
    await store.setQuantity("pokemon", "base1-4", "holofoil", 1);
    await store.setQuantity("magic", "abc", "nonfoil", 1);
    await store.clear("pokemon");

    expect(await store.list("pokemon")).toHaveLength(0);
    expect(await store.list("magic")).toHaveLength(1);
  });

  it("migrates v3 rows by stamping updatedAt from addedAt", async () => {
    const addedAt = "2024-01-02T03:04:05.000Z";
    localStorage.setItem(
      "cardcol.collection.v3",
      JSON.stringify({
        version: 3,
        entries: [
          { gameId: "pokemon", cardId: "base1-4", variantId: "holofoil", quantity: 2, addedAt },
        ],
      }),
    );

    const [entry] = await createLocalCollectionStore().list("pokemon");
    expect(entry.quantity).toBe(2);
    expect(entry.updatedAt).toBe(addedAt);
    // Kept as a rollback copy.
    expect(localStorage.getItem("cardcol.collection.v3")).not.toBeNull();
  });
});

describe("wishlist store — tombstones", () => {
  it("tombstones on removal", async () => {
    const store = createLocalWishlistStore();
    await store.add("pokemon", "base1-4", "holofoil");
    await store.remove("pokemon", "base1-4", "holofoil");

    expect(await store.list("pokemon")).toHaveLength(0);
    const stored = JSON.parse(localStorage.getItem("cardcol.wishlist.v2")!);
    expect(stored.entries[0].deleted).toBe(true);
  });

  it("revives a removed entry when re-added", async () => {
    const store = createLocalWishlistStore();
    await store.add("pokemon", "base1-4", "holofoil");
    await store.remove("pokemon", "base1-4", "holofoil");
    await store.add("pokemon", "base1-4", "holofoil");

    expect(await store.list("pokemon")).toHaveLength(1);
  });

  it("changing the wanted printing leaves exactly one live row", async () => {
    const store = createLocalWishlistStore();
    await store.add("pokemon", "base1-4", "holofoil");
    await store.setVariant("pokemon", "base1-4", "holofoil", "reverseHolofoil");

    const entries = await store.list("pokemon");
    expect(entries).toHaveLength(1);
    expect(entries[0].variantId).toBe("reverseHolofoil");
  });

  it("collapses onto one row when the target printing is already wanted", async () => {
    const store = createLocalWishlistStore();
    await store.add("pokemon", "base1-4", "holofoil");
    await store.add("pokemon", "base1-4", "reverseHolofoil");
    await store.setVariant("pokemon", "base1-4", "holofoil", "reverseHolofoil");

    const entries = await store.list("pokemon");
    expect(entries).toHaveLength(1);
    expect(entries[0].variantId).toBe("reverseHolofoil");
  });

  it("migrates v1 rows", async () => {
    localStorage.setItem(
      "cardcol.wishlist.v1",
      JSON.stringify({
        version: 1,
        entries: [
          {
            gameId: "pokemon",
            cardId: "base1-4",
            variantId: "holofoil",
            addedAt: "2024-05-06T00:00:00.000Z",
          },
        ],
      }),
    );

    const [entry] = await createLocalWishlistStore().list("pokemon");
    expect(entry.updatedAt).toBe("2024-05-06T00:00:00.000Z");
  });
});

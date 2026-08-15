import { describe, expect, it } from "vitest";
import { normaliseCard as normalisePokemon } from "./pokemon/normalize";
import { normaliseCard as normaliseMagic } from "./magic/normalize";
import { normaliseCard as normaliseYugioh } from "./yugioh/normalize";
import { normaliseCard as normaliseLorcana } from "./lorcana/normalize";
import type { Card } from "../core/types";

import pokemonCard from "./__fixtures__/pokemon-card.json";
import magicCard from "./__fixtures__/magic-card.json";
import yugiohCard from "./__fixtures__/yugioh-card.json";
import lorcanaCard from "./__fixtures__/lorcana-card.json";

/**
 * Normalisers, run against responses captured from the live APIs.
 *
 * The point is early warning: these providers are free services that reshape
 * their payloads without notice, and a silently-renamed field would otherwise
 * show up as blank cards in the binder rather than as a failure.
 *
 * Refresh a fixture by re-fetching the same card — see README.
 */

/** Everything above the provider layer assumes all of this. */
function expectValidCard(card: Card) {
  expect(card.id).toBeTruthy();
  expect(card.name).toBeTruthy();
  expect(card.number).toBeTruthy();
  expect(card.set.id).toBeTruthy();
  expect(card.set.gameId).toBe(card.gameId);
  // Never empty, and the default must actually be one of them.
  expect(card.variants.length).toBeGreaterThan(0);
  expect(card.variants.map((v) => v.id)).toContain(card.defaultVariantId);
  for (const variant of card.variants) {
    expect(variant.label).toBeTruthy();
    expect(variant.finish).toBeTruthy();
  }
  // Prices are keyed by variant id — that's what makes per-printing value work.
  for (const key of Object.keys(card.prices ?? {})) {
    expect(card.variants.map((v) => v.id)).toContain(key);
    expect(card.prices?.[key]?.amount).toBeGreaterThan(0);
  }
}

describe("pokémon normaliser", () => {
  const card = normalisePokemon(pokemonCard as never);

  it("produces a valid card", () => expectValidCard(card));

  it("reads identity and set from the payload", () => {
    expect(card.gameId).toBe("pokemon");
    expect(card.name).toBe("Charizard");
    expect(card.set.id).toBe("base1");
    // The API returns 1999/01/09; binder ordering needs it comparable.
    expect(card.set.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("derives variants from the tcgplayer price keys", () => {
    expect(card.variants.map((v) => v.id)).toEqual(["holofoil"]);
    expect(card.variants[0].label).toBe("Holo");
    expect(card.variants[0].finish).toBe("holo");
  });

  it("keeps the price values, not just the keys", () => {
    expect(card.prices?.holofoil?.amount).toBeGreaterThan(0);
    expect(card.prices?.holofoil?.source).toBe("TCGplayer");
  });

  it("flattens game facts into details", () => {
    const labels = (card.details ?? []).map((d) => d.label);
    expect(labels).toContain("HP");
    expect(labels).toContain("Type");
  });
});

describe("magic normaliser", () => {
  const card = normaliseMagic(magicCard as never);

  it("produces a valid card", () => expectValidCard(card));

  it("reads identity from the payload", () => {
    expect(card.gameId).toBe("magic");
    expect(card.name).toBe("Sol Ring");
    expect(card.number).toBeTruthy();
  });

  it("takes variants from the real finishes array", () => {
    expect(card.variants.map((v) => v.id)).toContain("nonfoil");
    expect(card.variants.find((v) => v.id === "nonfoil")?.finish).toBe("normal");
  });

  it("maps prices onto the matching finish", () => {
    // usd → nonfoil, usd_foil → foil. Absent prices stay absent.
    if (card.prices?.nonfoil) expect(card.prices.nonfoil.source).toBe("Scryfall");
    expect(Object.keys(card.prices ?? {}).every((k) => card.variants.some((v) => v.id === k))).toBe(
      true,
    );
  });
});

describe("yu-gi-oh normaliser", () => {
  const card = normaliseYugioh(yugiohCard as never);

  it("produces a valid card", () => expectValidCard(card));

  it("reads identity from the payload", () => {
    expect(card.gameId).toBe("yugioh");
    expect(card.name).toBe("Dark Magician");
  });

  it("picks one canonical set from many printings", () => {
    // A card printed a dozen times still needs exactly one home in the binder.
    expect(card.set.id).toBeTruthy();
    expect(card.set.name).toBeTruthy();
  });

  it("turns printing rarities into variants", () => {
    expect(card.variants.length).toBeGreaterThan(0);
    expect(card.variants.every((v) => v.label.length > 0)).toBe(true);
  });

  it("lists the other printings as a detail rather than losing them", () => {
    const labels = (card.details ?? []).map((d) => d.label);
    expect(labels.some((l) => l.startsWith("Also printed in"))).toBe(true);
  });
});

describe("lorcana normaliser", () => {
  const card = normaliseLorcana(lorcanaCard as never);

  it("produces a valid card", () => expectValidCard(card));

  it("reads identity from the payload", () => {
    expect(card.gameId).toBe("lorcana");
    expect(card.name).toContain("Elsa");
  });

  it("always offers normal and foil", () => {
    expect(card.variants.map((v) => v.id)).toEqual(["normal", "foil"]);
    expect(card.defaultVariantId).toBe("normal");
  });

  it("prices each printing separately", () => {
    if (card.prices?.normal && card.prices?.foil) {
      expect(card.prices.normal.amount).not.toBe(card.prices.foil.amount);
    }
  });
});

describe("missing data", () => {
  /** The fixture with its pricing block swapped out. */
  const withTcgplayer = (tcgplayer: unknown) =>
    normalisePokemon({ ...(pokemonCard as object), tcgplayer } as Parameters<
      typeof normalisePokemon
    >[0]);

  it("does not invent a price when the provider has none", () => {
    const card = withTcgplayer(undefined);
    expect(card.prices).toBeUndefined();
    // Still a usable card — an unpriced printing is not a broken one.
    expect(card.variants.map((v) => v.id)).toEqual(["unspecified"]);
  });

  it("does not treat a zero price as a real one", () => {
    // Zero means "no data" here, and a free Charizard is not a thing.
    expect(withTcgplayer({ prices: { holofoil: { market: 0, mid: null } } }).prices).toBeUndefined();
  });

  it("falls back to mid when market is missing", () => {
    const card = withTcgplayer({ prices: { holofoil: { market: null, mid: 12.5 } } });
    expect(card.prices?.holofoil).toMatchObject({ amount: 12.5, kind: "mid" });
  });
});

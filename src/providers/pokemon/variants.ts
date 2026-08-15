import type { CardVariant, VariantFinish } from "../../core/types";
import type { CardPrice, CardPriceMap } from "../../core/pricing";
import type { PokemonApiCard } from "./types";

/**
 * Pokémon print variants.
 *
 * The variant list for a card comes from the keys of `tcgplayer.prices`. That
 * object is the only reliable per-card variant signal the API offers: a key is
 * present only when that print actually exists, and the keys track era
 * correctly (Base Set Charizard is holofoil-only; a modern common is normal +
 * reverse holo; a Gym-era rare is 1st Edition + unlimited).
 *
 * Sampling 533 cards across nine sets from 1999 to 2026 turned up exactly the
 * seven keys below and no others, with 99.4% of cards carrying the field.
 *
 * `cardmarket.prices` is NOT usable for this. It carries `reverseHoloAvg1`,
 * `reverseHoloSell` and friends on *every* card, including 1999 Base Set where
 * no reverse holo has ever been printed — it is a fixed schema, not a statement
 * about the card.
 *
 * This file is the only place these Pokémon-specific ids exist. Everything
 * above the provider treats a variant id as an opaque string.
 */

/** Fallback for the ~0.6% of cards with no pricing data, and the target that
 *  pre-variant collection entries migrate onto. */
export const UNSPECIFIED_VARIANT_ID = "unspecified";

const LABELS: Record<string, string> = {
  normal: "Normal",
  holofoil: "Holo",
  reverseHolofoil: "Reverse Holo",
  "1stEdition": "1st Edition",
  "1stEditionHolofoil": "1st Ed. Holo",
  unlimited: "Unlimited",
  unlimitedHolofoil: "Unlimited Holo",
  [UNSPECIFIED_VARIANT_ID]: "Unspecified",
};

/**
 * Preference order for one-click "add". The plainest print a collector is most
 * likely to own wins.
 *
 * 1st Edition sits deliberately last: silently recording an ordinary card as a
 * valuable 1st Edition is a worse failure than making someone pick it on
 * purpose.
 */
const RANK = [
  "normal",
  "holofoil",
  "unlimited",
  "unlimitedHolofoil",
  "reverseHolofoil",
  "1stEdition",
  "1stEditionHolofoil",
];

/** Pokémon print ids mapped onto the cross-game buckets. Advisory only. */
const FINISHES: Record<string, VariantFinish> = {
  normal: "normal",
  holofoil: "holo",
  reverseHolofoil: "reverseHolo",
  "1stEdition": "firstEdition",
  "1stEditionHolofoil": "firstEdition",
  unlimited: "unlimited",
  unlimitedHolofoil: "unlimited",
  [UNSPECIFIED_VARIANT_ID]: "unspecified",
};

export function variantLabel(id: string): string {
  return LABELS[id] ?? id;
}

function finishOf(id: string): VariantFinish {
  return FINISHES[id] ?? "special";
}

function rankOf(id: string): number {
  const index = RANK.indexOf(id);
    // Unknown keys sort last but stay usable, so a new print the API starts
    // returning shows up rather than being silently dropped.
  return index === -1 ? RANK.length : index;
}

/** Variants for a card, in preference order. Never empty. */
export function extractVariants(raw: Pick<PokemonApiCard, "tcgplayer">): CardVariant[] {
  const keys = Object.keys(raw.tcgplayer?.prices ?? {});
  if (keys.length === 0) {
    return [
      {
        id: UNSPECIFIED_VARIANT_ID,
        label: variantLabel(UNSPECIFIED_VARIANT_ID),
        finish: "unspecified",
      },
    ];
  }

  return keys
    .slice()
    .sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b))
    .map((id) => ({ id, label: variantLabel(id), finish: finishOf(id) }));
}

/**
 * Market price per printing, keyed by the same variant ids as `extractVariants`.
 *
 * TCGplayer's `market` is the figure to use — `low`/`mid` describe current
 * listings rather than what cards actually change hands for. `mid` is taken
 * only when `market` is absent, and a printing with neither is simply left out:
 * unknown has to stay distinguishable from free.
 */
export function extractPrices(raw: Pick<PokemonApiCard, "tcgplayer">): CardPriceMap | undefined {
  const prices = raw.tcgplayer?.prices;
  if (!prices) return undefined;

  const updatedAt = raw.tcgplayer?.updatedAt;
  const map: CardPriceMap = {};
  let found = false;

  for (const [id, value] of Object.entries(prices)) {
    if (!value) continue;
    const market = typeof value.market === "number" ? value.market : null;
    const mid = typeof value.mid === "number" ? value.mid : null;
    const amount = market ?? mid;
    if (amount === null || !Number.isFinite(amount) || amount <= 0) continue;

    const price: CardPrice = {
      amount,
      currency: "USD",
      source: "TCGplayer",
      kind: market !== null ? "market" : "mid",
      updatedAt,
    };
    map[id] = price;
    found = true;
  }

  return found ? map : undefined;
}

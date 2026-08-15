import type { Card, CardDetail, CardSet, CardVariant, VariantFinish } from "../../core/types";
import type { CardPriceMap } from "../../core/pricing";
import type { YgoCard, YgoCardSet } from "./types";

const CARD_BACK = "https://images.ygoprodeck.com/images/cards/back.jpg";

/**
 * Rarity codes to a finish bucket. Yu-Gi-Oh has dozens of treatments and adds
 * more every set, so this only claims the common ones and lets the rest fall
 * through to `special` — the printed label is what the reader actually sees.
 */
const RARITY_FINISH: [RegExp, VariantFinish][] = [
  [/^common$/i, "normal"],
  [/secret|ultimate|ghost|starlight|collector/i, "special"],
  [/ultra|super/i, "holo"],
  [/parallel/i, "parallel"],
  [/rare/i, "normal"],
];

function finishOf(rarity: string | undefined): VariantFinish {
  if (!rarity) return "unspecified";
  for (const [pattern, finish] of RARITY_FINISH) {
    if (pattern.test(rarity)) return finish;
  }
  return "special";
}

/**
 * The card's canonical home.
 *
 * A card can appear in dozens of sets; the binder needs exactly one place for
 * it, so the earliest printing wins. Ties fall back to set code order so the
 * choice is at least stable between loads.
 */
function canonicalSet(raw: YgoCard): YgoCardSet | undefined {
  const sets = raw.card_sets;
  if (!sets?.length) return undefined;
  return sets.slice().sort((a, b) => a.set_code.localeCompare(b.set_code))[0];
}

/**
 * One variant per printing, deduplicated by rarity.
 *
 * Printings are the closest thing this game has to Pokémon's holo/reverse
 * split: the same card as a Common and as a Secret Rare are different objects
 * to a collector and priced an order of magnitude apart.
 */
function extractVariants(raw: YgoCard): CardVariant[] {
  const seen = new Map<string, CardVariant>();
  for (const set of raw.card_sets ?? []) {
    const rarity = set.set_rarity?.trim();
    if (!rarity || seen.has(rarity)) continue;
    seen.set(rarity, { id: rarity, label: rarity, finish: finishOf(rarity) });
  }
  if (seen.size === 0) {
    return [{ id: "unspecified", label: "Unspecified", finish: "unspecified" }];
  }
  // Commonest print first, so a one-click add records the likely one.
  return [...seen.values()].sort((a, b) => (a.finish === "normal" ? -1 : 0) - (b.finish === "normal" ? -1 : 0));
}

function toAmount(value: string | undefined): number | null {
  if (!value) return null;
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * Prices here are per *card*, not per printing, so every variant gets the same
 * figure. Flagged `mid` rather than `market` because that is honestly what it
 * is: a blended vendor number, not the price of the printing you own.
 */
function extractPrices(raw: YgoCard, variants: CardVariant[]): CardPriceMap | undefined {
  const prices = raw.card_prices?.[0];
  if (!prices) return undefined;

  const amount = toAmount(prices.tcgplayer_price) ?? toAmount(prices.cardmarket_price);
  if (amount === null) return undefined;

  const source = toAmount(prices.tcgplayer_price) !== null ? "TCGplayer" : "Cardmarket";
  const map: CardPriceMap = {};
  for (const variant of variants) {
    map[variant.id] = { amount, currency: "USD", source, kind: "mid" };
  }
  return map;
}

function buildDetails(raw: YgoCard): CardDetail[] {
  const details: CardDetail[] = [];
  if (raw.attribute) details.push({ label: "Attribute", value: raw.attribute });
  if (raw.race) details.push({ label: "Type", value: raw.race });
  if (typeof raw.level === "number") details.push({ label: "Level / Rank", value: String(raw.level) });
  if (typeof raw.linkval === "number") details.push({ label: "Link rating", value: String(raw.linkval) });
  if (typeof raw.scale === "number") details.push({ label: "Pendulum scale", value: String(raw.scale) });
  if (typeof raw.atk === "number") {
    const def = typeof raw.def === "number" ? ` / ${raw.def}` : "";
    details.push({ label: "ATK / DEF", value: `${raw.atk}${def}` });
  }
  if (raw.archetype) details.push({ label: "Archetype", value: raw.archetype });
  if (raw.desc) details.push({ label: "Card text", value: raw.desc });

  // Every other printing, since only one could be the card's binder home.
  const printings = raw.card_sets ?? [];
  if (printings.length > 1) {
    details.push({
      label: `Also printed in (${printings.length - 1})`,
      value: printings
        .slice(1, 9)
        .map((set) => `${set.set_name} (${set.set_code})`)
        .join(", "),
    });
  }

  return details;
}

export function normaliseCard(raw: YgoCard): Card {
  const variants = extractVariants(raw);
  const set = canonicalSet(raw);
  const image = raw.card_images?.[0];
  const releaseDate = raw.misc_info?.[0]?.tcg_date;

  return {
    id: String(raw.id),
    gameId: "yugioh",
    name: raw.name,
    // The set code carries the collector number, e.g. "LOB-EN001" → "EN001".
    number: set?.set_code.split("-").pop() ?? String(raw.id),
    rarity: set?.set_rarity,
    subtitle: raw.humanReadableCardType ?? raw.type,
    types: raw.attribute ? [raw.attribute] : undefined,
    set: {
      id: set?.set_name ?? "Unknown set",
      gameId: "yugioh",
      name: set?.set_name ?? "Unknown set",
      series: raw.type,
      releaseDate,
    },
    images: {
      small: image?.image_url_small ?? image?.image_url ?? CARD_BACK,
      large: image?.image_url ?? CARD_BACK,
    },
    details: buildDetails(raw),
    variants,
    defaultVariantId: variants[0].id,
    prices: extractPrices(raw, variants),
  };
}

/** Distinct sets across a batch of cards, for callers that need a set list. */
export function setsFromCards(cards: Card[]): CardSet[] {
  const bySet = new Map<string, CardSet>();
  for (const card of cards) {
    if (!bySet.has(card.set.id)) bySet.set(card.set.id, card.set);
  }
  return [...bySet.values()];
}

import type { Card, CardDetail, CardSet, CardVariant, VariantFinish } from "../../core/types";
import type { CardPriceMap } from "../../core/pricing";
import type { ScryfallCard, ScryfallImageUris, ScryfallPrices, ScryfallSet } from "./types";

const CARD_BACK = "https://cards.scryfall.io/back.png";

export function normaliseSet(raw: ScryfallSet): CardSet {
  return {
    id: raw.code,
    gameId: "magic",
    name: raw.name,
    // Scryfall has no "series"; the set type is the nearest useful grouping.
    series: raw.set_type ? titleCase(raw.set_type) : undefined,
    printedTotal: raw.card_count,
    total: raw.card_count,
    releaseDate: raw.released_at,
    symbolUrl: raw.icon_svg_uri,
  };
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Scryfall finishes map cleanly onto the shared buckets — this is the one game
 * where "which printings exist" is stated outright rather than inferred.
 */
const FINISH_LABELS: Record<string, { label: string; finish: VariantFinish }> = {
  nonfoil: { label: "Non-foil", finish: "normal" },
  foil: { label: "Foil", finish: "foil" },
  etched: { label: "Etched Foil", finish: "etched" },
  glossy: { label: "Glossy", finish: "special" },
};

function extractVariants(raw: ScryfallCard): CardVariant[] {
  const finishes = raw.finishes?.length ? raw.finishes : ["nonfoil"];
  return finishes.map((id) => {
    const known = FINISH_LABELS[id];
    return { id, label: known?.label ?? titleCase(id), finish: known?.finish ?? "special" };
  });
}

/** Scryfall prices are decimal strings, and `null` where it has no data. */
function toAmount(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** Price keys line up with `finishes`, which is what makes per-variant pricing free. */
const PRICE_BY_FINISH: Record<string, keyof ScryfallPrices> = {
  nonfoil: "usd",
  foil: "usd_foil",
  etched: "usd_etched",
};

function extractPrices(raw: ScryfallCard): CardPriceMap | undefined {
  const prices = raw.prices;
  if (!prices) return undefined;

  const map: CardPriceMap = {};
  let found = false;
  for (const finish of raw.finishes ?? ["nonfoil"]) {
    const amount = toAmount(prices[PRICE_BY_FINISH[finish] ?? "usd"]);
    if (amount === null) continue;
    map[finish] = { amount, currency: "USD", source: "Scryfall", kind: "market" };
    found = true;
  }
  return found ? map : undefined;
}

/** Double-faced cards keep their art on the faces; fall back to the front one. */
function imagesOf(raw: ScryfallCard): ScryfallImageUris {
  return raw.image_uris ?? raw.card_faces?.[0]?.image_uris ?? {};
}

function buildDetails(raw: ScryfallCard): CardDetail[] {
  const details: CardDetail[] = [];
  const face = raw.card_faces?.[0];
  const manaCost = raw.mana_cost ?? face?.mana_cost;
  const text = raw.oracle_text ?? face?.oracle_text;

  if (manaCost) details.push({ label: "Mana cost", value: manaCost });
  if (typeof raw.cmc === "number") details.push({ label: "Mana value", value: String(raw.cmc) });
  if (raw.power && raw.toughness) {
    details.push({ label: "Power / Toughness", value: `${raw.power} / ${raw.toughness}` });
  }
  if (raw.loyalty) details.push({ label: "Loyalty", value: raw.loyalty });
  if (raw.color_identity?.length) {
    details.push({ label: "Colour identity", value: raw.color_identity.join(", ") });
  }
  if (raw.keywords?.length) details.push({ label: "Keywords", value: raw.keywords.join(", ") });
  if (text) details.push({ label: "Rules text", value: text });
  if (raw.flavor_text) details.push({ label: "Flavour text", value: raw.flavor_text });

  // The back of a double-faced card is a fact worth surfacing, not a second card.
  const back = raw.card_faces?.[1];
  if (back?.name) {
    details.push({ label: "Reverse face", value: [back.name, back.type_line].filter(Boolean).join(" — ") });
  }

  return details;
}

export function normaliseCard(raw: ScryfallCard): Card {
  const variants = extractVariants(raw);
  const images = imagesOf(raw);

  return {
    id: raw.id,
    gameId: "magic",
    name: raw.name,
    number: raw.collector_number,
    rarity: raw.rarity ? titleCase(raw.rarity) : undefined,
    artist: raw.artist,
    subtitle: raw.type_line ?? raw.card_faces?.[0]?.type_line,
    types: raw.colors,
    set: {
      id: raw.set,
      gameId: "magic",
      name: raw.set_name ?? raw.set.toUpperCase(),
      series: raw.set_type ? titleCase(raw.set_type) : undefined,
      releaseDate: raw.released_at,
    },
    images: {
      small: images.small ?? images.normal ?? CARD_BACK,
      large: images.large ?? images.png ?? images.normal ?? CARD_BACK,
    },
    details: buildDetails(raw),
    variants,
    defaultVariantId: variants[0].id,
    prices: extractPrices(raw),
  };
}

import type { Card, CardDetail, CardSet, CardVariant } from "../../core/types";
import type { CardPriceMap } from "../../core/pricing";
import type { LorcastCard, LorcastSet } from "./types";

/** Lorcana prints every card in both, so both variants always exist. */
const NORMAL = "normal";
const FOIL = "foil";

export function normaliseSet(raw: LorcastSet): CardSet {
  return {
    id: raw.code,
    gameId: "lorcana",
    name: raw.name,
    printedTotal: raw.card_count,
    total: raw.card_count,
    releaseDate: raw.released_at,
  };
}

function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function extractVariants(): CardVariant[] {
  return [
    { id: NORMAL, label: "Normal", finish: "normal" },
    { id: FOIL, label: "Foil", finish: "foil" },
  ];
}

function extractPrices(raw: LorcastCard): CardPriceMap | undefined {
  const normal = toAmount(raw.prices?.usd);
  const foil = toAmount(raw.prices?.usd_foil);
  if (normal === null && foil === null) return undefined;

  const map: CardPriceMap = {};
  if (normal !== null) {
    map[NORMAL] = { amount: normal, currency: "USD", source: "Lorcast", kind: "market" };
  }
  if (foil !== null) {
    map[FOIL] = { amount: foil, currency: "USD", source: "Lorcast", kind: "market" };
  }
  return map;
}

function buildDetails(raw: LorcastCard): CardDetail[] {
  const details: CardDetail[] = [];
  const inks = raw.inks?.length ? raw.inks : raw.ink ? [raw.ink] : [];

  if (inks.length) details.push({ label: "Ink", value: inks.join(", ") });
  if (typeof raw.cost === "number") details.push({ label: "Ink cost", value: String(raw.cost) });
  if (typeof raw.strength === "number" && typeof raw.willpower === "number") {
    details.push({ label: "Strength / Willpower", value: `${raw.strength} / ${raw.willpower}` });
  }
  if (typeof raw.lore === "number") details.push({ label: "Lore", value: String(raw.lore) });
  if (typeof raw.move_cost === "number") {
    details.push({ label: "Move cost", value: String(raw.move_cost) });
  }
  if (raw.classifications?.length) {
    details.push({ label: "Classifications", value: raw.classifications.join(", ") });
  }
  if (raw.keywords?.length) details.push({ label: "Keywords", value: raw.keywords.join(", ") });
  if (raw.text) details.push({ label: "Card text", value: raw.text });
  if (raw.flavor_text) details.push({ label: "Flavour text", value: raw.flavor_text });

  return details;
}

export function normaliseCard(raw: LorcastCard): Card {
  const variants = extractVariants();
  const images = raw.image_uris?.digital ?? {};
  // "Elsa" + "Spirit of Winter" is how Lorcana names a card; both halves matter.
  const fullName = raw.version ? `${raw.name} — ${raw.version}` : raw.name;

  return {
    id: raw.id,
    gameId: "lorcana",
    name: fullName,
    number: raw.collector_number,
    rarity: raw.rarity,
    artist: raw.illustrators?.join(", "),
    subtitle: raw.type?.join(" · '"),
    types: raw.inks ?? (raw.ink ? [raw.ink] : undefined),
    set: {
      id: raw.set?.code ?? "unknown",
      gameId: "lorcana",
      name: raw.set?.name ?? "Unknown set",
      releaseDate: raw.set?.released_at,
    },
    images: {
      small: images.small ?? images.normal ?? "",
      large: images.large ?? images.full ?? images.normal ?? "",
    },
    details: buildDetails(raw),
    variants,
    defaultVariantId: NORMAL,
    prices: extractPrices(raw),
  };
}

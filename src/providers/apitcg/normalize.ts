import type { GameId } from "../../core/games";
import type { Card, CardDetail, CardSet, CardVariant, VariantFinish } from "../../core/types";
import type { CardPriceMap } from "../../core/pricing";
import type { ApiTcgProduct, ApiTcgSet } from "./types";

/** Attribute keys promoted out of the generic bag into first-class fields. */
const RARITY_KEYS = ["Rarity", "rarity"];
const ARTIST_KEYS = ["Artist", "artist", "Illustrator"];
const TYPE_KEYS = ["Type", "CardType", "Card Type"];

function pick(
  attributes: Record<string, string | number | null> | undefined,
  keys: string[],
): string | undefined {
  if (!attributes) return undefined;
  for (const key of keys) {
    const value = attributes[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return undefined;
}

function setDoc(raw: ApiTcgProduct): ApiTcgSet | undefined {
  return typeof raw.set === "object" && raw.set !== null ? raw.set : undefined;
}

export function normaliseSet(raw: ApiTcgSet, gameId: GameId): CardSet {
  return {
    id: raw._id ?? raw.slug ?? raw.name,
    gameId,
    name: raw.name,
    series: raw.code,
    releaseDate: raw.release_date?.slice(0, 10),
    logoUrl: raw.logo,
  };
}

/**
 * Variants, as far as this API supports them.
 *
 * `/api/products` describes a printing rather than a card — an alternate-art
 * Luffy is its own product with its own code — so there is no per-card variant
 * list to read. A single variant derived from rarity keeps the collection's
 * variant-aware shape intact without inventing printings that don't exist.
 */
function extractVariants(raw: ApiTcgProduct): CardVariant[] {
  const rarity = pick(raw.attributes, RARITY_KEYS);
  if (!rarity) return [{ id: "unspecified", label: "Unspecified", finish: "unspecified" }];

  const finish: VariantFinish = /alt|parallel|special|foil|serial/i.test(rarity)
    ? "altArt"
    : "normal";
  return [{ id: rarity, label: rarity, finish }];
}

function extractPrices(raw: ApiTcgProduct, variants: CardVariant[]): CardPriceMap | undefined {
  const prices = raw.markets?.tcgplayer?.prices;
  if (!prices) return undefined;

  const market = typeof prices.market === "number" ? prices.market : null;
  const mid = typeof prices.mid === "number" ? prices.mid : null;
  const amount = market ?? mid;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return undefined;

  // One product, one printing, so the single price applies to its one variant.
  return {
    [variants[0].id]: {
      amount,
      currency: "USD",
      source: "TCGplayer",
      kind: market !== null ? "market" : "mid",
    },
  };
}

/**
 * Everything in `attributes` that hasn't been promoted, as label/value pairs.
 *
 * The shape is per-game and undocumented in detail (Star Wars has Aspects and
 * Arenas, One Piece has Colour and Power), so passing it through generically
 * beats hardcoding either game's vocabulary here.
 */
function buildDetails(raw: ApiTcgProduct): CardDetail[] {
  const skip = new Set([...RARITY_KEYS, ...ARTIST_KEYS]);
  const details: CardDetail[] = [];

  for (const [label, value] of Object.entries(raw.attributes ?? {})) {
    if (skip.has(label)) continue;
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) details.push({ label, value: text });
  }
  if (raw.description) details.push({ label: "Card text", value: raw.description });

  return details;
}

export function normaliseCard(raw: ApiTcgProduct, gameId: GameId): Card {
  const variants = extractVariants(raw);
  const image = raw.images?.[0] ?? {};
  const set = setDoc(raw);
  const setId = set?._id ?? (typeof raw.set === "string" ? raw.set : "unknown");

  return {
    // `_id` is numeric and unique; `code` is not (reprints share it).
    id: String(raw._id),
    gameId,
    name: raw.name,
    number: raw.cardNumber ?? raw.code ?? String(raw._id),
    rarity: pick(raw.attributes, RARITY_KEYS),
    artist: pick(raw.attributes, ARTIST_KEYS),
    subtitle: pick(raw.attributes, TYPE_KEYS),
    set: {
      id: setId,
      gameId,
      name: set?.name ?? "Unknown set",
      series: set?.code,
      releaseDate: (set?.release_date ?? raw.release_date)?.slice(0, 10),
      logoUrl: set?.logo,
    },
    images: {
      small: image.small ?? image.medium ?? image.large ?? "",
      large: image.large ?? image.medium ?? image.small ?? "",
    },
    details: buildDetails(raw),
    variants,
    defaultVariantId: variants[0].id,
    prices: extractPrices(raw, variants),
  };
}

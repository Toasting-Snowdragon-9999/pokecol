import type { Card, CardDetail, CardSet } from "../../core/types";
import type { PokemonApiCard, PokemonApiSet } from "./types";
import { extractVariants } from "./variants";

/** The API returns `1999/01/09`; normalise so plain string compare is chronological. */
function normaliseDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\//g, "-");
}

export function normaliseSet(raw: PokemonApiSet): CardSet {
  return {
    id: raw.id,
    gameId: "pokemon",
    name: raw.name,
    series: raw.series,
    printedTotal: raw.printedTotal,
    total: raw.total,
    releaseDate: normaliseDate(raw.releaseDate),
    symbolUrl: raw.images?.symbol,
    logoUrl: raw.images?.logo,
  };
}

/** "Stage 2 Pokémon", "Basic Pokémon", "Trainer — Item". */
function buildSubtitle(raw: PokemonApiCard): string | undefined {
  const subtypes = raw.subtypes?.join(" ");
  if (subtypes && raw.supertype) return `${subtypes} ${raw.supertype}`;
  return subtypes ?? raw.supertype;
}

/**
 * Game-specific facts get flattened into label/value pairs here, which is what
 * lets the detail view stay completely generic.
 */
function buildDetails(raw: PokemonApiCard): CardDetail[] {
  const details: CardDetail[] = [];

  if (raw.hp) details.push({ label: "HP", value: raw.hp });
  if (raw.types?.length) details.push({ label: "Type", value: raw.types.join(", ") });
  if (raw.evolvesFrom) details.push({ label: "Evolves from", value: raw.evolvesFrom });

  for (const attack of raw.attacks ?? []) {
    const cost = attack.cost?.length ? `${attack.cost.join(" / ")} — ` : "";
    const damage = attack.damage ? ` (${attack.damage})` : "";
    details.push({
      label: `Attack · ${attack.name}${damage}`,
      value: `${cost}${attack.text ?? ""}`.trim() || "—",
    });
  }

  for (const weakness of raw.weaknesses ?? []) {
    details.push({ label: "Weakness", value: `${weakness.type} ${weakness.value}` });
  }
  for (const resistance of raw.resistances ?? []) {
    details.push({ label: "Resistance", value: `${resistance.type} ${resistance.value}` });
  }
  if (raw.retreatCost?.length) {
    details.push({ label: "Retreat cost", value: String(raw.retreatCost.length) });
  }
  if (raw.flavorText) details.push({ label: "Flavour text", value: raw.flavorText });

  return details;
}

export function normaliseCard(raw: PokemonApiCard): Card {
  const variants = extractVariants(raw);

  return {
    variants,
    defaultVariantId: variants[0].id,
    id: raw.id,
    gameId: "pokemon",
    name: raw.name,
    number: raw.number,
    rarity: raw.rarity,
    artist: raw.artist,
    subtitle: buildSubtitle(raw),
    types: raw.types,
    set: normaliseSet(raw.set),
    images: {
      small: raw.images.small,
      large: raw.images.large,
    },
    details: buildDetails(raw),
  };
}

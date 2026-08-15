/**
 * The card games CardCol knows about.
 *
 * Identity and presentation only — no data access. `GameId` is the key that
 * partitions every store, cache entry and placement, because card ids are only
 * unique *within* a game (`"1"` is a real card in three of these).
 */

export type GameId = "pokemon" | "magic" | "yugioh" | "starwars" | "onepiece" | "lorcana";

/**
 * How a game presents itself in the header.
 *
 * Text styling only, deliberately: real TCG logos and their typefaces are
 * trademarked and not ours to bundle. A wordmark set in a system font with the
 * game's colour is recognisable enough to tell you which collection you're in,
 * which is the actual job.
 */
export interface GameTheme {
  /** Shown under the CardCol wordmark. */
  wordmark: string;
  accent: string;
  /** Readable against `accent` when used as a fill. */
  accentText: string;
  fontFamily: string;
  fontWeight: number;
  letterSpacing: string;
  textTransform: "none" | "uppercase";
}

export interface GameMeta {
  id: GameId;
  /** Full name, used in prose and section headings. */
  label: string;
  /** Compact name for tight spots like the game switcher. */
  shortLabel: string;
  theme: GameTheme;
}

const SANS = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif';
const SERIF = 'ui-serif, Georgia, "Times New Roman", serif';
const ROUNDED = 'ui-rounded, "Segoe UI", system-ui, sans-serif';

export const GAMES: Record<GameId, GameMeta> = {
  pokemon: {
    id: "pokemon",
    label: "Pokémon",
    shortLabel: "Pokémon",
    theme: {
      wordmark: "Pokémon",
      accent: "#f0b429",
      accentText: "#231a05",
      fontFamily: ROUNDED,
      fontWeight: 800,
      letterSpacing: "0.02em",
      textTransform: "none",
    },
  },
  magic: {
    id: "magic",
    label: "Magic: The Gathering",
    shortLabel: "Magic",
    theme: {
      wordmark: "Magic: The Gathering",
      accent: "#c8873c",
      accentText: "#1d1206",
      fontFamily: SERIF,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
    },
  },
  yugioh: {
    id: "yugioh",
    label: "Yu-Gi-Oh!",
    shortLabel: "Yu-Gi-Oh!",
    theme: {
      wordmark: "Yu-Gi-Oh!",
      accent: "#a56cc1",
      accentText: "#16091c",
      fontFamily: SANS,
      fontWeight: 800,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    },
  },
  starwars: {
    id: "starwars",
    label: "Star Wars: Unlimited",
    shortLabel: "Star Wars",
    theme: {
      wordmark: "Star Wars: Unlimited",
      accent: "#4ea9d8",
      accentText: "#04141d",
      fontFamily: SANS,
      fontWeight: 700,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
    },
  },
  onepiece: {
    id: "onepiece",
    label: "One Piece Card Game",
    shortLabel: "One Piece",
    theme: {
      wordmark: "One Piece",
      accent: "#d9534f",
      accentText: "#1e0806",
      fontFamily: ROUNDED,
      fontWeight: 800,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
    },
  },
  lorcana: {
    id: "lorcana",
    label: "Disney Lorcana",
    shortLabel: "Lorcana",
    theme: {
      wordmark: "Disney Lorcana",
      accent: "#c9a227",
      accentText: "#1b1504",
      fontFamily: SERIF,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "none",
    },
  },
};

/** Display order in the switcher. */
export const GAME_IDS: GameId[] = ["pokemon", "magic", "yugioh", "starwars", "onepiece", "lorcana"];

export const DEFAULT_GAME: GameId = "pokemon";

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && value in GAMES;
}

/**
 * Identity of one card, across every game.
 *
 * Providers hand out ids that only make sense inside their own catalogue, so
 * everything that stores or caches a card qualifies it with the game.
 */
export function cardKey(gameId: GameId, cardId: string): string {
  return `${gameId}:${cardId}`;
}

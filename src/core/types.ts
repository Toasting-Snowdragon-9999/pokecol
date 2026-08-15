/**
 * The internal card model. Nothing above this layer knows what a "Pokémon" is —
 * the binder, the collection store and the search UI all speak only these types.
 * Adding another TCG means writing one more `CardProvider`, not touching the UI.
 *
 * Kept deliberately small. Anything game-specific that's worth showing to a
 * human goes into `details` as label/value pairs rather than growing this
 * interface a field at a time.
 */

import type { GameId, GameTheme } from "./games";
import type { CardPriceMap } from "./pricing";

export type { GameId } from "./games";

export interface CardSet {
  id: string;
  gameId: GameId;
  name: string;
  series?: string;
  /** Cards printed in the set proper (excludes secret rares). */
  printedTotal?: number;
  total?: number;
  /** ISO `YYYY-MM-DD`, so plain string compare is chronological. */
  releaseDate?: string;
  symbolUrl?: string;
  logoUrl?: string;
}

export interface CardDetail {
  label: string;
  value: string;
}

/**
 * Cross-game bucket for a printing.
 *
 * Advisory only. Games disagree about what a "foil" is and some have treatments
 * no other game has, so this exists for grouping and iconography — never for
 * correctness. Anything user-facing shows `CardVariant.label`, which is the
 * provider's own words.
 */
export type VariantFinish =
  | "normal"
  | "holo"
  | "reverseHolo"
  | "foil"
  | "etched"
  | "firstEdition"
  | "unlimited"
  | "altArt"
  | "parallel"
  | "special"
  | "unspecified";

/**
 * A distinct printing of a card — holo, reverse holo, 1st edition and so on.
 *
 * `id` is provider-defined and opaque above the provider layer: the collection
 * stores it, the UI shows `label`, and neither knows what any particular value
 * means. A second TCG emits its own ids without changing anything here.
 */
export interface CardVariant {
  id: string;
  label: string;
  finish: VariantFinish;
}

export interface Card {
  /** Provider-native id, e.g. `base1-4`. Unique within a game. */
  id: string;
  gameId: GameId;
  name: string;
  /** Printed collector number, e.g. `4` or `TG12`. */
  number: string;
  rarity?: string;
  artist?: string;
  /** Short type line, e.g. "Stage 2 Pokémon". */
  subtitle?: string;
  types?: string[];
  set: CardSet;
  images: {
    /** ~245x342. Used everywhere except the detail view. */
    small: string;
    /** ~745x1040. Detail view only — these are ~845KB each. */
    large: string;
  };
  details?: CardDetail[];
  /** Printings this card exists in, in provider preference order. Never empty. */
  variants: CardVariant[];
  /** Which printing a one-click "add" records. Always present in `variants`. */
  defaultVariantId: string;
  /**
   * Market prices per printing, when the provider publishes them. Absent
   * entirely for games with no pricing data — which is not the same as free.
   */
  prices?: CardPriceMap;
}

export interface CardSearchParams {
  query?: string;
  setId?: string;
  page: number;
  pageSize: number;
  signal?: AbortSignal;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

/**
 * What a provider can actually do.
 *
 * This is what keeps `if (gameId === "pokemon")` out of the components. The
 * binder hides its "Full set" toggle when there are no rosters to measure
 * against, Find Cards hides the set filter when set data is meaningless, and
 * the value panel hides itself when nobody publishes prices — each by reading a
 * flag, not by knowing which game it is looking at.
 */
export interface ProviderCapabilities {
  /** `Card.prices` is populated. */
  pricing: boolean;
  /** `getSetCards` returns a real roster — enables full-set view and completion. */
  setRosters: boolean;
  /** `listSets` is worth offering as a filter. */
  setFilter: boolean;
  /** Cards genuinely have more than one printing. */
  variants: boolean;
}

export interface CardProvider {
  id: GameId;
  label: string;
  theme: GameTheme;
  capabilities: ProviderCapabilities;
  /**
   * Why this game can't be used right now — a missing API key, say.
   *
   * Set means "explain this to the reader and don't call me"; the alternative
   * is a game that spins forever or throws, which looks like a broken app
   * rather than a missing setting.
   */
  unavailableReason?: string;
  searchCards(params: CardSearchParams): Promise<Paged<Card>>;
  listSets(signal?: AbortSignal): Promise<CardSet[]>;
  /** Resolves collection entries back into cards. Batches internally. */
  getCardsByIds(ids: string[], signal?: AbortSignal): Promise<Card[]>;
  /**
   * Every card in a set, in printed order — the roster completion is measured
   * against, and what lets an empty pocket know which card belongs in it.
   */
  getSetCards(setId: string, signal?: AbortSignal): Promise<Card[]>;
}

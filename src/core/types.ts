/**
 * The internal card model. Nothing above this layer knows what a "Pokémon" is —
 * the binder, the collection store and the search UI all speak only these types.
 * Adding another TCG means writing one more `CardProvider`, not touching the UI.
 *
 * Kept deliberately small. Anything game-specific that's worth showing to a
 * human goes into `details` as label/value pairs rather than growing this
 * interface a field at a time.
 */

export type GameId = "pokemon";

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
 * A distinct printing of a card — holo, reverse holo, 1st edition and so on.
 *
 * `id` is provider-defined and opaque above the provider layer: the collection
 * stores it, the UI shows `label`, and neither knows what any particular value
 * means. A second TCG emits its own ids without changing anything here.
 */
export interface CardVariant {
  id: string;
  label: string;
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

export interface CardProvider {
  id: GameId;
  label: string;
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

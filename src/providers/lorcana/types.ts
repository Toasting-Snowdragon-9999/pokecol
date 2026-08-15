/** Raw response shapes from api.lorcast.com/v0. Only what we actually read. */

export interface LorcastSet {
  id: string;
  /** Short code used as the set filter value, e.g. "1", "11". */
  code: string;
  name: string;
  released_at?: string;
  card_count?: number;
}

export interface LorcastImageSet {
  small?: string;
  normal?: string;
  large?: string;
  full?: string;
}

export interface LorcastPrices {
  usd?: number | string | null;
  usd_foil?: number | string | null;
}

export interface LorcastCard {
  id: string;
  name: string;
  version?: string;
  collector_number: string;
  rarity?: string;
  ink?: string;
  inks?: string[];
  cost?: number;
  strength?: number;
  willpower?: number;
  lore?: number;
  move_cost?: number;
  type?: string[];
  classifications?: string[];
  keywords?: string[];
  text?: string;
  flavor_text?: string;
  illustrators?: string[];
  set?: Pick<LorcastSet, "id" | "code" | "name" | "released_at">;
  /** Nested by finish; `digital` is the one that is always present. */
  image_uris?: { digital?: LorcastImageSet };
  prices?: LorcastPrices;
}

/** Raw response shapes from api.scryfall.com. Only what we actually read. */

export interface ScryfallList<T> {
  data: T[];
  has_more?: boolean;
  total_cards?: number;
}

export interface ScryfallSet {
  id: string;
  code: string;
  name: string;
  set_type?: string;
  released_at?: string;
  card_count?: number;
  icon_svg_uri?: string;
}

export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
}

export interface ScryfallPrices {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  eur_foil?: string | null;
  tix?: string | null;
}

/** Double-faced cards carry their art per face rather than on the card. */
export interface ScryfallCardFace {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
  image_uris?: ScryfallImageUris;
}

export interface ScryfallCard {
  id: string;
  name: string;
  collector_number: string;
  rarity?: string;
  artist?: string;
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
  cmc?: number;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  flavor_text?: string;
  set: string;
  set_id?: string;
  set_name?: string;
  set_type?: string;
  released_at?: string;
  /** e.g. ["nonfoil", "foil", "etched"] — a real statement about printings. */
  finishes?: string[];
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  prices?: ScryfallPrices;
}

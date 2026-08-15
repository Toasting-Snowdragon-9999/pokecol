/** Raw response shapes from db.ygoprodeck.com/api/v7. Only what we actually read. */

export interface YgoCardSet {
  set_name: string;
  set_code: string;
  set_rarity?: string;
  set_edition?: string;
  set_price?: string;
}

export interface YgoCardImage {
  id: number;
  image_url: string;
  image_url_small?: string;
  image_url_cropped?: string;
}

/** A single-element array of vendor prices, as decimal strings. */
export interface YgoCardPrice {
  cardmarket_price?: string;
  tcgplayer_price?: string;
  ebay_price?: string;
  amazon_price?: string;
  coolstuffinc_price?: string;
}

export interface YgoMisc {
  /** Earliest known release, used to date the canonical printing. */
  tcg_date?: string;
  views?: number;
}

export interface YgoCard {
  id: number;
  name: string;
  type?: string;
  humanReadableCardType?: string;
  frameType?: string;
  desc?: string;
  race?: string;
  attribute?: string;
  atk?: number;
  def?: number;
  level?: number;
  scale?: number;
  linkval?: number;
  archetype?: string;
  card_sets?: YgoCardSet[];
  card_images?: YgoCardImage[];
  card_prices?: YgoCardPrice[];
  misc_info?: YgoMisc[];
}

export interface YgoResponse {
  data?: YgoCard[];
}

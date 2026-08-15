/**
 * Raw response shapes from apitcg.com. Only what we actually read.
 *
 * One unified `/api/products` endpoint serves every game it covers, which is
 * why a single adapter here backs both Star Wars: Unlimited and One Piece.
 */

export interface ApiTcgImage {
  small?: string;
  medium?: string;
  large?: string;
}

export interface ApiTcgPrices {
  low?: number;
  mid?: number;
  high?: number;
  market?: number;
}

export interface ApiTcgMarkets {
  tcgplayer?: {
    id?: string;
    url?: string;
    prices?: ApiTcgPrices;
  };
}

/** A populated `set` arrives as a document; unpopulated it is just the slug. */
export interface ApiTcgSet {
  _id: string;
  name: string;
  slug?: string;
  code?: string;
  tcg?: string;
  release_date?: string;
  logo?: string;
}

export interface ApiTcgProduct {
  _id: number;
  type?: string;
  name: string;
  description?: string;
  tcg?: string;
  set?: string | ApiTcgSet;
  /** Card code, e.g. "OP03-070". */
  code?: string;
  cardNumber?: string;
  /** Free-form per-game facts: Rarity, Color, Power, Cost, Aspects… */
  attributes?: Record<string, string | number | null>;
  images?: ApiTcgImage[];
  release_date?: string;
  markets?: ApiTcgMarkets;
}

export interface ApiTcgList<T> {
  success?: boolean;
  data?: T[];
  total?: number;
}

/** Raw response shapes from api.pokemontcg.io/v2. Only what we actually read. */

export interface PokemonApiSet {
  id: string;
  name: string;
  series?: string;
  printedTotal?: number;
  total?: number;
  releaseDate?: string;
  ptcgoCode?: string;
  images?: {
    symbol?: string;
    logo?: string;
  };
}

export interface PokemonApiAttack {
  name: string;
  cost?: string[];
  damage?: string;
  text?: string;
}

export interface PokemonApiCard {
  id: string;
  name: string;
  number: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  hp?: string;
  rarity?: string;
  artist?: string;
  flavorText?: string;
  evolvesFrom?: string;
  attacks?: PokemonApiAttack[];
  weaknesses?: { type: string; value: string }[];
  resistances?: { type: string; value: string }[];
  retreatCost?: string[];
  set: PokemonApiSet;
  images: {
    small: string;
    large: string;
  };
}

export interface PokemonApiList<T> {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

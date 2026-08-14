import type { Card, CardProvider, CardSearchParams, CardSet, Paged } from "../../core/types";
import {
  buildQuery,
  getCardsByIds,
  getSetCards,
  listSets,
  MAX_PAGE_SIZE,
  searchCards,
} from "./api";

/**
 * Browsing with no search term still needs a `q` (the API 502s without one), so
 * an empty search falls back to the most recent set. That also gives the landing
 * state something curated to show instead of an empty screen.
 */
async function resolveQuery(params: CardSearchParams, signal?: AbortSignal): Promise<string | null> {
  const q = buildQuery({ query: params.query, setId: params.setId });
  if (q) return q;

  const sets = await listSets(signal);
  const newest = sets[0];
  return newest ? buildQuery({ setId: newest.id }) : null;
}

export const pokemonProvider: CardProvider = {
  id: "pokemon",
  label: "Pokémon",

  async searchCards(params: CardSearchParams): Promise<Paged<Card>> {
    const pageSize = Math.min(params.pageSize, MAX_PAGE_SIZE);
    const q = await resolveQuery(params, params.signal);

    if (!q) {
      return { items: [], page: params.page, pageSize, totalCount: 0, hasMore: false };
    }

    const result = await searchCards(q, params.page, pageSize, params.signal);
    return {
      items: result.cards,
      page: result.page,
      pageSize: result.pageSize,
      totalCount: result.totalCount,
      hasMore: result.page * result.pageSize < result.totalCount,
    };
  },

  listSets(signal?: AbortSignal): Promise<CardSet[]> {
    return listSets(signal);
  },

  getCardsByIds(ids: string[], signal?: AbortSignal): Promise<Card[]> {
    return getCardsByIds(ids, signal);
  },

  getSetCards(setId: string, signal?: AbortSignal): Promise<Card[]> {
    return getSetCards(setId, signal);
  },
};

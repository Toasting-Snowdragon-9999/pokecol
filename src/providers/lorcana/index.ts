/**
 * Disney Lorcana, via Lorcast.
 *
 * Deliberately Scryfall-shaped — same rate-limit advice (50–100ms), same
 * `*.lorcast.io` unthrottled image origin, no key, CORS open. Search is a
 * single unpaged result set per query, so paging is done locally.
 */

import { cacheKey, cached, TTL, writeEntry } from "../../lib/cache";
import { ApiError, fetchJson } from "../../lib/http";
import { GAMES } from "../../core/games";
import type { Card, CardProvider, CardSearchParams, CardSet, Paged } from "../../core/types";
import { createThrottle } from "../shared/throttle";
import { normaliseCard, normaliseSet } from "./normalize";
import type { LorcastCard, LorcastSet } from "./types";

const BASE_URL = "https://api.lorcast.com/v0";
const CACHE_VERSION = "v1";
const throttle = createThrottle(90);

export function cardCacheKey(id: string): string {
  return `card:${CACHE_VERSION}:lorcana:${id}`;
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  return throttle(() => fetchJson<T>(url, { signal }));
}

function buildQuery(options: { query?: string; setId?: string }): string {
  const terms: string[] = [];
  const name = (options.query ?? "").trim();
  if (name) terms.push(name);
  if (options.setId) terms.push(`set:${options.setId}`);
  if (terms.length > 0) return terms.join(" ");

  /*
   * Lorcast has no "everything" query, so browse leans on the one attribute
   * every card has: `cost>=0` returns the whole ~2500-card catalogue. (`ink` is
   * a colour name here, not a number — `ink>=0` matches nothing at all.)
   */
  return "cost>=0";
}

/** Every card matching a query, cached whole — the catalogue is a few thousand. */
async function searchAll(q: string, signal?: AbortSignal): Promise<Card[]> {
  return cached(
    cacheKey("search", { v: CACHE_VERSION, game: "lorcana", q }),
    TTL.search,
    async (loadSignal) => {
      const url = `${BASE_URL}/cards/search?q=${encodeURIComponent(q)}`;
      try {
        const response = await get<{ results?: LorcastCard[] }>(url, loadSignal);
        const cards = (response.results ?? []).map(normaliseCard);
        await Promise.all(cards.map((card) => writeEntry(cardCacheKey(card.id), card)));
        return cards;
      } catch (error) {
        // Empty result sets come back as a 404, as they do on Scryfall.
        if (error instanceof ApiError && error.status === 404) return [] as Card[];
        throw error;
      }
    },
    signal,
  );
}

export const lorcanaProvider: CardProvider = {
  id: "lorcana",
  label: GAMES.lorcana.label,
  theme: GAMES.lorcana.theme,
  capabilities: { pricing: true, setRosters: true, setFilter: true, variants: true },

  async searchCards(params: CardSearchParams): Promise<Paged<Card>> {
    const all = await searchAll(
      buildQuery({ query: params.query, setId: params.setId }),
      params.signal,
    );
    const start = (params.page - 1) * params.pageSize;
    return {
      items: all.slice(start, start + params.pageSize),
      page: params.page,
      pageSize: params.pageSize,
      totalCount: all.length,
      hasMore: start + params.pageSize < all.length,
    };
  },

  async listSets(signal?: AbortSignal): Promise<CardSet[]> {
    return cached(
      cacheKey("sets", { v: CACHE_VERSION, game: "lorcana" }),
      TTL.sets,
      async (loadSignal) => {
        const response = await get<{ results?: LorcastSet[] }>(`${BASE_URL}/sets`, loadSignal);
        return (response.results ?? [])
          .map(normaliseSet)
          .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
      },
      signal,
    );
  },

  async getCardsByIds(ids: string[], signal?: AbortSignal): Promise<Card[]> {
    if (ids.length === 0) return [];
    const unique = [...new Set(ids)];

    const resolved = await Promise.all(
      unique.map((id) =>
        cached(
          cardCacheKey(id),
          TTL.card,
          async (loadSignal) => normaliseCard(await get<LorcastCard>(`${BASE_URL}/cards/${id}`, loadSignal)),
          signal,
        ).catch(() => null),
      ),
    );
    return resolved.filter((card): card is Card => card !== null);
  },

  async getSetCards(setId: string, signal?: AbortSignal): Promise<Card[]> {
    return cached(
      cacheKey("roster", { v: CACHE_VERSION, game: "lorcana", setId }),
      TTL.card,
      async (loadSignal) => {
        const response = await get<{ results?: LorcastCard[] }>(
          `${BASE_URL}/sets/${encodeURIComponent(setId)}/cards`,
          loadSignal,
        );
        return (response.results ?? []).map(normaliseCard);
      },
      signal,
    );
  },
};

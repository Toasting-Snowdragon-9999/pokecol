/**
 * Yu-Gi-Oh!, via YGOPRODeck's v7 API.
 *
 * No key and CORS-open, which is why it wins over the alternatives. Two things
 * make it awkward:
 *
 * 1. **Images.** YGOPRODeck explicitly asks callers to re-host rather than
 *    hotlink, and threatens an IP blacklist for repeat offenders. CardCol loads
 *    art from provider CDNs by design, so this adapter is knowingly outside
 *    their terms and needs an image proxy before anything is deployed publicly.
 *    Recorded in README.md and ARCHITECTURE.md, not just here.
 *
 * 2. **Sets.** A Yu-Gi-Oh card is not "in" one set — a popular card has been
 *    printed a dozen times. The binder needs one home per card, so the earliest
 *    printing is treated as canonical and the rest are listed as details.
 *
 * The rate limit is generous (20/s) but the punishment is a **one-hour ban**, so
 * the throttle here is deliberately conservative.
 */

import { cacheKey, cached, TTL, writeEntry } from "../../lib/cache";
import { ApiError, fetchJson } from "../../lib/http";
import { GAMES } from "../../core/games";
import type { Card, CardProvider, CardSearchParams, CardSet, Paged } from "../../core/types";
import { createThrottle } from "../shared/throttle";
import { normaliseCard, setsFromCards } from "./normalize";
import type { YgoCard, YgoResponse } from "./types";

const BASE_URL = "https://db.ygoprodeck.com/api/v7";
const CACHE_VERSION = "v1";
/** Well under the 20/s ceiling: the penalty for crossing it is an hour offline. */
const throttle = createThrottle(120);

export function cardCacheKey(id: string): string {
  return `card:${CACHE_VERSION}:yugioh:${id}`;
}

function buildUrl(params: Record<string, string | number | undefined>): string {
  const url = new URL(`${BASE_URL}/cardinfo.php`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  return throttle(() => fetchJson<T>(url, { signal }));
}

/**
 * The API 400s on a query that matches nothing, which is a result rather than a
 * failure — the same shape of lie Scryfall tells with its 404.
 */
async function search(url: string, signal?: AbortSignal): Promise<YgoCard[]> {
  try {
    const response = await get<YgoResponse>(url, signal);
    return response.data ?? [];
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 404)) return [];
    throw error;
  }
}

export const yugiohProvider: CardProvider = {
  id: "yugioh",
  label: GAMES.yugioh.label,
  theme: GAMES.yugioh.theme,
  capabilities: {
    pricing: true,
    // Card-to-set is many-to-many here, so there is no roster to complete.
    setRosters: false,
    setFilter: true,
    variants: true,
  },

  async searchCards(params: CardSearchParams): Promise<Paged<Card>> {
    const key = cacheKey("search", {
      v: CACHE_VERSION,
      game: "yugioh",
      q: params.query ?? "",
      set: params.setId ?? "",
      page: params.page,
      size: params.pageSize,
    });

    return cached(
      key,
      TTL.search,
      async (loadSignal) => {
        /*
         * `num`/`offset` need a filter alongside them, and the API rejects an
         * entirely unfiltered query. `fname` is a name substring; with neither
         * a name nor a set we fall back to a broad staple-ish filter so the
         * landing state shows cards rather than an error.
         */
        const url = buildUrl({
          fname: params.query?.trim() || undefined,
          cardset: params.setId || undefined,
          ...(params.query?.trim() || params.setId ? {} : { staple: "yes" }),
          num: params.pageSize,
          offset: (params.page - 1) * params.pageSize,
          misc: "yes",
        });

        const raw = await search(url, loadSignal);
        const cards = raw.map(normaliseCard);
        await Promise.all(cards.map((card) => writeEntry(cardCacheKey(card.id), card)));

        /*
         * No total is returned alongside a paged response, so "there is more"
         * is inferred from a full page. It costs a trailing empty page at the
         * end of a result set, which is cheaper than a second count request.
         */
        const hasMore = cards.length === params.pageSize;
        return {
          items: cards,
          page: params.page,
          pageSize: params.pageSize,
          totalCount: (params.page - 1) * params.pageSize + cards.length + (hasMore ? 1 : 0),
          hasMore,
        };
      },
      params.signal,
    );
  },

  async listSets(signal?: AbortSignal): Promise<CardSet[]> {
    return cached(
      cacheKey("sets", { v: CACHE_VERSION, game: "yugioh" }),
      TTL.sets,
      async (loadSignal) => {
        const raw = await get<{ set_name: string; set_code: string; tcg_date?: string }[]>(
          `${BASE_URL}/cardsets.php`,
          loadSignal,
        );
        return raw
          .map((set) => ({
            id: set.set_name,
            gameId: "yugioh" as const,
            name: set.set_name,
            series: set.set_code,
            releaseDate: set.tcg_date,
          }))
          .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
      },
      signal,
    );
  },

  async getCardsByIds(ids: string[], signal?: AbortSignal): Promise<Card[]> {
    if (ids.length === 0) return [];
    const unique = [...new Set(ids)];

    // The API takes a comma-separated id list, so a whole collection resolves
    // in one request when the cache is cold.
    const resolved = await cached(
      cacheKey("ids", { v: CACHE_VERSION, game: "yugioh", ids: unique.slice().sort().join(",") }),
      TTL.card,
      async (loadSignal) => {
        const raw = await search(buildUrl({ id: unique.join(","), misc: "yes" }), loadSignal);
        const cards = raw.map(normaliseCard);
        await Promise.all(cards.map((card) => writeEntry(cardCacheKey(card.id), card)));
        return cards;
      },
      signal,
    );

    const byId = new Map(resolved.map((card) => [card.id, card]));
    return unique.map((id) => byId.get(id)).filter((card): card is Card => card !== undefined);
  },

  async getSetCards(setId: string, signal?: AbortSignal): Promise<Card[]> {
    return cached(
      cacheKey("roster", { v: CACHE_VERSION, game: "yugioh", setId }),
      TTL.card,
      async (loadSignal) => {
        const raw = await search(buildUrl({ cardset: setId, misc: "yes" }), loadSignal);
        return raw.map(normaliseCard);
      },
      signal,
    );
  },
};

export { setsFromCards };

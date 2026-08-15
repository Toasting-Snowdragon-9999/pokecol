/**
 * Magic: The Gathering, via Scryfall.
 *
 * The most cooperative of the six: no API key, `access-control-allow-origin: *`
 * so it works straight from the browser, a real `finishes` array per card, and
 * prices in the same payload.
 *
 * Two quirks worth knowing. Scryfall answers a search with **404** when nothing
 * matches rather than an empty list, so that has to become an empty page or
 * every fruitless search looks like an outage. And it asks for 50–100ms between
 * requests, enforced here by a shared throttle.
 */

import { cacheKey, cached, TTL, writeEntry } from "../../lib/cache";
import { ApiError, fetchJson } from "../../lib/http";
import { GAMES } from "../../core/games";
import type { Card, CardProvider, CardSearchParams, CardSet, Paged } from "../../core/types";
import { createThrottle } from "../shared/throttle";
import { normaliseCard, normaliseSet } from "./normalize";
import type { ScryfallCard, ScryfallList, ScryfallSet } from "./types";

const BASE_URL = "https://api.scryfall.com";
const CACHE_VERSION = "v1";
/** Scryfall's documented ask: 50–100ms between requests. */
const throttle = createThrottle(90);

/** Scryfall pages at a fixed 175; our own page size is applied client-side. */
const SCRYFALL_PAGE_SIZE = 175;

export function cardCacheKey(id: string): string {
  return `card:${CACHE_VERSION}:magic:${id}`;
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  return throttle(() => fetchJson<T>(url, { signal }));
}

/**
 * Scryfall's own query syntax. `set:` is a first-class filter, and a bare word
 * is a name substring, so the Pokémon-style wildcard wrapping isn't needed.
 */
function buildQuery(options: { query?: string; setId?: string }): string {
  const terms: string[] = [];
  const name = (options.query ?? "").trim();
  // Quote the name so punctuation and spaces can't be read as query operators.
  if (name) terms.push(`name:${JSON.stringify(name)}`);
  if (options.setId) terms.push(`set:${options.setId}`);
  // With no terms at all, browse something rather than erroring: newest first.
  return terms.length > 0 ? terms.join(" ") : "date>=2000-01-01";
}

export const magicProvider: CardProvider = {
  id: "magic",
  label: GAMES.magic.label,
  theme: GAMES.magic.theme,
  capabilities: { pricing: true, setRosters: true, setFilter: true, variants: true },

  async searchCards(params: CardSearchParams): Promise<Paged<Card>> {
    const q = buildQuery({ query: params.query, setId: params.setId });
    /*
     * Scryfall pages at 175 regardless of what we want, so we ask for the page
     * that contains our slice and cut it locally. Caching is keyed on the
     * Scryfall page, so neighbouring app pages usually cost nothing.
     */
    const firstItem = (params.page - 1) * params.pageSize;
    const scryPage = Math.floor(firstItem / SCRYFALL_PAGE_SIZE) + 1;
    const offset = firstItem - (scryPage - 1) * SCRYFALL_PAGE_SIZE;

    const key = cacheKey("search", { v: CACHE_VERSION, game: "magic", q, page: scryPage });
    const result = await cached(
      key,
      TTL.search,
      async (loadSignal) => {
        const url = buildUrl("/cards/search", {
          q,
          page: scryPage,
          order: "released",
          dir: "desc",
          unique: "prints",
        });
        try {
          const response = await get<ScryfallList<ScryfallCard>>(url, loadSignal);
          const cards = response.data.map(normaliseCard);
          await Promise.all(cards.map((card) => writeEntry(cardCacheKey(card.id), card)));
          return { cards, totalCount: response.total_cards ?? cards.length };
        } catch (error) {
          // "No cards found" is a 404 here, which is a result, not a failure.
          if (error instanceof ApiError && error.status === 404) {
            return { cards: [] as Card[], totalCount: 0 };
          }
          throw error;
        }
      },
      params.signal,
    );

    const items = result.cards.slice(offset, offset + params.pageSize);
    return {
      items,
      page: params.page,
      pageSize: params.pageSize,
      totalCount: result.totalCount,
      hasMore: params.page * params.pageSize < result.totalCount,
    };
  },

  async listSets(signal?: AbortSignal): Promise<CardSet[]> {
    return cached(
      cacheKey("sets", { v: CACHE_VERSION, game: "magic" }),
      TTL.sets,
      async (loadSignal) => {
        const response = await get<ScryfallList<ScryfallSet>>(`${BASE_URL}/sets`, loadSignal);
        return response.data
          .filter((set) => (set.card_count ?? 0) > 0)
          .map(normaliseSet)
          .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
      },
      signal,
    );
  },

  async getCardsByIds(ids: string[], signal?: AbortSignal): Promise<Card[]> {
    if (ids.length === 0) return [];
    const unique = [...new Set(ids)];

    /*
     * `/cards/collection` takes 75 identifiers per POST — but this app is a
     * GET-and-cache shape throughout, and the per-card cache means a returning
     * collector normally resolves everything without a single request. Cards
     * genuinely missing are fetched one at a time behind the throttle.
     */
    const resolved = await Promise.all(
      unique.map((id) =>
        cached(
          cardCacheKey(id),
          TTL.card,
          async (loadSignal) => normaliseCard(await get<ScryfallCard>(`${BASE_URL}/cards/${id}`, loadSignal)),
          signal,
        ).catch(() => null),
      ),
    );

    return resolved.filter((card): card is Card => card !== null);
  },

  async getSetCards(setId: string, signal?: AbortSignal): Promise<Card[]> {
    return cached(
      cacheKey("roster", { v: CACHE_VERSION, game: "magic", setId }),
      TTL.card,
      async (loadSignal) => {
        const collected: Card[] = [];
        for (let page = 1; ; page++) {
          const url = buildUrl("/cards/search", {
            q: `set:${setId}`,
            page,
            order: "set",
            unique: "prints",
          });
          try {
            const response = await get<ScryfallList<ScryfallCard>>(url, loadSignal);
            collected.push(...response.data.map(normaliseCard));
            if (!response.has_more) break;
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) break;
            throw error;
          }
        }
        await Promise.all(collected.map((card) => writeEntry(cardCacheKey(card.id), card)));
        return collected;
      },
      signal,
    );
  },
};

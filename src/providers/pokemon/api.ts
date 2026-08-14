import { cacheKey, cached, readEntries, TTL, writeEntry } from "../../lib/cache";
import { fetchJson } from "../../lib/http";
import type { Card, CardSet } from "../../core/types";
import { normaliseCard, normaliseSet } from "./normalize";
import type { PokemonApiCard, PokemonApiList, PokemonApiSet } from "./types";

const BASE_URL = "https://api.pokemontcg.io/v2";

/**
 * Limits below were measured against the live API, not read off the docs.
 * The API 500s/502s rather than reporting a helpful error when you exceed them.
 */
/** `pageSize=60` responds; `pageSize=100` returns 502. */
export const MAX_PAGE_SIZE = 60;
/** `q=id:a OR id:b …` handles 10 ids; 15 or more returns 500. */
const ID_BATCH_SIZE = 10;
/** Anonymous access allows 30 requests/minute, so batches stay gentle. */
const ID_BATCH_CONCURRENCY = 2;

/**
 * Bump when the normalised `Card` shape changes.
 *
 * Cached cards are stored already-normalised, so an older entry would
 * deserialise missing whatever field was added — for 30 days, silently. Cached
 * card data is *derived*, so invalidating it just costs a refetch. (Never do
 * this to the collection in localStorage, which is user state and must be
 * migrated instead.)
 *
 * v2: cards gained `variants` / `defaultVariantId`.
 */
const CACHE_VERSION = "v2";

const apiKey = import.meta.env.VITE_POKEMONTCG_API_KEY as string | undefined;

function headers(): Record<string, string> {
  return apiKey ? { "X-Api-Key": apiKey } : {};
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * `:` and `"` would break out of the field syntax. Apostrophes, hyphens and
 * periods are safe unquoted, which matters for Farfetch'd, Ho-Oh and Mr. Mime.
 */
function sanitiseTerm(term: string): string {
  return term.replace(/["*?:\\()[\]{}^~!]/g, "").trim();
}

/**
 * `name:char` matches nothing — the API matches whole words — so every token is
 * wrapped in wildcards. Multiple `name:` terms AND together, which makes
 * "blaine char" find Blaine's Charizard.
 */
export function buildQuery(options: { query?: string; setId?: string }): string {
  const terms: string[] = [];

  for (const token of (options.query ?? "").split(/\s+/)) {
    const clean = sanitiseTerm(token);
    if (clean) terms.push(`name:*${clean}*`);
  }
  if (options.setId) terms.push(`set.id:${sanitiseTerm(options.setId)}`);

  return terms.join(" ");
}

export interface RawSearchResult {
  cards: Card[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Every request must carry a `q` — an unfiltered query 502s regardless of page
 * size — so callers are responsible for supplying a non-empty one.
 */
export async function searchCards(
  q: string,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<RawSearchResult> {
  const size = Math.min(pageSize, MAX_PAGE_SIZE);
  // Search results hold normalised cards too, so they share the shape version.
  const key = cacheKey("search", { v: CACHE_VERSION, q, page, size });

  return cached(key, TTL.search, async () => {
    const url = buildUrl("/cards", {
      q,
      page,
      pageSize: size,
      orderBy: "-set.releaseDate,number",
    });
    const response = await fetchJson<PokemonApiList<PokemonApiCard>>(url, {
      signal,
      headers: headers(),
    });

    const cards = response.data.map(normaliseCard);
    // Warm the per-card cache so opening any of these in the binder later is free.
    await Promise.all(cards.map((card) => writeEntry(cardCacheKey(card.id), card)));

    return {
      cards,
      totalCount: response.totalCount,
      page: response.page,
      pageSize: response.pageSize,
    };
  });
}

export async function listSets(signal?: AbortSignal): Promise<CardSet[]> {
  return cached(cacheKey("sets", { game: "pokemon" }), TTL.sets, async () => {
    // All 174 sets arrive in a single request, so the set filter costs one call.
    const url = buildUrl("/sets", { pageSize: 500, orderBy: "-releaseDate" });
    const response = await fetchJson<PokemonApiList<PokemonApiSet>>(url, {
      signal,
      headers: headers(),
    });
    return response.data.map(normaliseSet);
  });
}

/**
 * Every card in a set, in printed order.
 *
 * Completion needs the real roster: sets are not `1..N`. Secret rares carry
 * numbers above `printedTotal` (Sword & Shield prints 202 but numbers run to
 * 216), and some sets use forms like `TG01`, so a synthesised range would be
 * wrong in both directions.
 *
 * Costs `ceil(total / 60)` requests the first time and is then cached for 30
 * days like any card data — worth it, and only ever paid for sets the
 * collection actually touches.
 */
export async function getSetCards(setId: string, signal?: AbortSignal): Promise<Card[]> {
  const key = cacheKey("roster", { v: CACHE_VERSION, setId });

  return cached(key, TTL.card, async () => {
    const q = `set.id:${sanitiseTerm(setId)}`;
    const collected: Card[] = [];

    for (let page = 1; ; page++) {
      const url = buildUrl("/cards", {
        q,
        page,
        pageSize: MAX_PAGE_SIZE,
        orderBy: "number",
      });
      const response = await fetchJson<PokemonApiList<PokemonApiCard>>(url, {
        signal,
        headers: headers(),
      });

      const cards = response.data.map(normaliseCard);
      collected.push(...cards);
      // Warm the per-card cache; these are the same objects the binder needs.
      await Promise.all(cards.map((card) => writeEntry(cardCacheKey(card.id), card)));

      if (collected.length >= response.totalCount || response.data.length === 0) break;
    }

    return collected;
  });
}

export function cardCacheKey(id: string): string {
  return `card:${CACHE_VERSION}:pokemon:${id}`;
}

/** Run `tasks` with limited concurrency to stay under the per-minute ceiling. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Resolve card ids to full cards, cache first. A returning visitor with a big
 * collection normally spends zero requests here; only genuinely new ids are fetched.
 */
export async function getCardsByIds(ids: string[], signal?: AbortSignal): Promise<Card[]> {
  if (ids.length === 0) return [];

  const unique = [...new Set(ids)];
  const cachedCards = await readEntries<Card>(unique.map(cardCacheKey));

  const resolved = new Map<string, Card>();
  const missing: string[] = [];
  for (const id of unique) {
    const hit = cachedCards.get(cardCacheKey(id));
    if (hit) resolved.set(id, hit);
    else missing.push(id);
  }

  if (missing.length > 0) {
    const batches = chunk(missing, ID_BATCH_SIZE);
    const fetched = await mapLimit(batches, ID_BATCH_CONCURRENCY, async (batch) => {
      const url = buildUrl("/cards", {
        q: batch.map((id) => `id:${sanitiseTerm(id)}`).join(" OR "),
        pageSize: ID_BATCH_SIZE,
      });
      const response = await fetchJson<PokemonApiList<PokemonApiCard>>(url, {
        signal,
        headers: headers(),
      });
      return response.data.map(normaliseCard);
    });

    for (const card of fetched.flat()) {
      resolved.set(card.id, card);
      await writeEntry(cardCacheKey(card.id), card);
    }
  }

  // Preserve the caller's order; silently drop ids the API no longer knows about.
  return unique.map((id) => resolved.get(id)).filter((card): card is Card => card !== undefined);
}

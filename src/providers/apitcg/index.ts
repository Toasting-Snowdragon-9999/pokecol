/**
 * Star Wars: Unlimited and the One Piece Card Game, via apitcg.com.
 *
 * One factory serving two games: apitcg exposes a single `/api/products`
 * endpoint filtered by a `tcg` slug, so the adapter differs only by that slug.
 *
 * **This is the one source here that needs a key.** It is free
 * (apitcg.com/register) but it does mean these two games are inert until
 * `VITE_APITCG_API_KEY` is set — hence `unavailableReason`, so the UI can
 * explain a missing setting instead of spinning or throwing.
 *
 * Star Wars specifically: swu-db.com has richer data (per-variant types, market
 * prices) but sends no `access-control-allow-origin` header, so a browser
 * cannot call it. Using it would mean running a proxy, which would cost CardCol
 * its "no backend" property.
 */

import { cacheKey, cached, TTL, writeEntry } from "../../lib/cache";
import { fetchJson } from "../../lib/http";
import { GAMES } from "../../core/games";
import type { GameId } from "../../core/games";
import type { Card, CardProvider, CardSearchParams, CardSet, Paged } from "../../core/types";
import { createThrottle } from "../shared/throttle";
import { normaliseCard, normaliseSet } from "./normalize";
import type { ApiTcgList, ApiTcgProduct, ApiTcgSet } from "./types";

const BASE_URL = "https://www.apitcg.com/api";
const CACHE_VERSION = "v1";
/** Shared across both games — it's one service and one quota. */
const throttle = createThrottle(120);

const apiKey = import.meta.env.VITE_APITCG_API_KEY as string | undefined;

function headers(): Record<string, string> {
  return apiKey ? { "x-api-key": apiKey } : {};
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  return throttle(() => fetchJson<T>(url, { signal, headers: headers() }));
}

interface ApiTcgGame {
  gameId: GameId;
  /** apitcg's own slug for the game. */
  slug: string;
}

function createApiTcgProvider({ gameId, slug }: ApiTcgGame): CardProvider {
  const meta = GAMES[gameId];

  function cardCacheKey(id: string): string {
    return `card:${CACHE_VERSION}:${gameId}:${id}`;
  }

  return {
    id: gameId,
    label: meta.label,
    theme: meta.theme,
    capabilities: {
      pricing: true,
      /*
       * Products are printings, and the API gives no printed-set size, so
       * there is no roster to measure completion against — the binder hides
       * its full-set view rather than showing a half-true one.
       */
      setRosters: false,
      setFilter: true,
      variants: false,
    },
    unavailableReason: apiKey
      ? undefined
      : `${meta.label} needs a free apitcg.com API key. Create one at apitcg.com/register, then add VITE_APITCG_API_KEY to .env.local and restart the dev server.`,

    async searchCards(params: CardSearchParams): Promise<Paged<Card>> {
      if (!apiKey) {
        return { items: [], page: params.page, pageSize: params.pageSize, totalCount: 0, hasMore: false };
      }

      const key = cacheKey("search", {
        v: CACHE_VERSION,
        game: gameId,
        q: params.query ?? "",
        set: params.setId ?? "",
        page: params.page,
        size: params.pageSize,
      });

      return cached(
        key,
        TTL.search,
        async (loadSignal) => {
          const url = buildUrl("/products", {
            tcg: slug,
            type: "card",
            name: params.query?.trim() || undefined,
            set: params.setId || undefined,
            page: params.page,
            limit: params.pageSize,
            // Set names and release dates live on the set document.
            populate: "set",
          });

          const response = await get<ApiTcgList<ApiTcgProduct>>(url, loadSignal);
          const cards = (response.data ?? []).map((raw) => normaliseCard(raw, gameId));
          await Promise.all(cards.map((card) => writeEntry(cardCacheKey(card.id), card)));

          const totalCount = response.total ?? cards.length;
          return {
            items: cards,
            page: params.page,
            pageSize: params.pageSize,
            totalCount,
            hasMore: params.page * params.pageSize < totalCount,
          };
        },
        params.signal,
      );
    },

    async listSets(signal?: AbortSignal): Promise<CardSet[]> {
      if (!apiKey) return [];

      return cached(
        cacheKey("sets", { v: CACHE_VERSION, game: gameId }),
        TTL.sets,
        async (loadSignal) => {
          const response = await get<ApiTcgList<ApiTcgSet>>(
            buildUrl(`/${slug}/sets`, { limit: 500 }),
            loadSignal,
          );
          return (response.data ?? [])
            .map((raw) => normaliseSet(raw, gameId))
            .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
        },
        signal,
      );
    },

    async getCardsByIds(ids: string[], signal?: AbortSignal): Promise<Card[]> {
      if (!apiKey || ids.length === 0) return [];
      const unique = [...new Set(ids)];

      const resolved = await Promise.all(
        unique.map((id) =>
          cached(
            cardCacheKey(id),
            TTL.card,
            async (loadSignal) => {
              const response = await get<{ data?: ApiTcgProduct } | ApiTcgProduct>(
                buildUrl(`/products/${id}`, { populate: "set" }),
                loadSignal,
              );
              // The single-product endpoint has been seen both wrapped and bare.
              const raw = (response as { data?: ApiTcgProduct }).data ?? (response as ApiTcgProduct);
              return normaliseCard(raw, gameId);
            },
            signal,
          ).catch(() => null),
        ),
      );
      return resolved.filter((card): card is Card => card !== null);
    },

    async getSetCards(setId: string, signal?: AbortSignal): Promise<Card[]> {
      if (!apiKey) return [];

      return cached(
        cacheKey("roster", { v: CACHE_VERSION, game: gameId, setId }),
        TTL.card,
        async (loadSignal) => {
          const response = await get<ApiTcgList<ApiTcgProduct>>(
            buildUrl("/products", { tcg: slug, type: "card", set: setId, limit: 500, populate: "set" }),
            loadSignal,
          );
          return (response.data ?? []).map((raw) => normaliseCard(raw, gameId));
        },
        signal,
      );
    },
  };
}

export const starWarsProvider = createApiTcgProvider({ gameId: "starwars", slug: "star-wars" });
export const onePieceProvider = createApiTcgProvider({ gameId: "onepiece", slug: "one-piece" });

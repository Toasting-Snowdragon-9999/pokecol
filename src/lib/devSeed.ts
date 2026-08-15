/**
 * Dev-only helper for filling the binder quickly.
 *
 * Hand-adding thirty cards to test multi-page flipping is tedious, so in dev
 * builds `window.__pokecol.seed("base1", 30)` drops a slice of a set straight
 * into the collection. Tree-shaken out of production by the `import.meta.env.DEV`
 * guard at the call site.
 */

import { getProvider } from "../core/registry";
import { DEFAULT_GAME } from "../core/games";
import type { GameId } from "../core/games";
import { collectionStore } from "../collection/store";

interface DevApi {
  seed: (setId?: string, count?: number, gameId?: GameId) => Promise<string>;
  clear: (gameId?: GameId) => Promise<string>;
}

export function installDevHelpers(): void {
  // The app's own store, so seeding updates the open binder immediately.
  const store = collectionStore;

  const api: DevApi = {
    async seed(setId = "base1", count = 30, gameId = DEFAULT_GAME) {
      const provider = getProvider(gameId);
      const collected: { id: string; variantId: string }[] = [];
      let page = 1;

      while (collected.length < count) {
        const result = await provider.searchCards({ setId, page, pageSize: 60 });
        if (result.items.length === 0) break;
        for (const card of result.items) {
          if (collected.length >= count) break;
          collected.push({ id: card.id, variantId: card.defaultVariantId });
        }
        if (!result.hasMore) break;
        page += 1;
      }

      for (const { id, variantId } of collected) {
        await store.setQuantity(gameId, id, variantId, 1);
      }
      return `Seeded ${collected.length} ${gameId} cards from ${setId}.`;
    },

    async clear(gameId = DEFAULT_GAME) {
      await store.clear(gameId);
      return `${gameId} collection cleared.`;
    },
  };

  (window as unknown as { __pokecol: DevApi }).__pokecol = api;
  // eslint-disable-next-line no-console
  console.info('[pokecol] dev helpers ready — try __pokecol.seed("base1", 30)');
}

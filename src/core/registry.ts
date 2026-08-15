import type { CardProvider } from "./types";
import type { GameId } from "./games";
import { DEFAULT_GAME } from "./games";
import { pokemonProvider } from "../providers/pokemon";
import { magicProvider } from "../providers/magic";
import { yugiohProvider } from "../providers/yugioh";
import { lorcanaProvider } from "../providers/lorcana";
import { starWarsProvider, onePieceProvider } from "../providers/apitcg";

/**
 * The whole provider abstraction. One map, one lookup. Adding a TCG means
 * writing an adapter and adding a line here — nothing downstream changes.
 */
const providers: Record<GameId, CardProvider> = {
  pokemon: pokemonProvider,
  magic: magicProvider,
  yugioh: yugiohProvider,
  starwars: starWarsProvider,
  onepiece: onePieceProvider,
  lorcana: lorcanaProvider,
};

export { DEFAULT_GAME };

export function getProvider(gameId: GameId = DEFAULT_GAME): CardProvider {
  return providers[gameId];
}

export function listProviders(): CardProvider[] {
  return Object.values(providers);
}

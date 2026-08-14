import type { CardProvider, GameId } from "./types";
import { pokemonProvider } from "../providers/pokemon";

/**
 * The whole provider abstraction. One map, one lookup. When a second TCG shows
 * up it gets added here and everything downstream keeps working.
 */
const providers: Record<GameId, CardProvider> = {
  pokemon: pokemonProvider,
};

export const DEFAULT_GAME: GameId = "pokemon";

export function getProvider(gameId: GameId = DEFAULT_GAME): CardProvider {
  return providers[gameId];
}

export function listProviders(): CardProvider[] {
  return Object.values(providers);
}

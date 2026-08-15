import { createContext, useContext } from "react";
import type { GameId, GameMeta } from "../core/games";
import type { CardProvider } from "../core/types";

export interface GameContextValue {
  gameId: GameId;
  meta: GameMeta;
  provider: CardProvider;
  setGame: (gameId: GameId) => void;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function useActiveGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error("useActiveGame must be used inside <GameProvider>");
  return value;
}

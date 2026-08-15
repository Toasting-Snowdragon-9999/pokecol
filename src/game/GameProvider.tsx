import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_GAME, GAMES, isGameId } from "../core/games";
import type { GameId } from "../core/games";
import { getProvider } from "../core/registry";
import { layoutStore } from "../features/binder/layoutStore";
import { GameContext } from "./context";
import type { GameContextValue } from "./context";

const STORAGE_KEY = "cardcol.activeGame";

function readStoredGame(): GameId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isGameId(raw) ? raw : DEFAULT_GAME;
  } catch {
    return DEFAULT_GAME;
  }
}

/**
 * The active card universe.
 *
 * Everything user-owned is already partitioned by `gameId` in storage, so
 * switching games doesn't filter anything — it changes which partition the
 * stores are asked about. What this does have to do is drop *volatile* state
 * that would otherwise read as belonging to the new game: a pending undo from
 * the Pokémon binder must not be applicable to the Magic one.
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const [gameId, setGameId] = useState<GameId>(readStoredGame);

  const setGame = useCallback((next: GameId) => {
    setGameId((current) => {
      if (current === next) return current;
      layoutStore.clearUndo();
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* private mode — the session still switches correctly */
      }
      return next;
    });
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({ gameId, meta: GAMES[gameId], provider: getProvider(gameId), setGame }),
    [gameId, setGame],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

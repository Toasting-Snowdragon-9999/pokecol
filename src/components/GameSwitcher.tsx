import { useEffect, useRef, useState } from "react";
import { GAME_IDS, GAMES } from "../core/games";
import type { GameId } from "../core/games";
import { getProvider } from "../core/registry";
import { useActiveGame } from "../game/context";
import styles from "./GameSwitcher.module.css";

/**
 * CardCol's identity, and the control that changes which card universe you're in.
 *
 * The active game is shown *under* the CardCol wordmark and styled with that
 * game's own colour and lettering, so which collection you're looking at is
 * readable at a glance rather than something you have to remember. Styling is
 * text only — see `GameTheme` on why no real logos are bundled.
 */
export function GameSwitcher() {
  const { gameId, meta, setGame } = useActiveGame();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (next: GameId) => {
    setGame(next);
    setOpen(false);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`CardCol — ${meta.label}. Change card game.`}
      >
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.names}>
          <span className={styles.brand}>CardCol</span>
          <span className={styles.game} style={themeStyle(gameId)}>
            {meta.theme.wordmark}
          </span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className={styles.menu} role="menu" aria-label="Card game">
          {GAME_IDS.map((id) => {
            const provider = getProvider(id);
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={id === gameId}
                className={`${styles.option} ${id === gameId ? styles.optionActive : ""}`}
                onClick={() => choose(id)}
              >
                <span className={styles.swatch} style={{ background: GAMES[id].theme.accent }} />
                <span className={styles.optionText}>
                  <span className={styles.optionName} style={themeStyle(id)}>
                    {GAMES[id].theme.wordmark}
                  </span>
                  {/* Say so up front rather than letting them pick and find an empty page. */}
                  {provider.unavailableReason && (
                    <span className={styles.optionNote}>Needs an API key</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function themeStyle(id: GameId): React.CSSProperties {
  const theme = GAMES[id].theme;
  return {
    color: theme.accent,
    fontFamily: theme.fontFamily,
    fontWeight: theme.fontWeight,
    letterSpacing: theme.letterSpacing,
    textTransform: theme.textTransform,
  };
}

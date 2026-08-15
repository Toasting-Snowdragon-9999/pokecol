import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppHeader } from "./components/AppHeader";
import { CollectionProvider } from "./collection/CollectionProvider";
import { GameProvider } from "./game/GameProvider";
import { useActiveGame } from "./game/context";
import { WishlistProvider } from "./wishlist/WishlistProvider";
import { FindCardsPage } from "./features/find/FindCardsPage";
import { BinderPage } from "./features/binder/BinderPage";
import { WishlistPage } from "./features/wishlist/WishlistPage";
import styles from "./App.module.css";

/**
 * `data-game` puts the active game's accent on the shell as a custom property,
 * which is how per-TCG colour reaches components without any of them knowing
 * which game is on.
 */
function Shell() {
  const { gameId, meta } = useActiveGame();

  return (
    <div
      className={styles.shell}
      data-game={gameId}
      style={
        {
          "--game-accent": meta.theme.accent,
          "--game-accent-text": meta.theme.accentText,
        } as React.CSSProperties
      }
    >
      <AppHeader />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<Navigate to="/collection" replace />} />
          <Route path="/find" element={<FindCardsPage />} />
          <Route path="/collection" element={<BinderPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="*" element={<Navigate to="/collection" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    // Game first: the collection and wishlist stores both read from it.
    <GameProvider>
      <CollectionProvider>
        <WishlistProvider>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </WishlistProvider>
      </CollectionProvider>
    </GameProvider>
  );
}

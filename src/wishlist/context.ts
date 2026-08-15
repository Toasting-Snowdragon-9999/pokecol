import { createContext, useContext } from "react";
import type { GameId } from "../core/games";
import type { WishlistEntry } from "./store";

export interface WishlistContextValue {
  entries: WishlistEntry[];
  loading: boolean;
  /** Any printing of this card wanted? Drives the "on wishlist" marker. */
  isWanted: (cardId: string, gameId?: GameId) => boolean;
  wantsVariant: (cardId: string, variantId: string, gameId?: GameId) => boolean;
  add: (cardId: string, variantId: string, gameId?: GameId) => Promise<void>;
  remove: (cardId: string, variantId: string, gameId?: GameId) => Promise<void>;
  setVariant: (cardId: string, from: string, to: string, gameId?: GameId) => Promise<void>;
  clear: () => Promise<void>;
  count: number;
}

export const WishlistContext = createContext<WishlistContextValue | null>(null);

export function useWishlist(): WishlistContextValue {
  const value = useContext(WishlistContext);
  if (!value) throw new Error("useWishlist must be used inside <WishlistProvider>");
  return value;
}

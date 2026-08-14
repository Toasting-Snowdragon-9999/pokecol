import { createContext, useContext } from "react";
import type { GameId } from "../core/types";
import type { CollectionEntry } from "./store";

export interface CollectionContextValue {
  entries: CollectionEntry[];
  loading: boolean;
  /**
   * Total copies of a card across every printing — i.e. how many physical
   * cards are in that sleeve. This is what the binder badge and the search
   * ownership indicator mean, which is why adding variants didn't change
   * either of them.
   */
  quantityOf: (cardId: string, gameId?: GameId) => number;
  /** Copies of one specific printing. */
  quantityOfVariant: (cardId: string, variantId: string, gameId?: GameId) => number;
  /** Distinct printings owned of a card — 0, 1 or more. */
  variantsOwned: (cardId: string, gameId?: GameId) => string[];
  isOwned: (cardId: string, gameId?: GameId) => boolean;
  add: (cardId: string, variantId: string, gameId?: GameId) => Promise<void>;
  remove: (cardId: string, variantId: string, gameId?: GameId) => Promise<void>;
  setQuantity: (
    cardId: string,
    variantId: string,
    quantity: number,
    gameId?: GameId,
  ) => Promise<void>;
  clear: () => Promise<void>;
  /** Distinct cards owned (a card counts once however many printings). */
  uniqueCards: number;
  /** Total including duplicates and printings. */
  totalCards: number;
}

/* Kept apart from the provider component so the module exports only non-component
   values — otherwise React Fast Refresh can't hot-update the provider. */
export const CollectionContext = createContext<CollectionContextValue | null>(null);

export function useCollection(): CollectionContextValue {
  const context = useContext(CollectionContext);
  if (!context) throw new Error("useCollection must be used inside a CollectionProvider");
  return context;
}

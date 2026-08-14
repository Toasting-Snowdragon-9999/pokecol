import { createContext, useContext } from "react";
import type { GameId } from "../core/types";
import type { CollectionEntry } from "./store";

export interface CollectionContextValue {
  entries: CollectionEntry[];
  loading: boolean;
  quantityOf: (cardId: string, gameId?: GameId) => number;
  isOwned: (cardId: string, gameId?: GameId) => boolean;
  add: (cardId: string, gameId?: GameId) => Promise<void>;
  remove: (cardId: string, gameId?: GameId) => Promise<void>;
  setQuantity: (cardId: string, quantity: number, gameId?: GameId) => Promise<void>;
  clear: () => Promise<void>;
  /** Distinct cards owned. */
  uniqueCards: number;
  /** Total including duplicates. */
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

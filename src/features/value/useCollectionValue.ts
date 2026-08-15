import { useMemo } from "react";
import { useCollection } from "../../collection/context";
import { cardKey } from "../../core/games";
import type { Card } from "../../core/types";
import { priceFor } from "../../core/pricing";
import type { ValueTotal } from "../../core/pricing";

/**
 * What the collection is worth, at current market prices.
 *
 * Costs nothing extra: prices arrive on the same payload as the card, and the
 * binder has already resolved every owned card. This is a fold over data
 * that's in memory, not a fetch.
 *
 * Each *printing* is priced separately where the provider supports it, so three
 * copies of a card owned as two normals and a reverse holo are valued as two
 * normals and a reverse holo.
 */
export function useCollectionValue(cards: Card[]): ValueTotal {
  const { entries } = useCollection();

  return useMemo(() => {
    const byId = new Map(cards.map((card) => [cardKey(card.gameId, card.id), card]));

    let amount = 0;
    const priced = new Set<string>();
    const unpriced = new Set<string>();

    for (const entry of entries) {
      const key = cardKey(entry.gameId, entry.cardId);
      const card = byId.get(key);
      // Still resolving, or the provider dropped it — not the same as worthless.
      if (!card) {
        unpriced.add(key);
        continue;
      }

      const price = priceFor(card.prices, entry.variantId, card.defaultVariantId);
      if (!price) {
        unpriced.add(key);
        continue;
      }

      amount += price.amount * entry.quantity;
      priced.add(key);
    }

    // A card owned in two printings, one priced and one not, still counts once
    // as priced — the total does include it.
    for (const key of priced) unpriced.delete(key);

    return {
      amount,
      currency: "USD",
      pricedCards: priced.size,
      unpricedCards: unpriced.size,
    };
  }, [cards, entries]);
}

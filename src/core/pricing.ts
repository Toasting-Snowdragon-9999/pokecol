/**
 * Card prices, normalised across providers.
 *
 * Every provider CardCol uses returns prices inline with the card, so pricing
 * costs no extra requests — the normaliser just keeps what it was already
 * given. That is the whole reason this is a data shape rather than a service.
 *
 * The one rule everything here exists to enforce: a missing price is *unknown*,
 * never zero. Collection value is an estimate, and an estimate that quietly
 * counts unpriced cards as free is worse than no estimate at all.
 */

export type Currency = "USD" | "EUR";

export interface CardPrice {
  amount: number;
  currency: Currency;
  /** Who priced it, shown so the number is attributable. e.g. "TCGplayer". */
  source: string;
  /** `market` is what we prefer; the others are fallbacks a provider may offer. */
  kind: "market" | "mid" | "low";
  /** ISO date, when the provider says how fresh the figure is. */
  updatedAt?: string;
}

/**
 * Keyed by `variantId`, using the *same* ids as `Card.variants` — that's what
 * makes "price the printing you actually own" work without provider-specific
 * logic in the UI. An absent key means no price is known for that printing.
 */
export type CardPriceMap = Record<string, CardPrice | undefined>;

/** The price for a printing, falling back to the card's default printing. */
export function priceFor(
  prices: CardPriceMap | undefined,
  variantId: string,
  fallbackVariantId?: string,
): CardPrice | undefined {
  if (!prices) return undefined;
  return prices[variantId] ?? (fallbackVariantId ? prices[fallbackVariantId] : undefined);
}

const FORMATTERS = new Map<Currency, Intl.NumberFormat>();

function formatter(currency: Currency): Intl.NumberFormat {
  let existing = FORMATTERS.get(currency);
  if (!existing) {
    existing = new Intl.NumberFormat(undefined, { style: "currency", currency });
    FORMATTERS.set(currency, existing);
  }
  return existing;
}

export function formatMoney(amount: number, currency: Currency = "USD"): string {
  return formatter(currency).format(amount);
}

/** Running total that keeps unpriced cards visible instead of swallowing them. */
export interface ValueTotal {
  amount: number;
  currency: Currency;
  /** Distinct cards that contributed a price. */
  pricedCards: number;
  /** Distinct cards with no usable price — surfaced, never silently dropped. */
  unpricedCards: number;
}

export const EMPTY_TOTAL: ValueTotal = {
  amount: 0,
  currency: "USD",
  pricedCards: 0,
  unpricedCards: 0,
};

/**
 * The USD price snapshot used for cross-currency filtering only.
 *
 * See docs/context/data-model.md § Money: "under 100" means nothing across a
 * list mixing COP and USD, so every item gets a normalized USD value computed
 * at write time from a configured rate. It's an approximation and is **never
 * displayed** — the UI always shows the original amount and currency.
 *
 * Pure and framework-agnostic on purpose: no `server-only`, no DB, so it's
 * trivial to test and safe to reuse from the OG pipeline (T030-T034) once
 * scraped prices need the same treatment.
 */

export type SupportedCurrency = "COP" | "USD";

export type UsdSnapshot = {
  priceUsdSnapshot: string;
  fxRateUsed: string;
};

/**
 * `copPerUsd` reads as "how many COP equal 1 USD" — matching the
 * `FX_COP_PER_USD` config name. A COP amount divides by it; a USD amount
 * needs no conversion, so its rate is recorded as exactly `1` rather than
 * left null — every snapshot documents the rate that produced it uniformly.
 */
export function computeUsdSnapshot(
  amount: string,
  currency: SupportedCurrency,
  copPerUsd: number,
): UsdSnapshot {
  const numericAmount = Number(amount);

  if (currency === "USD") {
    return { priceUsdSnapshot: numericAmount.toFixed(2), fxRateUsed: "1" };
  }

  const usd = numericAmount / copPerUsd;
  return { priceUsdSnapshot: usd.toFixed(2), fxRateUsed: String(copPerUsd) };
}

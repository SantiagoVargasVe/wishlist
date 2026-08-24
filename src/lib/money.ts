// `minimumFractionDigits`/`maximumFractionDigits` are pinned to 2 rather than
// left to Intl's currency default: that default comes from bundled CLDR data
// that varies by Node/ICU version (confirmed — CI's Node 22 rounded COP to
// whole units and silently dropped stored cents; a local Node 22 didn't).
// The column is numeric(14,2), so 2 is also just correct — display exactly
// what's stored (ADR-0009), not whatever a given runtime's locale data guesses.
const FORMATTERS: Record<string, Intl.NumberFormat> = {
  COP: new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

/**
 * `amount` is a `numeric(14,2)` column read back as a string (Drizzle/postgres.js
 * avoid float precision loss that way) — formatted exactly as stored, never
 * converted (ADR-0009).
 */
export function formatMoney(amount: string, currency: string): string {
  const formatter = FORMATTERS[currency];
  if (!formatter) return `${amount} ${currency}`;
  return formatter.format(Number(amount));
}

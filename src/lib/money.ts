const FORMATTERS: Record<string, Intl.NumberFormat> = {
  COP: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }),
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
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

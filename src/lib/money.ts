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

/**
 * Thousands-separator masking for the price *input* (T083) — separate from
 * `formatMoney`, which renders a finished, stored amount with its currency
 * symbol. This formats a partial, still-being-typed raw value with no
 * symbol, so it can round-trip through `parseAmountInput` below without
 * losing an in-progress decimal point (`"1300000."` has to survive being
 * displayed, unlike a symbol-formatted amount which is display-only).
 */
const GROUP_SEPARATOR: Record<"COP" | "USD", string> = { COP: ".", USD: "," };
const DECIMAL_SEPARATOR: Record<"COP" | "USD", string> = { COP: ",", USD: "." };

/** `raw` is always period-decimal (`priceAmountSchema`'s own format) regardless of currency — only the *display* separators vary by currency. */
export function formatAmountInput(raw: string, currency: "COP" | "USD"): string {
  if (!raw) return "";
  const [intPart, decPart] = raw.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR[currency]);
  return decPart !== undefined ? `${grouped}${DECIMAL_SEPARATOR[currency]}${decPart}` : grouped;
}

/**
 * Inverse of `formatAmountInput` — parses assuming the *currently selected*
 * currency's separator convention. Handles a plain pasted integer in the
 * *other* convention too (pasting `"1,300,000"` while COP is selected: `,`
 * is COP's decimal separator, but it appears three times, and a real decimal
 * point never repeats — multiple occurrences are treated as thousands
 * groups to strip, not a fractional part to guess at). A pasted value that's
 * genuinely ambiguous both ways (e.g. `"1,300,000.50"`, full USD formatting,
 * while COP is selected) is a real, narrow, accepted limitation — not
 * attempting to guess cross-currency intent from an ambiguous string.
 */
export function parseAmountInput(display: string, currency: "COP" | "USD"): string {
  const groupSep = GROUP_SEPARATOR[currency];
  const decSep = DECIMAL_SEPARATOR[currency];

  let cleaned = display.split(groupSep).join("");
  const decOccurrences = cleaned.split(decSep).length - 1;
  cleaned =
    decOccurrences === 1 ? cleaned.replace(decSep, ".") : cleaned.split(decSep).join("");

  cleaned = cleaned.replace(/[^\d.]/g, "");

  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned.slice(0, 12);

  const intPart = cleaned.slice(0, firstDot).slice(0, 12);
  const decPart = cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  return `${intPart}.${decPart}`;
}

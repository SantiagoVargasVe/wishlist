/**
 * `createItemSchema` only accepts these — a price scraped in any other
 * currency is real data a source correctly extracted, but not one the save
 * form can use, so it's dropped rather than prefilling a value that would
 * fail validation. Shared between `preview.ts`'s generic parse path and
 * `vendors/mercadolibre`'s API path so both apply the same rule.
 */
export const SUPPORTED_CURRENCIES = new Set(["COP", "USD"]);

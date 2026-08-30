import { z } from "zod";

/** Shared between the API routes and the add/edit-item forms (T053, T054). */

/**
 * User-facing validation messages are i18n **keys**, not English text — the
 * schema is shared with the API routes and stays language-neutral; the
 * forms resolve these through `translateMessage` at render (T092). A key
 * that never reaches a form (server-only paths) just renders as the key.
 */
const M = {
  url: "wishlist.itemForm.errors.url",
  title: "wishlist.itemForm.errors.title",
  priceAmount: "wishlist.itemForm.errors.priceAmount",
  priceAmountPositive: "wishlist.itemForm.errors.priceAmountPositive",
  pricePair: "wishlist.itemForm.errors.pricePair",
  wishlistIds: "wishlist.itemForm.errors.wishlistIds",
  atLeastOneField: "wishlist.itemForm.errors.atLeastOneField",
} as const;

/**
 * Matches the `numeric(14,2)` column: up to 12 integer digits, at most 2
 * decimal places. A string, not a number — money is never a float, on either
 * side of the wire.
 */
const priceAmountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, M.priceAmount)
  .refine((v) => Number(v) > 0, M.priceAmountPositive);

/** Matches the DB's currency CHECK constraint. */
const priceCurrencySchema = z.enum(["COP", "USD"]);

/** Price and currency travel together — same rule the DB enforces as a backstop. */
function pricePairRefinement() {
  return {
    message: M.pricePair,
    path: ["priceAmount"],
  };
}

export const createItemSchema = z
  .object({
    url: z.url(M.url),
    title: z.string().trim().min(1, M.title).max(300),
    notes: z.string().trim().max(2000).optional(),
    // The image shown live during preview (T032) — stored as `source_image_url`
    // and handed to `downloadItemImage()` (T033), never displayed from here directly.
    imageUrl: z.url().optional(),
    priceAmount: priceAmountSchema.optional(),
    priceCurrency: priceCurrencySchema.optional(),
    wishlistIds: z.array(z.uuid()).min(1, M.wishlistIds),
  })
  .refine(
    (v) => (v.priceAmount === undefined) === (v.priceCurrency === undefined),
    pricePairRefinement(),
  );

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z
  .object({
    url: z.url(M.url).optional(),
    title: z.string().trim().min(1, M.title).max(300).optional(),
    // Nullable as well as optional: omit to leave notes untouched, send null
    // to clear them, send a string to replace them.
    notes: z.string().trim().max(2000).nullable().optional(),
    priceAmount: priceAmountSchema.optional(),
    priceCurrency: priceCurrencySchema.optional(),
    // Replaces the stored picture: `PATCH` re-runs the download, exactly as
    // create does. Not nullable — clearing an image isn't a flow anything
    // offers, and "send null to clear" would need its own file cleanup.
    imageUrl: z.url("Enter a valid image URL").optional(),
  })
  .refine(
    (v) => (v.priceAmount === undefined) === (v.priceCurrency === undefined),
    pricePairRefinement(),
  )
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: M.atLeastOneField,
  });

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const addToWishlistSchema = z.object({
  wishlistId: z.uuid(),
});

export type AddToWishlistInput = z.infer<typeof addToWishlistSchema>;

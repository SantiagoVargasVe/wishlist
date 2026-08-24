import { z } from "zod";

/** Shared between the API routes and the add/edit-item forms (T053, T054). */

/**
 * Matches the `numeric(14,2)` column: up to 12 integer digits, at most 2
 * decimal places. A string, not a number — money is never a float, on either
 * side of the wire.
 */
const priceAmountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a valid amount")
  .refine((v) => Number(v) > 0, "Amount must be greater than zero");

/** Matches the DB's currency CHECK constraint. */
const priceCurrencySchema = z.enum(["COP", "USD"]);

/** Price and currency travel together — same rule the DB enforces as a backstop. */
function pricePairRefinement() {
  return {
    message: "Price and currency must be provided together",
    path: ["priceAmount"],
  };
}

export const createItemSchema = z
  .object({
    url: z.url("Enter a valid URL"),
    title: z.string().trim().min(1, "Enter a title").max(300),
    notes: z.string().trim().max(2000).optional(),
    priceAmount: priceAmountSchema.optional(),
    priceCurrency: priceCurrencySchema.optional(),
    wishlistIds: z.array(z.uuid()).min(1, "Choose at least one list"),
  })
  .refine(
    (v) => (v.priceAmount === undefined) === (v.priceCurrency === undefined),
    pricePairRefinement(),
  );

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z
  .object({
    url: z.url("Enter a valid URL").optional(),
    title: z.string().trim().min(1, "Enter a title").max(300).optional(),
    // Nullable as well as optional: omit to leave notes untouched, send null
    // to clear them, send a string to replace them.
    notes: z.string().trim().max(2000).nullable().optional(),
    priceAmount: priceAmountSchema.optional(),
    priceCurrency: priceCurrencySchema.optional(),
  })
  .refine(
    (v) => (v.priceAmount === undefined) === (v.priceCurrency === undefined),
    pricePairRefinement(),
  )
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const addToWishlistSchema = z.object({
  wishlistId: z.uuid(),
});

export type AddToWishlistInput = z.infer<typeof addToWishlistSchema>;

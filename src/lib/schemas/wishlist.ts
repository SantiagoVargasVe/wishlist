import { z } from "zod";

/** Shared between the API routes and the FE forms in T055. */

export const createWishlistSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(120),
});

export type CreateWishlistInput = z.infer<typeof createWishlistSchema>;

export const updateWishlistSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title").max(120).optional(),
    hideClaimsFromOwner: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.hideClaimsFromOwner !== undefined, {
    message: "Provide at least one field to update",
  });

export type UpdateWishlistInput = z.infer<typeof updateWishlistSchema>;

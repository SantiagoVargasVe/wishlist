import { z } from "zod";

/** Body of DELETE /api/w/:slug/items/:itemId/claim. Never a query param or URL segment — see security.md. */
export const unclaimSchema = z.object({
  claimToken: z.string().min(1, "claimToken is required"),
});

export type UnclaimInput = z.infer<typeof unclaimSchema>;

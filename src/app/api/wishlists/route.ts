import { createWishlistSchema } from "@/lib/schemas/wishlist";
import { requireUserId } from "@/server/auth/session";
import { createWishlist } from "@/server/services/wishlists";

import { handle } from "../_lib/respond";

/** POST /api/wishlists — any authenticated user; always creates a non-default list. */
export const POST = handle(async (request) => {
  const userId = await requireUserId();
  const input = createWishlistSchema.parse(await request.json());
  const wishlist = await createWishlist(userId, input);

  return Response.json({ wishlist }, { status: 201 });
});

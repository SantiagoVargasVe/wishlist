import { addToWishlistSchema } from "@/lib/schemas/item";
import { requireUserId } from "@/server/auth/session";
import { addItemToWishlist } from "@/server/services/items";

import { handle } from "../../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/items/:id/wishlists — owner only, on both the item and the
 * target list. Adds a membership; doesn't touch anything else about the item.
 */
export const POST = handle(async (request, { params }: Context) => {
  const userId = await requireUserId();
  const { id } = await params;
  const { wishlistId } = addToWishlistSchema.parse(await request.json());

  await addItemToWishlist(id, wishlistId, userId);
  return new Response(null, { status: 201 });
});

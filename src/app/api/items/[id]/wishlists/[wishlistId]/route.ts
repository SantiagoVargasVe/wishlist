import { requireUserId } from "@/server/auth/session";
import { removeItemFromWishlist } from "@/server/services/items";

import { handle } from "../../../../_lib/respond";

type Context = { params: Promise<{ id: string; wishlistId: string }> };

/**
 * DELETE /api/items/:id/wishlists/:wishlistId — owner only.
 *
 * Removing the item's last remaining membership also soft-deletes it — see
 * removeItemFromWishlist. No confirmation step: one item, one list, one
 * explicit action, unlike deleting a whole wishlist.
 */
export const DELETE = handle(async (request, { params }: Context) => {
  const userId = await requireUserId();
  const { id, wishlistId } = await params;

  await removeItemFromWishlist(id, wishlistId, userId);
  return new Response(null, { status: 204 });
});

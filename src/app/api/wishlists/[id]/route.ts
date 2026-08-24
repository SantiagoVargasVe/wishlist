import { updateWishlistSchema } from "@/lib/schemas/wishlist";
import { requireUserId } from "@/server/auth/session";
import { deleteWishlist, updateWishlist } from "@/server/services/wishlists";

import { handle } from "../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/wishlists/:id — owner only. Renaming the default list is allowed. */
export const PATCH = handle(async (request, { params }: Context) => {
  const userId = await requireUserId();
  const { id } = await params;
  const input = updateWishlistSchema.parse(await request.json());

  const wishlist = await updateWishlist(id, userId, input);
  return Response.json({ wishlist });
});

/**
 * DELETE /api/wishlists/:id — owner only.
 *
 * `?deleteOrphans=true` confirms deleting items that live nowhere else.
 * Without it, a would-be orphan responds `409 CONFIRM_DELETE_ORPHANS` and
 * deletes nothing. The default list can never be deleted, regardless of the
 * flag.
 */
export const DELETE = handle(async (request, { params }: Context) => {
  const userId = await requireUserId();
  const { id } = await params;
  const deleteOrphans =
    new URL(request.url).searchParams.get("deleteOrphans") === "true";

  await deleteWishlist(id, userId, { deleteOrphans });
  return new Response(null, { status: 204 });
});

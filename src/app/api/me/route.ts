import { requireUserId } from "@/server/auth/session";
import { getMyWishlists } from "@/server/services/me";

import { handle } from "../_lib/respond";

/**
 * GET /api/me
 *
 * Not `/api/auth/me` (T012, identity) — this one never returns user info,
 * only the wishlist aggregate. See docs/context/api-contract.md.
 */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const wishlists = await getMyWishlists(userId);

  return Response.json({ wishlists });
});

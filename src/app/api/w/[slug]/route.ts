import { getPublicWishlist } from "@/server/services/public-wishlist";

import { handle } from "../../_lib/respond";

type Context = { params: Promise<{ slug: string }> };

/** GET /api/w/:slug — anonymous. Slug possession is the whole permission model; see security.md. */
export const GET = handle(async (_request, { params }: Context) => {
  const { slug } = await params;
  const wishlist = await getPublicWishlist(slug);
  return Response.json({ wishlist });
});

import { unclaimSchema } from "@/lib/schemas/claim";
import { currentUserId } from "@/server/auth/session";
import { clientIp } from "@/server/rate-limit/client-ip";
import { enforce } from "@/server/rate-limit";
import { policies } from "@/server/rate-limit/policies";
import { claimItem, unclaimItem } from "@/server/services/claims";

import { handle } from "../../../../../_lib/respond";

type Context = { params: Promise<{ slug: string; itemId: string }> };

/**
 * POST /api/w/:slug/items/:itemId/claim — anonymous. `claimedByUserId` rides
 * along when the caller happens to be logged in, but auth is never required:
 * possession of the slug is the whole permission model here.
 */
export const POST = handle(async (request, { params }: Context) => {
  await enforce(policies.claim, `claim:${clientIp(request)}`);

  const { slug, itemId } = await params;
  const claimedByUserId = await currentUserId();

  const { claimToken } = await claimItem(slug, itemId, claimedByUserId);
  return Response.json({ claimToken }, { status: 201 });
});

/**
 * DELETE /api/w/:slug/items/:itemId/claim — anonymous. `claimToken` is in
 * the body, never the URL (see security.md — tokens in URLs leak via logs
 * and Referer).
 */
export const DELETE = handle(async (request, { params }: Context) => {
  await enforce(policies.claim, `claim:${clientIp(request)}`);

  const { slug, itemId } = await params;
  const { claimToken } = unclaimSchema.parse(await request.json());
  const requesterUserId = await currentUserId();

  await unclaimItem(slug, itemId, claimToken, requesterUserId);
  return new Response(null, { status: 204 });
});

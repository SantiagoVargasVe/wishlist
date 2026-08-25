import { requireUserId } from "@/server/auth/session";
import { enforce } from "@/server/rate-limit";
import { policies } from "@/server/rate-limit/policies";
import { createInvite } from "@/server/services/auth";

import { handle } from "../_lib/respond";

/**
 * POST /api/invites (T070) — authenticated, no body. Any account may mint a
 * code, rate limited per user (the caller is always known here, unlike
 * register's per-IP limit).
 */
export const POST = handle(async (_request) => {
  const userId = await requireUserId();
  await enforce(policies.invite, `invite:${userId}`);

  const invite = await createInvite(userId);

  return Response.json(invite, { status: 201 });
});

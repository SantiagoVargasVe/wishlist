import { currentUserId } from "@/server/auth/session";
import { UnauthorizedError } from "@/server/errors";
import { getUserById } from "@/server/services/auth";

import { handle } from "../../_lib/respond";

/**
 * GET /api/auth/me
 *
 * A valid token whose user has since been deleted is treated as unauthenticated
 * rather than as a 404 — the token is no longer meaningful either way.
 */
export const GET = handle(async () => {
  const userId = await currentUserId();
  if (!userId) throw new UnauthorizedError();

  const user = await getUserById(userId);
  if (!user) throw new UnauthorizedError();

  return Response.json({ user });
});

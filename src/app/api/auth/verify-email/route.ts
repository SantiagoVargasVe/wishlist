import { verifyEmailSchema } from "@/lib/schemas/auth";
import { clientIp } from "@/server/rate-limit/client-ip";
import { enforce } from "@/server/rate-limit";
import { policies } from "@/server/rate-limit/policies";
import { consumeVerificationToken } from "@/server/services/email-verification";

import { handle } from "../../_lib/respond";

/**
 * POST /api/auth/verify-email — unauthenticated.
 *
 * It has to be: the whole point is that someone opening a link from their
 * mailbox proves they control it, and requiring a session first would exclude
 * anyone verifying on a different device. Possession of the token is the
 * permission, which is why it gets its own rate limit (ADR-0013).
 *
 * Invalid, expired, already-used and wrong-purpose tokens all return the same
 * generic 400 — a *password reset* token presented here is rejected exactly
 * like an expired one, because the purpose is part of the claim's WHERE clause
 * rather than a check afterwards.
 */
export const POST = handle(async (request) => {
  await enforce(policies.emailVerify, `verify-email:${clientIp(request)}`);

  const { token } = verifyEmailSchema.parse(await request.json());
  await consumeVerificationToken(token);

  return new Response(null, { status: 204 });
});

import { forgotPasswordSchema } from "@/lib/schemas/auth";
import { clientIp } from "@/server/rate-limit/client-ip";
import { enforce } from "@/server/rate-limit";
import { policies } from "@/server/rate-limit/policies";
import {
  requestPasswordReset,
  resetRequestEmailKey,
} from "@/server/services/password-reset";

import { handle } from "../../_lib/respond";

/**
 * POST /api/auth/forgot-password — public.
 *
 * **Always 202, with an identical body.** Registered address, unknown address,
 * unverified address, provider outage: same status, same bytes. Any branch a
 * client can observe here is an account-enumeration oracle, so there is exactly
 * one return statement and the service throws nothing.
 *
 * The three silent no-send cases are distinguishable only in the server log,
 * and each logs distinctly — see `requestPasswordReset`. Per ADR-0013 that is
 * the sole diagnostic for this whole flow.
 *
 * Rate limited against **two** buckets, and refused if either is exhausted. The
 * IP bucket stops a spray across many accounts; the email bucket stops
 * mailbombing one person's inbox from many addresses. Neither substitutes for
 * the other (ADR-0012).
 */
export const POST = handle(async (request) => {
  // Before parsing: a client already over its limit shouldn't get a free body
  // parse, and this bucket is the one that doesn't need to know the address.
  await enforce(policies.passwordResetRequest, `forgot:ip:${clientIp(request)}`);

  const { email } = forgotPasswordSchema.parse(await request.json());
  await enforce(
    policies.passwordResetRequest,
    `forgot:email:${resetRequestEmailKey(email)}`,
  );

  await requestPasswordReset(email);

  return new Response(null, { status: 202 });
});

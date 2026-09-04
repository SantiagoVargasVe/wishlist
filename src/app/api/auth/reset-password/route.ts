import { resetPasswordSchema } from "@/lib/schemas/auth";
import { clientIp } from "@/server/rate-limit/client-ip";
import { enforce } from "@/server/rate-limit";
import { policies } from "@/server/rate-limit/policies";
import { consumeResetToken } from "@/server/services/password-reset";

import { handle } from "../../_lib/respond";

/**
 * POST /api/auth/reset-password — public; the token is the credential.
 *
 * Invalid, expired, already-used and wrong-purpose tokens all return the same
 * `400 RESET_TOKEN_INVALID`. The user's next step is the same in every case —
 * ask for a new link — and distinguishing them tells anyone else which of those
 * a token is.
 *
 * **Deliberately does not set a session cookie.** Registration and login both
 * do; this doesn't. A reset link arriving in a mailbox is not proof of session
 * intent, and the person has just demonstrated they can type the new password,
 * so `/login` is one step away. The UI redirects there (T105).
 *
 * The password is held to registration's rules by reusing that schema's
 * `passwordInput` rather than restating them — a reset that accepted something
 * weaker would be a way around the rule.
 */
export const POST = handle(async (request) => {
  // Before the body is parsed and before Argon2 runs. With a 256-bit token this
  // limit was never stopping a guess; it stops the CPU burn of hashing a
  // submitted password on every attempt (ADR-0012).
  await enforce(policies.passwordResetConsume, `reset:${clientIp(request)}`);

  const { token, password } = resetPasswordSchema.parse(await request.json());
  await consumeResetToken(token, password);

  return new Response(null, { status: 204 });
});

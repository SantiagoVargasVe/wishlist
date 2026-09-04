import { requireUserId } from "@/server/auth/session";
import { enforce } from "@/server/rate-limit";
import { policies } from "@/server/rate-limit/policies";
import { getUserById } from "@/server/services/auth";
import { sendVerificationEmail } from "@/server/services/email-verification";

import { handle } from "../../_lib/respond";

/**
 * POST /api/auth/resend-verification — authenticated.
 *
 * Rate limited per user rather than per IP: the endpoint requires a session, so
 * the account is the honest key, and a household sharing one address shouldn't
 * spend each other's budget.
 *
 * Minting replaces the user's outstanding verification token
 * (`mintVerificationToken`), so clicking resend twice never leaves two live
 * links — the newest mail is the one that works, which is what a user reaching
 * for the most recent message expects.
 *
 * Always 204, including when mail is unconfigured or the send fails. This is
 * not the enumeration-driven silence of `/forgot-password` — the caller is
 * logged in and we already know who they are — it is that there is nothing
 * useful to say: the failure is the operator's to see in the logs, and a user
 * who never receives the mail has the same next step either way.
 */
export const POST = handle(async () => {
  const userId = await requireUserId();
  await enforce(policies.emailVerifyResend, `verify-resend:${userId}`);

  const user = await getUserById(userId);
  if (user) await sendVerificationEmail(user);

  return new Response(null, { status: 204 });
});

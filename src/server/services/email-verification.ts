import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { users } from "../db/schema";
import type { Db } from "../db/types";
import { EmailVerificationErrors } from "../errors";
import { isMailConfigured, recipientDomain, sendMail } from "../mail";
import { verifyEmailMessage } from "../mail/templates/verify-email";
import { getConfig } from "../config";
import {
  claimToken,
  deleteSiblingTokens,
  mintToken,
  type MintedToken,
} from "./single-use-tokens";

/**
 * Email verification (ADR-0013).
 *
 * The rule that shapes this whole module: **verification gates nothing but
 * recovery.** `/api/auth/forgot-password` sends nothing to an unverified
 * address (T103), and that is the entire consequence. Not login, not any other
 * endpoint, not the app shell. Blocking login would lock out every existing
 * account on deploy and would make outbound mail a hard dependency,
 * contradicting ADR-0011. If a check on `email_verified_at` ever appears
 * anywhere else, it is a bug.
 *
 * The token machinery is T102's, reused unchanged via `single-use-tokens.ts`.
 */

/**
 * 24 hours, against reset's 30 minutes, and the difference is not an oversight.
 * A verification mail sitting in an inbox overnight is a completely normal
 * thing that should still work in the morning; a reset link doing the same is a
 * live credential nobody is watching.
 */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Mint a verification token, replacing any the user already holds.
 *
 * The replacement is here rather than in the resend endpoint so it holds for
 * every path that mints one. At most one verification link is ever live per
 * account, which is what "resend" should mean to a user who clicks it twice
 * and then reaches for the older mail.
 *
 * Scoped to `email_verify`: an outstanding password reset link is a separate
 * lifecycle and is left alone.
 */
export function mintVerificationToken(
  userId: string,
  db: Db = getDb(),
): Promise<MintedToken> {
  return db.transaction(async (tx) => {
    await deleteSiblingTokens(userId, "email_verify", null, tx);
    return mintToken(userId, "email_verify", VERIFICATION_TOKEN_TTL_MS, tx);
  });
}

/**
 * Spend a verification token and mark the address verified.
 *
 * Invalid, expired, already-used, wrong-purpose and unknown tokens are one
 * error with one message — a *password reset* token presented here is not found
 * at all, because the purpose is part of the claim's WHERE clause rather than a
 * check afterwards.
 */
export async function consumeVerificationToken(
  token: string,
  db: Db = getDb(),
): Promise<{ userId: string }> {
  return db.transaction(async (tx) => {
    const claimed = await claimToken(token, "email_verify", tx);
    if (!claimed) throw EmailVerificationErrors.invalidToken();

    // Idempotent by construction: the token is spent either way, so verifying
    // an already-verified address just moves the timestamp forward.
    await tx
      .update(users)
      .set({ emailVerifiedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(users.id, claimed.userId));

    return { userId: claimed.userId };
  });
}

export type VerificationRecipient = {
  id: string;
  email: string;
  displayName: string;
};

/**
 * Mint a token and mail it — the whole "send a verification email" step, in the
 * one place that knows how to fail quietly.
 *
 * **Nothing here may propagate.** Registration calls it after its transaction
 * has committed, and a mail problem must never turn a successful registration
 * into an error the user sees. They are registered, logged in, and unverified;
 * the only thing they cannot do is self-serve a password reset, and
 * `npm run reset-link` covers them until they verify.
 *
 * When mail is unconfigured this returns silently and mints nothing. No log
 * line: an operator running no SMTP provider configured that on purpose
 * (ADR-0011), and a warning on every registration would be noise about a
 * supported state. The place where "mail is unconfigured" genuinely needs to be
 * loud is `/forgot-password` (T103), where a person is actively waiting for a
 * link that will never arrive.
 */
export async function sendVerificationEmail(
  user: VerificationRecipient,
  db: Db = getDb(),
): Promise<void> {
  try {
    if (!isMailConfigured()) return;

    const { token } = await mintVerificationToken(user.id, db);
    const url = `${getConfig().APP_URL}/verify-email/${token}`;
    const hours = Math.round(VERIFICATION_TOKEN_TTL_MS / 3_600_000);

    await sendMail({
      to: user.email,
      ...verifyEmailMessage(user.displayName, url, hours),
    });
  } catch (error) {
    // Logged, never surfaced, and never rethrown. Per ADR-0011 this log is the
    // only signal an operator gets that a broken API key has silently stopped
    // verification mail, so it is an error rather than a warning.
    console.error(
      `Verification email failed for a recipient at ${recipientDomain(user.email)}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

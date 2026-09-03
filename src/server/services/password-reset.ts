import "server-only";

import { eq, sql } from "drizzle-orm";

import { hashPassword } from "../auth/password";
import { getConfig } from "../config";
import { getDb } from "../db";
import { users } from "../db/schema";
import type { Db } from "../db/types";
import { PasswordResetErrors } from "../errors";
import { isMailConfigured, recipientDomain, sendMail } from "../mail";
import { passwordResetMessage } from "../mail/templates/password-reset";
import {
  claimToken,
  deleteSiblingTokens,
  hashToken,
  mintToken,
  type MintedToken,
} from "./single-use-tokens";

/**
 * Password reset, as domain logic only — no HTTP, no email (ADR-0012).
 *
 * `POST /api/auth/reset-password` (T103) and `scripts/reset-link.ts` (T106)
 * both sit on top of this, which is what makes them behave identically: same
 * expiry, same single-use claim, same table.
 *
 * The token machinery itself lives in `single-use-tokens.ts`, shared with email
 * verification — see ADR-0013 for why one table and one consume statement serve
 * both.
 */

/**
 * 30 minutes. Short because a reset link is a live credential sitting in a
 * mailbox, and because the flow it serves is one someone completes now rather
 * than tomorrow. Deliberately much shorter than verification's 24 hours: a
 * verification mail sat overnight is normal, a reset link sat overnight is not.
 */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export type MintedResetToken = MintedToken;

/** Mint a reset token. The plaintext is returned once and never persisted. */
export function mintResetToken(
  userId: string,
  db: Db = getDb(),
): Promise<MintedResetToken> {
  return mintToken(userId, "password_reset", RESET_TOKEN_TTL_MS, db);
}

/**
 * Spend a reset token and set the new password.
 *
 * Invalid, expired, already-used, wrong-purpose and unknown tokens are
 * indistinguishable to the caller — one error, one message. There is nothing
 * useful to tell apart for a legitimate user (their next action is the same in
 * every case: request a new link), and telling them apart hands a probe to
 * everyone else.
 */
export async function consumeResetToken(
  token: string,
  newPassword: string,
  db: Db = getDb(),
): Promise<{ userId: string }> {
  // Argon2id is ~50-100ms of CPU and 19 MB, and holding a transaction open for
  // it would pin a connection — the same reason `registerUser` hashes first.
  //
  // The cost is that an invalid token still pays for a hash. That is what the
  // `passwordResetConsume` rate limit is for: with a 256-bit token the limit
  // was never stopping a guess, it was stopping exactly this CPU burn.
  const passwordHash = await hashPassword(newPassword);

  return db.transaction(async (tx) => {
    // One conditional UPDATE, including the purpose predicate — see
    // `claimToken`. A verification token presented here is simply not found.
    const claimed = await claimToken(token, "password_reset", tx);
    if (!claimed) throw PasswordResetErrors.invalidToken();

    const { userId } = claimed;

    // Same transaction as the claim. A crash between the two would leave a
    // spent token with the old password still working — a link burned for
    // nothing, and the user locked out with no way to tell why.
    await tx
      .update(users)
      .set({
        passwordHash,
        // Revokes every session issued before now (ADR-0012, enforced by
        // T104). A reset that leaves someone else's 30-day cookie working has
        // done nothing about the reason most people reset.
        sessionsValidFrom: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId));

    // Every other outstanding reset link for this account dies with the one
    // that was used. Otherwise a person who requested three leaves two live
    // credentials in their mailbox after fixing the problem.
    await deleteSiblingTokens(userId, "password_reset", hashToken(token), tx);

    return { userId };
  });
}

/**
 * The per-address rate-limit bucket key for `/api/auth/forgot-password`.
 *
 * Lowercased before hashing, and that is not cosmetic: `users.email` is
 * `citext`, so `Ana@x.com` and `ana@x.com` are one account. Bucketing on the
 * raw string would let anyone reset the limit by changing the capitalisation —
 * a bypass of the cap that exists to stop mailbombing one person.
 *
 * Hashed so the `rate_limits` table doesn't accumulate a plaintext list of who
 * has been asking for password resets. It is keyed data, not a secret, but
 * there is no reason for it to be readable.
 */
export function resetRequestEmailKey(email: string): string {
  return hashToken(email.trim().toLowerCase());
}

/**
 * `POST /api/auth/forgot-password`, minus the HTTP.
 *
 * **Returns void in every case, and throws in none.** The endpoint answers 202
 * whatever happens, so this function's only outputs are a possible email and a
 * log line. Three different things can silently produce no mail — the address
 * is unknown, the address is unverified, or the send failed — and per ADR-0013
 * server-side logging is the *only* way anyone can tell them apart. So each
 * logs distinctly; a shared "reset requested, nothing sent" line would defeat
 * the entire diagnostic story for this flow.
 *
 * One honest caveat, already recorded in ADR-0012: the response is identical
 * but the *timing* is not, since a real send waits on SMTP. There is no Argon2
 * on this path so the difference is the network call, and closing it would mean
 * queueing mail, which ADR-0011 rejected as ceremony at this volume.
 */
export async function requestPasswordReset(
  email: string,
  db: Db = getDb(),
): Promise<void> {
  // citext, so this matches however the address was typed.
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.info("Password reset requested for an address with no account.");
    return;
  }

  // The gate ADR-0013 exists for, and the reason this task depends on T108.
  // A mistyped address at registration means the reset link goes to whoever
  // owns the typo — and since this endpoint is public, they can ask for one
  // whenever they like. Not "a locked-out user": account takeover.
  if (!user.emailVerifiedAt) {
    console.info(
      `Password reset requested for an unverified address at ${recipientDomain(user.email)}. ` +
        "No token minted. They must verify first, or an operator can run `npm run reset-link`.",
    );
    return;
  }

  if (!isMailConfigured()) {
    // Minted anyway: the operator can still deliver it, and this is the
    // supported configuration rather than a broken one (ADR-0011).
    await mintResetToken(user.id, db);
    console.warn(
      `Password reset token minted for an address at ${recipientDomain(user.email)} but not ` +
        "delivered: outbound mail is not configured. Run `npm run reset-link -- <email>` " +
        "to mint and hand over a link directly.",
    );
    return;
  }

  const { token } = await mintResetToken(user.id, db);
  const url = `${getConfig().APP_URL}/reset-password/${token}`;
  const minutes = Math.round(RESET_TOKEN_TTL_MS / 60_000);

  try {
    await sendMail({ to: user.email, ...passwordResetMessage(url, minutes) });
  } catch (error) {
    // Swallowed on purpose, and this is the one place in the codebase where
    // that is the correct thing to do. Surfacing a send failure would make the
    // response differ between "address registered, provider broken" and
    // "address unknown" — an account-enumeration oracle handed out by an
    // outage. Logged at error level because, per ADR-0011, this line is the
    // only signal that a broken API key has silently disabled recovery.
    console.error(
      `Password reset mail failed for a recipient at ${recipientDomain(user.email)}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

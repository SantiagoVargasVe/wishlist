import "server-only";

import { eq, sql } from "drizzle-orm";

import { hashPassword } from "../auth/password";
import { getDb } from "../db";
import { users } from "../db/schema";
import type { Db } from "../db/types";
import { PasswordResetErrors } from "../errors";
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

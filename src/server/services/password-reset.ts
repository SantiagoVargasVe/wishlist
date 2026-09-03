import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";

import { hashPassword } from "../auth/password";
import { getDb } from "../db";
import { passwordResetTokens, users } from "../db/schema";
import type { Db } from "../db/types";
import { PasswordResetErrors } from "../errors";

/**
 * Password reset, as domain logic only — no HTTP, no email (ADR-0012).
 *
 * `POST /api/auth/reset-password` (T103) and `scripts/reset-link.ts` (T106)
 * both sit on top of this, which is what makes them behave identically: same
 * expiry, same single-use claim, same table.
 */

/**
 * 30 minutes. Short because a reset link is a live credential sitting in a
 * mailbox — and because the flow it serves is one someone completes now, not
 * tomorrow. Named rather than a literal at the call site: two places mint
 * links and they must not drift.
 */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * SHA-256, deliberately, where passwords get Argon2id.
 *
 * These look like the same problem and are not. Argon2id makes *low-entropy*
 * secrets expensive to guess; a human-chosen password has maybe 30 bits, so
 * the defence has to be cost per attempt. This token has 256 bits from a
 * CSPRNG — not guessable at any cost per attempt — so a memory-hard hash would
 * add ~100ms and 19 MB to every lookup and buy nothing.
 *
 * Hashing at all still matters: a leaked database backup, or a stray
 * `SELECT *` in a log, then hands over no live reset links.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type MintedResetToken = {
  /** Returned exactly once, to whoever is delivering it. Never persisted, never logged. */
  token: string;
  expiresAt: Date;
};

/**
 * Mint a reset token for a user.
 *
 * The plaintext is handed back here and nowhere else — only its hash reaches
 * the database. 32 bytes is 256 bits of entropy, base64url so it survives a
 * URL path without escaping.
 */
export async function mintResetToken(
  userId: string,
  db: Db = getDb(),
): Promise<MintedResetToken> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db
    .insert(passwordResetTokens)
    .values({ tokenHash: hashToken(token), userId, expiresAt });

  return { token, expiresAt };
}

/**
 * Spend a reset token and set the new password.
 *
 * Invalid, expired, already-used and unknown tokens are indistinguishable to
 * the caller — one error, one message. There is nothing useful to tell apart
 * for a legitimate user (their next action is the same in every case: request
 * a new link), and telling them apart hands a probe to everyone else.
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
  const tokenHash = hashToken(token);

  return db.transaction(async (tx) => {
    // The claim, and the whole security of this function: **one** conditional
    // UPDATE. A read-then-write lets two concurrent requests both observe an
    // unused token and both proceed — the second then resets the password a
    // second time with whatever *it* was given. Under READ COMMITTED the
    // loser here blocks on the row lock, re-evaluates `used_at IS NULL` after
    // the winner commits, and matches nothing.
    const claimed = await tx
      .update(passwordResetTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });

    if (claimed.length === 0) throw PasswordResetErrors.invalidToken();
    const { userId } = claimed[0];

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

    // Every other outstanding link for this account dies with the one that was
    // used. Otherwise a person who requested three resets leaves two live
    // credentials in their mailbox after fixing the problem.
    await tx
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          ne(passwordResetTokens.tokenHash, tokenHash),
        ),
      );

    return { userId };
  });
}

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";

import { passwordResetTokens } from "../db/schema";
import type { TokenPurpose } from "../db/schema";
import type { DbOrTx } from "../db/types";

/**
 * The machinery both single-use token flows share.
 *
 * A password reset token and an email verification token are the same object:
 * a high-entropy secret, stored hashed, bound to a user, expiring, spendable
 * once. ADR-0013 keeps them in one table with a `purpose` discriminator for
 * exactly this reason — the atomic consume below is the most
 * security-sensitive and most easily-got-wrong code in the app, and writing it
 * twice would mean maintaining two chances to get it wrong.
 *
 * What differs between the two lives in the callers: the expiry, what
 * consuming means, and what else happens in the same transaction.
 */

/**
 * SHA-256, deliberately, where passwords get Argon2id.
 *
 * These look like the same problem and are not. Argon2id makes *low-entropy*
 * secrets expensive to guess; a human-chosen password has maybe 30 bits, so the
 * defence has to be cost per attempt. These tokens carry 256 bits from a
 * CSPRNG — not guessable at any cost per attempt — so a memory-hard hash would
 * add ~100ms and 19 MB to every lookup and buy nothing.
 *
 * Hashing at all still matters: a leaked database backup, or a stray
 * `SELECT *` in a log, then hands over no live links.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type MintedToken = {
  /** Returned exactly once, to whoever delivers it. Never persisted, never logged. */
  token: string;
  expiresAt: Date;
};

/**
 * Mint a token of a given purpose.
 *
 * The plaintext is handed back here and nowhere else — only its hash reaches
 * the database. 32 bytes is 256 bits of entropy, base64url so it survives a URL
 * path without escaping.
 *
 * `purpose` is a required argument rather than a defaulted one on purpose. The
 * column carries a database default so the migration could backfill existing
 * rows, and a verification token that silently inherited it would be a reset
 * link mailed to an unverified address — the takeover path ADR-0013 closes.
 */
export async function mintToken(
  userId: string,
  purpose: TokenPurpose,
  ttlMs: number,
  db: DbOrTx,
): Promise<MintedToken> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs);

  await db
    .insert(passwordResetTokens)
    .values({ tokenHash: hashToken(token), userId, purpose, expiresAt });

  return { token, expiresAt };
}

/**
 * Spend a token, or return null if it cannot be spent.
 *
 * **One conditional UPDATE**, which is the whole security of both flows. A
 * read-then-write lets two concurrent requests both observe an unused token and
 * both proceed. Under READ COMMITTED the loser here blocks on the row lock,
 * re-evaluates `used_at IS NULL` once the winner commits, and matches nothing.
 *
 * The `purpose` predicate is part of the same statement rather than a check
 * afterwards, so a token of the wrong kind is simply not found — a reset token
 * presented for verification and a verification token presented for reset both
 * fail here, indistinguishably from an expired or unknown one.
 *
 * Returns null rather than throwing so each caller can raise its own error:
 * "that reset link is invalid" and "that verification link is invalid" are
 * different messages for the same shape of failure.
 */
export async function claimToken(
  token: string,
  purpose: TokenPurpose,
  tx: DbOrTx,
): Promise<{ userId: string } | null> {
  const claimed = await tx
    .update(passwordResetTokens)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        eq(passwordResetTokens.purpose, purpose),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: passwordResetTokens.userId });

  return claimed[0] ?? null;
}

/**
 * Delete this user's other outstanding tokens of the same purpose.
 *
 * Scoped by purpose: spending a reset link should not quietly invalidate a
 * verification mail sitting in the same inbox, and vice versa. They are
 * separate lifecycles that happen to share a table.
 */
export async function deleteSiblingTokens(
  userId: string,
  purpose: TokenPurpose,
  keepTokenHash: string | null,
  tx: DbOrTx,
): Promise<void> {
  await tx
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        eq(passwordResetTokens.purpose, purpose),
        ...(keepTokenHash
          ? [ne(passwordResetTokens.tokenHash, keepTokenHash)]
          : []),
      ),
    );
}

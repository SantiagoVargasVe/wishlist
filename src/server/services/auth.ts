import "server-only";

import { and, eq, isNull, or, gt, sql } from "drizzle-orm";

import { hashPassword } from "../auth/password";
import { getDb } from "../db";
import { inviteCodes, users } from "../db/schema";
import type { Db } from "../db/types";
import { PG_UNIQUE_VIOLATION, isPgError } from "../db/pg-errors";
import { InviteErrors, emailTaken } from "../errors";
import type { RegisterInput } from "@/lib/schemas/auth";

/** What callers may see. Never includes the password hash. */
export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
};

/**
 * Create an account, consuming a single-use invite code.
 */
export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  return registerUserWithDb(getDb(), input);
}

/**
 * The testable core.
 *
 * Route handlers call `registerUser`, which resolves the shared handle; tests
 * call this with a handle onto the test database. Keeping the seam here means
 * `src/app` never touches a `Db` at all, which is the boundary ADR-0001 wants
 * and ESLint enforces.
 */
export async function registerUserWithDb(
  db: Db,
  input: RegisterInput,
): Promise<PublicUser> {
  // Pre-flight read. Advisory only — it can race, and the conditional UPDATE
  // below is what actually decides. Its value is a precise error message for
  // the common cases (wrong code, already spent, expired) instead of a generic
  // one after the fact.
  const [existing] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, input.inviteCode))
    .limit(1);

  if (!existing) throw InviteErrors.invalid();
  if (existing.usedAt) throw InviteErrors.alreadyUsed();
  if (existing.expiresAt && existing.expiresAt <= new Date()) {
    throw InviteErrors.expired();
  }

  // Hash outside the transaction. Argon2id is deliberately slow (~50-100ms),
  // and holding a transaction open for it would pin a connection for no reason.
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    let user: PublicUser;

    try {
      const [row] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          displayName: input.displayName,
        })
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
        });
      user = row;
    } catch (error) {
      // citext makes this case-insensitive, so this catches Alice@x.com
      // colliding with alice@x.com.
      if (isPgError(error, PG_UNIQUE_VIOLATION)) throw emailTaken();
      throw error;
    }

    // The authoritative gate. A conditional UPDATE is atomic; a read-then-write
    // has a window where two people racing the same code both succeed, which
    // would mint two accounts from one invite.
    const claimed = await tx
      .update(inviteCodes)
      .set({ usedBy: user.id, usedAt: new Date() })
      .where(
        and(
          eq(inviteCodes.code, input.inviteCode),
          isNull(inviteCodes.usedAt),
          or(
            isNull(inviteCodes.expiresAt),
            gt(inviteCodes.expiresAt, sql`now()`),
          ),
        ),
      )
      .returning({ code: inviteCodes.code });

    // Lost the race. Throwing rolls back the user we just inserted, so a failed
    // registration leaves no orphan account — and, just as importantly, a
    // failure anywhere in here leaves the code unspent.
    if (claimed.length === 0) throw InviteErrors.alreadyUsed();

    return user;
  });
}

import "server-only";

import { and, eq, isNull, or, gt, sql } from "drizzle-orm";

import { hashPassword, verifyPassword } from "../auth/password";
import { getDb } from "../db";
import { inviteCodes, users } from "../db/schema";
import type { Db } from "../db/types";
import { PG_UNIQUE_VIOLATION, isPgError } from "../db/pg-errors";
import { InviteErrors, emailTaken, invalidCredentials } from "../errors";
import { generateInviteCode } from "@/lib/invite-code";
import type { LoginInput, RegisterInput } from "@/lib/schemas/auth";
import { createDefaultWishlist, type PublicWishlist } from "./wishlists";

/** What callers may see. Never includes the password hash. */
export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
};

export type RegisterResult = {
  user: PublicUser;
  wishlist: PublicWishlist;
};

/**
 * Create an account: consume a single-use invite code, create the user, and
 * create their default wishlist. All three or none — a user with no default
 * list is a broken state, since the share CTA depends on it existing and
 * nothing else ever creates one.
 */
/**
 * The `db` default is evaluated per call, so production callers omit it and
 * tests pass a handle onto the test database. A default parameter rather than a
 * separate wrapper function: the wrapper existed only to satisfy the boundary
 * and could never be covered by tests, which is a design smell the coverage
 * gate correctly flagged.
 *
 * `src/app` never sees a `Db` either way — that is the boundary ADR-0001 wants
 * and ESLint enforces.
 */
export async function registerUser(
  input: RegisterInput,
  db: Db = getDb(),
): Promise<RegisterResult> {
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

    // Same transaction as the user insert: a user must never exist without a
    // default list, or vice versa. If anything below this point throws, the
    // wishlist rolls back along with the user and the invite stays unspent.
    const wishlist = await createDefaultWishlist(user.id, tx);

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

    return { user, wishlist };
  });
}

/**
 * A real Argon2id hash of a random string, verified against when no user
 * matches.
 *
 * Without it, an unknown email returns as soon as the SELECT misses, while a
 * known email pays ~50-100ms of hashing. That difference is measurable over the
 * network and turns login into an account-enumeration oracle — which would undo
 * the generic error message.
 *
 * Not a secret. It exists purely to burn a comparable amount of time.
 */
const TIMING_DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$FdXj8OOoTTHAFNXlJ/eHig$pyagA5O2KwoINN9tP8GRXoj3CnDZLoCL0trVGiGfYiM";

/** Verify credentials. Throws the same error for every kind of failure. */
export async function loginUser(
  input: LoginInput,
  db: Db = getDb(),
): Promise<PublicUser> {
  // citext makes this case-insensitive, so login matches however the address
  // was typed at registration.
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  const passwordMatches = await verifyPassword(
    input.password,
    user?.passwordHash ?? TIMING_DUMMY_HASH,
  );

  if (!user || !passwordMatches) throw invalidCredentials();

  return { id: user.id, email: user.email, displayName: user.displayName };
}

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteResult = { code: string; expiresAt: Date };

/**
 * `POST /api/invites` (T070). Any authenticated user may mint one — unlike
 * `npm run seed:invite` (bootstrap, admin-only, never expires), a
 * self-minted code expires in 7 days. Opening minting to every account means
 * a forgotten or accidentally-shared code should die on its own rather than
 * stay valid forever; consumption (`registerUser` above) already handles
 * `expires_at` and needs no changes.
 *
 * No collision retry, same call `generateSlug()` (wishlists.ts) already
 * makes: the alphabet is wide enough that a collision is astronomically
 * unlikely, and retrying would be complexity with no real payoff.
 */
export async function createInvite(userId: string, db: Db = getDb()): Promise<InviteResult> {
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  await db.insert(inviteCodes).values({ code, createdBy: userId, expiresAt });

  return { code, expiresAt };
}

/** Look up a user by id. Returns null rather than throwing — callers decide. */
export async function getUserById(
  id: string,
  db: Db = getDb(),
): Promise<PublicUser | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user ?? null;
}

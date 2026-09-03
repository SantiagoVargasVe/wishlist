import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { verifyPassword } from "../auth/password";
import * as schema from "../db/schema";
import { passwordResetTokens, users } from "../db/schema";
import {
  TEST_DATABASE_URL,
  createTestDb,
  hasTestDatabase,
  type TestDb,
} from "../db/test-support";
import { DomainError } from "../errors";
import {
  RESET_TOKEN_TTL_MS,
  consumeResetToken,
  mintResetToken,
} from "./password-reset";

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe.skipIf(!hasTestDatabase)("password reset", () => {
  let ctx: TestDb;
  let userId: string;
  let otherId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE password_reset_tokens, users RESTART IDENTITY CASCADE`;
    const created = await ctx.db
      .insert(users)
      .values([
        { email: "ana@example.com", passwordHash: "old-hash", displayName: "Ana" },
        { email: "beto@example.com", passwordHash: "old-hash", displayName: "Beto" },
      ])
      .returning();
    userId = created[0].id;
    otherId = created[1].id;
  });

  const readUser = async (id: string) => {
    const [row] = await ctx.db.select().from(users).where(eq(users.id, id));
    return row;
  };

  describe("mintResetToken", () => {
    it("returns the plaintext once and stores only its hash", async () => {
      const { token } = await mintResetToken(userId, ctx.db);

      const rows = await ctx.db.select().from(passwordResetTokens);
      expect(rows).toHaveLength(1);
      // The row must be useless to anyone who reads it — a leaked backup hands
      // over no live reset links.
      expect(rows[0].tokenHash).not.toBe(token);
      expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].usedAt).toBeNull();
    });

    it("mints a URL-safe token with 256 bits of entropy", async () => {
      const { token } = await mintResetToken(userId, ctx.db);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("expires 30 minutes out", async () => {
      const { expiresAt } = await mintResetToken(userId, ctx.db);
      const drift = Math.abs(expiresAt.getTime() - (Date.now() + RESET_TOKEN_TTL_MS));
      expect(drift).toBeLessThan(5_000);
    });

    it("mints distinct tokens", async () => {
      const a = await mintResetToken(userId, ctx.db);
      const b = await mintResetToken(userId, ctx.db);
      expect(a.token).not.toBe(b.token);
    });
  });

  describe("consumeResetToken", () => {
    it("sets the new password and marks the token used", async () => {
      const { token } = await mintResetToken(userId, ctx.db);

      const result = await consumeResetToken(token, "una-clave-nueva", ctx.db);
      expect(result.userId).toBe(userId);

      const user = await readUser(userId);
      expect(await verifyPassword("una-clave-nueva", user.passwordHash)).toBe(true);

      const [row] = await ctx.db.select().from(passwordResetTokens);
      expect(row.usedAt).not.toBeNull();
    });

    it("moves sessions_valid_from forward, revoking older sessions", async () => {
      // The point of ADR-0012: a reset that leaves someone else's 30-day
      // cookie working has done nothing about the reason most people reset.
      const before = (await readUser(userId)).sessionsValidFrom;
      const { token } = await mintResetToken(userId, ctx.db);

      await consumeResetToken(token, "una-clave-nueva", ctx.db);

      const after = (await readUser(userId)).sessionsValidFrom;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it("deletes the user's other outstanding tokens", async () => {
      // Otherwise someone who requested three links leaves two live
      // credentials in their mailbox after fixing the problem.
      const first = await mintResetToken(userId, ctx.db);
      await mintResetToken(userId, ctx.db);
      await mintResetToken(userId, ctx.db);
      const untouched = await mintResetToken(otherId, ctx.db);

      await consumeResetToken(first.token, "una-clave-nueva", ctx.db);

      const rows = await ctx.db.select().from(passwordResetTokens);
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.userId === userId)).toHaveLength(1);
      // Another account's token is not collateral damage.
      expect(rows.some((r) => r.userId === otherId)).toBe(true);
      expect(await errorCode(consumeResetToken(untouched.token, "otra-clave-x", ctx.db)))
        .toBeUndefined();
    });

    it("rejects a second use of the same token", async () => {
      const { token } = await mintResetToken(userId, ctx.db);
      await consumeResetToken(token, "una-clave-nueva", ctx.db);

      expect(await errorCode(consumeResetToken(token, "otra-clave-mas", ctx.db))).toBe(
        "RESET_TOKEN_INVALID",
      );

      // And the second password never landed.
      const user = await readUser(userId);
      expect(await verifyPassword("una-clave-nueva", user.passwordHash)).toBe(true);
    });

    it("rejects an expired token", async () => {
      const { token } = await mintResetToken(userId, ctx.db);
      await ctx.sql`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`;

      expect(await errorCode(consumeResetToken(token, "una-clave-nueva", ctx.db))).toBe(
        "RESET_TOKEN_INVALID",
      );
    });

    it("rejects an unknown token with the same error as an expired one", async () => {
      expect(await errorCode(consumeResetToken("not-a-real-token", "una-clave-nueva", ctx.db)))
        .toBe("RESET_TOKEN_INVALID");
    });

    it("leaves the password untouched when the token is rejected", async () => {
      await consumeResetToken(
        (await mintResetToken(userId, ctx.db)).token,
        "una-clave-nueva",
        ctx.db,
      );
      const before = (await readUser(userId)).passwordHash;

      await errorCode(consumeResetToken("not-a-real-token", "clave-del-atacante", ctx.db));

      expect((await readUser(userId)).passwordHash).toBe(before);
    });

    it("lets exactly one of two concurrent consumes win", async () => {
      // The reason the claim is a single conditional UPDATE. A read-then-write
      // lets both requests observe an unused token, and the loser then resets
      // the password a second time with whatever *it* was given.
      //
      // A second connection is the whole point: the shared test handle is
      // max: 1, which would serialise the two transactions and prove nothing.
      const second = postgres(TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
      const otherDb = drizzle(second, { schema });

      try {
        const { token } = await mintResetToken(userId, ctx.db);

        const results = await Promise.allSettled([
          consumeResetToken(token, "clave-de-ana-uno", ctx.db),
          consumeResetToken(token, "clave-de-ana-dos", otherDb),
        ]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const loser = results.find((r) => r.status === "rejected");
        expect((loser as PromiseRejectedResult).reason).toBeInstanceOf(DomainError);
        expect(((loser as PromiseRejectedResult).reason as DomainError).code).toBe(
          "RESET_TOKEN_INVALID",
        );

        // Exactly one of the two passwords is live, never both, never neither.
        const user = await readUser(userId);
        const matches = await Promise.all([
          verifyPassword("clave-de-ana-uno", user.passwordHash),
          verifyPassword("clave-de-ana-dos", user.passwordHash),
        ]);
        expect(matches.filter(Boolean)).toHaveLength(1);
      } finally {
        await second.end();
      }
    });
  });
});

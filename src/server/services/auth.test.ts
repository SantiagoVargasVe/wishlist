import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { inviteCodes, users } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { DomainError } from "../errors";
import { getUserById, loginUser, registerUser } from "./auth";

const input = {
  email: "alice@example.com",
  password: "correct-horse-battery",
  displayName: "Alice",
  inviteCode: "ABCDEFGHJK",
};

/** Run and return the DomainError code, or undefined if it succeeded. */
async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe.skipIf(!hasTestDatabase)("registerUser", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE invite_codes, users RESTART IDENTITY CASCADE`;
    await ctx.db.insert(inviteCodes).values({ code: input.inviteCode });
  });

  it("creates the user and consumes the code", async () => {
    const user = await registerUser(input, ctx.db);

    expect(user.email).toBe("alice@example.com");
    expect(user.displayName).toBe("Alice");

    const [code] = await ctx.db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, input.inviteCode));

    expect(code.usedBy).toBe(user.id);
    expect(code.usedAt).toBeInstanceOf(Date);
  });

  it("never returns the password hash", async () => {
    const user = await registerUser(input, ctx.db);
    expect(Object.keys(user)).toEqual(["id", "email", "displayName"]);
  });

  it("stores a hash, not the password", async () => {
    await registerUser(input, ctx.db);
    const [row] = await ctx.db.select().from(users);

    expect(row.passwordHash).not.toContain(input.password);
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("rejects an unknown code", async () => {
    const code = await errorCode(
      registerUser({ ...input, inviteCode: "ZZZZZZZZZZ" }, ctx.db),
    );
    expect(code).toBe("VALIDATION_FAILED");
  });

  it("rejects a code that was already used", async () => {
    await registerUser(input, ctx.db);

    const code = await errorCode(
      registerUser({ ...input, email: "bob@example.com" }, ctx.db),
    );
    expect(code).toBe("INVITE_ALREADY_USED");
  });

  it("rejects an expired code", async () => {
    await ctx.db.insert(inviteCodes).values({
      code: "EXPIREDCDE",
      expiresAt: new Date(Date.now() - 1000),
    });

    const code = await errorCode(
      registerUser({ ...input, inviteCode: "EXPIREDCDE" }, ctx.db),
    );
    expect(code).toBe("VALIDATION_FAILED");
  });

  it("accepts a code whose expiry is in the future", async () => {
    await ctx.db.insert(inviteCodes).values({
      code: "FUTUREABCD",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const user = await registerUser({
      ...input,
      inviteCode: "FUTUREABCD",
    }, ctx.db);
    expect(user.id).toBeDefined();
  });

  it("rejects a duplicate email, case-insensitively", async () => {
    await registerUser(input, ctx.db);
    await ctx.db.insert(inviteCodes).values({ code: "SECONDCODE" });

    const code = await errorCode(
      registerUser({
        ...input,
        email: "ALICE@example.com",
        inviteCode: "SECONDCODE",
      }, ctx.db),
    );
    expect(code).toBe("EMAIL_TAKEN");
  });

  it("leaves the code unspent when registration fails", async () => {
    // Otherwise a typo'd email costs someone their invite — they'd have to ask
    // for a new one because of a mistake the system could have absorbed.
    await ctx.db.insert(users).values({
      email: "taken@example.com",
      passwordHash: "x",
      displayName: "Existing",
    });

    await errorCode(registerUser({ ...input, email: "taken@example.com" }, ctx.db));

    const [code] = await ctx.db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, input.inviteCode));

    expect(code.usedAt).toBeNull();
    expect(code.usedBy).toBeNull();
  });

  it("creates no orphan user when the code is lost mid-registration", async () => {
    // The transaction has to roll back the user, not just skip the code.
    await registerUser(input, ctx.db);
    const before = await ctx.db.select().from(users);

    await errorCode(registerUser({ ...input, email: "bob@example.com" }, ctx.db));

    const after = await ctx.db.select().from(users);
    expect(after).toHaveLength(before.length);
  });

  it("lets exactly one of two concurrent registrations win the same code", async () => {
    // The reason consumption is a conditional UPDATE and not a read-then-write.
    const results = await Promise.allSettled([
      registerUser({ ...input, email: "one@example.com" }, ctx.db),
      registerUser({ ...input, email: "two@example.com" }, ctx.db),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const allUsers = await ctx.db.select().from(users);
    expect(allUsers).toHaveLength(1);
  });
});

describe.skipIf(!hasTestDatabase)("loginUser", () => {
  let ctx: TestDb;

  const credentials = { email: input.email, password: input.password };

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE invite_codes, users RESTART IDENTITY CASCADE`;
    await ctx.db.insert(inviteCodes).values({ code: input.inviteCode });
    await registerUser(input, ctx.db);
  });

  it("accepts correct credentials", async () => {
    const user = await loginUser(credentials, ctx.db);
    expect(user.email).toBe(input.email);
    expect(Object.keys(user)).toEqual(["id", "email", "displayName"]);
  });

  it("matches the email case-insensitively", async () => {
    // Registration stores whatever casing was typed; login has to find it
    // regardless, or people are locked out by their own keyboard.
    const user = await loginUser(
      { ...credentials, email: "ALICE@EXAMPLE.COM" },
      ctx.db,
    );
    expect(user.email).toBe(input.email);
  });

  it("rejects a wrong password", async () => {
    const code = await errorCode(
      loginUser({ ...credentials, password: "wrong-password-here" }, ctx.db),
    );
    expect(code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email with the same error", async () => {
    // Identical code and message to a wrong password, so the response cannot be
    // used to discover which addresses are registered.
    const code = await errorCode(
      loginUser({ ...credentials, email: "nobody@example.com" }, ctx.db),
    );
    expect(code).toBe("INVALID_CREDENTIALS");
  });

  it("takes comparable time for an unknown email and a wrong password", async () => {
    // The generic message is worthless if timing gives it away: without the
    // dummy-hash verification, an unknown email returns as soon as the SELECT
    // misses while a known one pays ~50-100ms of Argon2.
    const timeOf = async (email: string, password: string) => {
      const started = performance.now();
      await errorCode(loginUser({ email, password }, ctx.db));
      return performance.now() - started;
    };

    const unknownEmail = await timeOf("nobody@example.com", "whatever-long-pw");
    const wrongPassword = await timeOf(input.email, "whatever-long-pw");

    const ratio =
      Math.max(unknownEmail, wrongPassword) /
      Math.min(unknownEmail, wrongPassword);

    // Generous bound — this asserts "same order of magnitude", not a precise
    // constant, so it doesn't flake on a busy CI runner.
    expect(ratio).toBeLessThan(3);
  });
});

describe.skipIf(!hasTestDatabase)("getUserById", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE invite_codes, users RESTART IDENTITY CASCADE`;
    await ctx.db.insert(inviteCodes).values({ code: input.inviteCode });
  });

  it("returns the user", async () => {
    const created = await registerUser(input, ctx.db);
    const found = await getUserById(created.id, ctx.db);
    expect(found).toEqual(created);
  });

  it("never selects the password hash", async () => {
    // /api/auth/me serialises this straight to the client.
    const created = await registerUser(input, ctx.db);
    const found = await getUserById(created.id, ctx.db);
    expect(Object.keys(found!)).toEqual(["id", "email", "displayName"]);
  });

  it("returns null for an unknown id", async () => {
    const found = await getUserById(
      "00000000-0000-0000-0000-000000000000",
      ctx.db,
    );
    expect(found).toBeNull();
  });
});

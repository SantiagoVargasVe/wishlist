import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  requestPasswordReset,
  resetRequestEmailKey,
} from "./password-reset";

const sendMailMock = vi.fn();
const isMailConfiguredMock = vi.fn(() => true);
vi.mock("../mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mail")>()),
  isMailConfigured: () => isMailConfiguredMock(),
  sendMail: (...args: unknown[]) => sendMailMock(...args),
}));

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
    // Every key the config schema requires, not just the ones this file reads —
    // `getConfig()` validates the whole environment on first access. CI has no
    // .env; locally dotenv fills the gap, which is how a missing key passes on
    // a laptop and fails on a runner.
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.AUTH_SECRET = "x".repeat(48);
    process.env.APP_URL = "http://localhost:3000";
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

    sendMailMock.mockReset().mockResolvedValue(undefined);
    isMailConfiguredMock.mockReturnValue(true);
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

  describe("requestPasswordReset", () => {
    const verify = (id: string) =>
      ctx.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, id));

    const tokenCount = async () =>
      (await ctx.db.select().from(passwordResetTokens)).length;

    it("mints a token and mails a link for a verified address", async () => {
      await verify(userId);

      await requestPasswordReset("ana@example.com", ctx.db);

      expect(await tokenCount()).toBe(1);
      const message = sendMailMock.mock.calls[0][0];
      expect(message.to).toBe("ana@example.com");
      expect(message.text).toContain("http://localhost:3000/reset-password/");
      expect(message.subject).toBe("Restablece tu contraseña");
      // States the expiry and that the link is single-use.
      expect(message.text).toContain("30 minutos");
      expect(message.text).toContain("una vez");
    });

    it("links nowhere but this deployment", async () => {
      await verify(userId);
      await requestPasswordReset("ana@example.com", ctx.db);

      const { html } = sendMailMock.mock.calls[0][0];
      const urls = (html.match(/https?:\/\/[^"'\s<]+/g) ?? []) as string[];
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.every((u) => u.startsWith("http://localhost:3000"))).toBe(true);
    });

    it("carries no account detail beyond the link", async () => {
      // Mail is unencrypted at several hops and sits in a mailbox
      // indefinitely, so it should be worth as little as possible to whoever
      // ends up reading it.
      await verify(userId);
      await requestPasswordReset("ana@example.com", ctx.db);

      const { text, html } = sendMailMock.mock.calls[0][0];
      for (const part of [text, html]) {
        expect(part).not.toContain("Ana");
        expect(part).not.toContain("ana@example.com");
        expect(part).not.toContain("old-hash");
      }
    });

    it("matches the address case-insensitively", async () => {
      await verify(userId);
      await requestPasswordReset("ANA@EXAMPLE.COM", ctx.db);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    });

    it("mints nothing and sends nothing for an unknown address", async () => {
      const logged = vi.spyOn(console, "info").mockImplementation(() => {});

      await expect(
        requestPasswordReset("nobody@example.com", ctx.db),
      ).resolves.toBeUndefined();

      expect(await tokenCount()).toBe(0);
      expect(sendMailMock).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalledTimes(1);
      logged.mockRestore();
    });

    it("mints nothing and sends nothing for an unverified address", async () => {
      // The gate ADR-0013 exists for. A mistyped address at registration means
      // the link goes to whoever owns the typo, and this endpoint is public, so
      // they can ask for one whenever they like.
      const logged = vi.spyOn(console, "info").mockImplementation(() => {});

      await expect(
        requestPasswordReset("ana@example.com", ctx.db),
      ).resolves.toBeUndefined();

      expect(await tokenCount()).toBe(0);
      expect(sendMailMock).not.toHaveBeenCalled();
      logged.mockRestore();
    });

    it("logs the three silent cases distinctly", async () => {
      // Per ADR-0013 the server log is the *only* way to tell them apart, so a
      // shared generic line would defeat the whole diagnostic story.
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      await requestPasswordReset("nobody@example.com", ctx.db);
      const unknown = info.mock.calls.at(-1)!.join(" ");

      await requestPasswordReset("ana@example.com", ctx.db);
      const unverified = info.mock.calls.at(-1)!.join(" ");

      await verify(userId);
      sendMailMock.mockRejectedValue(new Error("535 auth failed"));
      await requestPasswordReset("ana@example.com", ctx.db);
      const failed = error.mock.calls.at(-1)!.join(" ");

      expect(new Set([unknown, unverified, failed]).size).toBe(3);
      expect(unverified).toMatch(/unverified/i);
      expect(failed).toMatch(/failed/i);

      info.mockRestore();
      error.mockRestore();
    });

    it("still resolves when the send fails, and keeps the token", async () => {
      // Swallowing is correct here: surfacing it would make the response differ
      // between "registered, provider broken" and "unknown", handing out an
      // enumeration oracle during an outage.
      await verify(userId);
      sendMailMock.mockRejectedValue(new Error("535 auth failed"));
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        requestPasswordReset("ana@example.com", ctx.db),
      ).resolves.toBeUndefined();

      expect(await tokenCount()).toBe(1);
      const line = logged.mock.calls.at(-1)!.join(" ");
      expect(line).toContain("example.com");
      expect(line).not.toContain("ana@example.com");
      logged.mockRestore();
    });

    it("mints a token but sends nothing when mail is unconfigured", async () => {
      await verify(userId);
      isMailConfiguredMock.mockReturnValue(false);
      const logged = vi.spyOn(console, "warn").mockImplementation(() => {});

      await requestPasswordReset("ana@example.com", ctx.db);

      expect(await tokenCount()).toBe(1);
      expect(sendMailMock).not.toHaveBeenCalled();
      // The log names the supported path in that configuration.
      expect(logged.mock.calls.at(-1)!.join(" ")).toContain("reset-link");
      logged.mockRestore();
    });
  });

  describe("resetRequestEmailKey", () => {
    it("is case-insensitive, matching citext", () => {
      // Otherwise the per-address rate limit is bypassed by changing the
      // capitalisation, while still hitting the same account.
      expect(resetRequestEmailKey("Ana@Example.com")).toBe(
        resetRequestEmailKey("ana@example.com  "),
      );
    });

    it("does not store the address in plain text", () => {
      const key = resetRequestEmailKey("ana@example.com");
      expect(key).not.toContain("ana");
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it("separates different addresses", () => {
      expect(resetRequestEmailKey("ana@example.com")).not.toBe(
        resetRequestEmailKey("beto@example.com"),
      );
    });
  });
});

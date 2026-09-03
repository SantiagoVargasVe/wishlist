import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { passwordResetTokens, users } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { DomainError } from "../errors";
import {
  VERIFICATION_TOKEN_TTL_MS,
  consumeVerificationToken,
  mintVerificationToken,
  sendVerificationEmail,
} from "./email-verification";
import { consumeResetToken, mintResetToken } from "./password-reset";

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

describe.skipIf(!hasTestDatabase)("email verification", () => {
  let ctx: TestDb;
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    // Every key the config schema requires, not just the ones this file reads.
    // `getConfig()` validates the whole environment on first access, so a
    // missing DATABASE_URL throws inside `sendVerificationEmail` — which
    // swallows it, sends nothing, and fails these assertions with no clue why.
    // CI has no .env; locally dotenv fills the gap, which is exactly how this
    // passes on a laptop and fails on a runner.
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.AUTH_SECRET = "x".repeat(48);
    process.env.APP_URL = "http://localhost:3000";
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE password_reset_tokens, users RESTART IDENTITY CASCADE`;
    const [user] = await ctx.db
      .insert(users)
      .values({ email: "ana@example.com", passwordHash: "old-hash", displayName: "Ana" })
      .returning();
    userId = user.id;

    sendMailMock.mockReset().mockResolvedValue(undefined);
    isMailConfiguredMock.mockReturnValue(true);
  });

  const readUser = async () => {
    const [row] = await ctx.db.select().from(users).where(eq(users.id, userId));
    return row;
  };

  describe("mintVerificationToken", () => {
    it("stores an email_verify token, hashed", async () => {
      const { token } = await mintVerificationToken(userId, ctx.db);

      const [row] = await ctx.db.select().from(passwordResetTokens);
      expect(row.purpose).toBe("email_verify");
      expect(row.tokenHash).not.toBe(token);
    });

    it("expires in 24 hours, far beyond a reset link's 30 minutes", async () => {
      // A verification mail sitting in an inbox overnight is normal. A reset
      // link doing the same is a live credential nobody is watching.
      const { expiresAt } = await mintVerificationToken(userId, ctx.db);
      const drift = Math.abs(
        expiresAt.getTime() - (Date.now() + VERIFICATION_TOKEN_TTL_MS),
      );
      expect(drift).toBeLessThan(5_000);
      expect(VERIFICATION_TOKEN_TTL_MS).toBeGreaterThan(60 * 60 * 1000);
    });

    it("replaces the previous verification token", async () => {
      // What "resend" has to mean to someone who clicks it twice and then
      // reaches for the older mail.
      const first = await mintVerificationToken(userId, ctx.db);
      const second = await mintVerificationToken(userId, ctx.db);

      expect(await ctx.db.select().from(passwordResetTokens)).toHaveLength(1);
      expect(await errorCode(consumeVerificationToken(first.token, ctx.db))).toBe(
        "VERIFICATION_TOKEN_INVALID",
      );
      expect(await errorCode(consumeVerificationToken(second.token, ctx.db))).toBeUndefined();
    });

    it("leaves an outstanding reset token alone", async () => {
      // Separate lifecycles that happen to share a table.
      const reset = await mintResetToken(userId, ctx.db);
      await mintVerificationToken(userId, ctx.db);

      expect(await errorCode(consumeResetToken(reset.token, "clave-nueva-1", ctx.db)))
        .toBeUndefined();
    });
  });

  describe("consumeVerificationToken", () => {
    it("marks the address verified", async () => {
      expect((await readUser()).emailVerifiedAt).toBeNull();

      const { token } = await mintVerificationToken(userId, ctx.db);
      const result = await consumeVerificationToken(token, ctx.db);

      expect(result.userId).toBe(userId);
      expect((await readUser()).emailVerifiedAt).toBeInstanceOf(Date);
    });

    it("rejects a second use of the same token", async () => {
      const { token } = await mintVerificationToken(userId, ctx.db);
      await consumeVerificationToken(token, ctx.db);

      expect(await errorCode(consumeVerificationToken(token, ctx.db))).toBe(
        "VERIFICATION_TOKEN_INVALID",
      );
    });

    it("rejects an expired token", async () => {
      const { token } = await mintVerificationToken(userId, ctx.db);
      await ctx.sql`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`;

      expect(await errorCode(consumeVerificationToken(token, ctx.db))).toBe(
        "VERIFICATION_TOKEN_INVALID",
      );
    });

    it("rejects an unknown token with the same error", async () => {
      expect(await errorCode(consumeVerificationToken("not-a-token", ctx.db))).toBe(
        "VERIFICATION_TOKEN_INVALID",
      );
    });
  });

  describe("purposes do not cross", () => {
    // The failure mode the shared table introduces, and the only one that would
    // make ADR-0013's one-table decision wrong if unhandled. Tested in both
    // directions because they fail for the same reason and could each regress
    // alone.

    it("refuses a password_reset token at the verify path", async () => {
      const { token } = await mintResetToken(userId, ctx.db);

      expect(await errorCode(consumeVerificationToken(token, ctx.db))).toBe(
        "VERIFICATION_TOKEN_INVALID",
      );
      // And it is not silently spent by the attempt.
      expect((await readUser()).emailVerifiedAt).toBeNull();
      expect(await errorCode(consumeResetToken(token, "clave-nueva-1", ctx.db)))
        .toBeUndefined();
    });

    it("refuses an email_verify token at the reset path", async () => {
      // The dangerous direction: a verification mail goes to an address nobody
      // has confirmed, so this token must never be able to set a password.
      const { token } = await mintVerificationToken(userId, ctx.db);
      const before = (await readUser()).passwordHash;

      expect(await errorCode(consumeResetToken(token, "clave-del-atacante", ctx.db))).toBe(
        "RESET_TOKEN_INVALID",
      );
      expect((await readUser()).passwordHash).toBe(before);
      // Still usable for what it was actually minted for.
      expect(await errorCode(consumeVerificationToken(token, ctx.db))).toBeUndefined();
    });
  });

  describe("sendVerificationEmail", () => {
    const recipient = () => ({ id: userId, email: "ana@example.com", displayName: "Ana" });

    it("mails a link built from APP_URL", async () => {
      await sendVerificationEmail(recipient(), ctx.db);

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const message = sendMailMock.mock.calls[0][0];
      expect(message.to).toBe("ana@example.com");
      expect(message.text).toContain("http://localhost:3000/verify-email/");
      expect(message.html).toContain("http://localhost:3000/verify-email/");
      // Spanish-first, and it states what verifying actually buys.
      expect(message.subject).toBe("Confirma tu correo");
      expect(message.text).toContain("recuperar tu contraseña");
    });

    it("links nowhere but this deployment", async () => {
      // The URL is a live credential; every third-party request a mail client
      // makes is one more party that learns it exists.
      await sendVerificationEmail(recipient(), ctx.db);

      const { html } = sendMailMock.mock.calls[0][0];
      const urls = html.match(/https?:\/\/[^"'\s<]+/g) ?? [];
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.every((u: string) => u.startsWith("http://localhost:3000"))).toBe(true);
    });

    it("mints nothing and sends nothing when mail is unconfigured", async () => {
      isMailConfiguredMock.mockReturnValue(false);

      await sendVerificationEmail(recipient(), ctx.db);

      expect(sendMailMock).not.toHaveBeenCalled();
      expect(await ctx.db.select().from(passwordResetTokens)).toHaveLength(0);
    });

    it("swallows a send failure, logging the domain only", async () => {
      // A mail problem must never become an error a newly registered user sees.
      sendMailMock.mockRejectedValue(new Error("535 auth failed"));
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(sendVerificationEmail(recipient(), ctx.db)).resolves.toBeUndefined();

      const line = logged.mock.calls[0].join(" ");
      expect(line).toContain("example.com");
      expect(line).not.toContain("ana@example.com");
      logged.mockRestore();
    });
  });
});

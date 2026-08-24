import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { inviteCodes, users } from "./schema";
import {
  createTestDb,
  hasTestDatabase,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
  type TestDb,
} from "./test-support";

const alice = {
  email: "alice@example.com",
  passwordHash: "not-a-real-hash",
  displayName: "Alice",
};

describe.skipIf(!hasTestDatabase)("schema", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE invite_codes, users RESTART IDENTITY CASCADE`;
  });

  describe("users.email", () => {
    it("round-trips a normal address", async () => {
      const [row] = await ctx.db.insert(users).values(alice).returning();
      expect(row.email).toBe("alice@example.com");
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.createdAt).toBeInstanceOf(Date);
    });

    it("rejects a duplicate that differs only in case", async () => {
      // The whole reason email is citext rather than text. With plain text this
      // insert succeeds and the account is silently duplicated.
      await ctx.db.insert(users).values(alice);

      const code = await pgErrorCode(
        ctx.db.insert(users).values({ ...alice, email: "ALICE@example.com" }),
      );
      expect(code).toBe(PG_UNIQUE_VIOLATION);
    });

    it("matches case-insensitively on lookup", async () => {
      await ctx.db.insert(users).values(alice);

      const found = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, "AlIcE@ExAmPlE.CoM"));

      expect(found).toHaveLength(1);
    });
  });

  describe("invite_codes", () => {
    it("stores a code with no creator, for bootstrap", async () => {
      // The first code has to be mintable before any user exists.
      const [row] = await ctx.db
        .insert(inviteCodes)
        .values({ code: "BOOTSTRAP1" })
        .returning();

      expect(row.createdBy).toBeNull();
      expect(row.usedBy).toBeNull();
      expect(row.usedAt).toBeNull();
    });

    it("distinguishes an unused code from a consumed one", async () => {
      const [user] = await ctx.db.insert(users).values(alice).returning();
      await ctx.db.insert(inviteCodes).values([
        { code: "UNUSED" },
        { code: "SPENT", usedBy: user.id, usedAt: new Date() },
      ]);

      const unused = await ctx.db
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, "UNUSED"));
      const spent = await ctx.db
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, "SPENT"));

      expect(unused[0].usedAt).toBeNull();
      expect(spent[0].usedAt).toBeInstanceOf(Date);
      expect(spent[0].usedBy).toBe(user.id);
    });

    it("rejects a used_by that points at no user", async () => {
      const code = await pgErrorCode(
        ctx.db.insert(inviteCodes).values({
          code: "ORPHAN",
          usedBy: "00000000-0000-0000-0000-000000000000",
        }),
      );
      expect(code).toBe(PG_FOREIGN_KEY_VIOLATION);
    });

    it("rejects a duplicate code", async () => {
      await ctx.db.insert(inviteCodes).values({ code: "SAME" });
      const code = await pgErrorCode(
        ctx.db.insert(inviteCodes).values({ code: "SAME" }),
      );
      expect(code).toBe(PG_UNIQUE_VIOLATION);
    });

    it("keeps the code when its creator is deleted", async () => {
      // ON DELETE SET NULL, not CASCADE: deleting a user shouldn't silently
      // invalidate invites they handed out.
      const [user] = await ctx.db.insert(users).values(alice).returning();
      await ctx.db
        .insert(inviteCodes)
        .values({ code: "SURVIVES", createdBy: user.id });

      await ctx.db.delete(users).where(eq(users.id, user.id));

      const [row] = await ctx.db
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, "SURVIVES"));

      expect(row).toBeDefined();
      expect(row.createdBy).toBeNull();
    });
  });
});

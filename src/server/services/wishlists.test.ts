import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { users, wishlists } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { createDefaultWishlist } from "./wishlists";

describe.skipIf(!hasTestDatabase)("createDefaultWishlist", () => {
  let ctx: TestDb;
  let ownerId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE wishlists, users RESTART IDENTITY CASCADE`;
    const [user] = await ctx.db
      .insert(users)
      .values({
        email: "alice@example.com",
        passwordHash: "x",
        displayName: "Alice",
      })
      .returning();
    ownerId = user.id;
  });

  it("creates a list titled Wishlist, marked default", async () => {
    const wishlist = await createDefaultWishlist(ownerId, ctx.db);

    expect(wishlist.title).toBe("Wishlist");
    expect(wishlist.isDefault).toBe(true);
  });

  it("generates a slug from the same alphabet as share links", async () => {
    const wishlist = await createDefaultWishlist(ownerId, ctx.db);
    expect(wishlist.slug).toMatch(/^[a-z0-9]{10}$/);
  });

  it("generates a different slug on each call", async () => {
    const first = await createDefaultWishlist(ownerId, ctx.db);

    // Clear the partial-unique-default index so a second insert is legal —
    // this test is only checking slug variation, not the one-default rule.
    await ctx.sql`UPDATE wishlists SET is_default = false WHERE id = ${first.id}`;

    const second = await createDefaultWishlist(ownerId, ctx.db);
    expect(second.slug).not.toBe(first.slug);
  });

  it("rolls back inside a failed transaction, same as any other insert", async () => {
    // This is what makes it safe for registerUser (T011) to call this and
    // then throw later in the same transaction: the wishlist has to disappear
    // along with everything else.
    await expect(
      ctx.db.transaction(async (tx) => {
        await createDefaultWishlist(ownerId, tx);
        throw new Error("simulated failure after the insert");
      }),
    ).rejects.toThrow("simulated failure");

    const rows = await ctx.db
      .select()
      .from(wishlists)
      .where(eq(wishlists.ownerId, ownerId));

    expect(rows).toHaveLength(0);
  });
});

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { items, users, wishlistItems, wishlists } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { DomainError } from "../errors";
import {
  createDefaultWishlist,
  createWishlist,
  deleteWishlist,
  updateWishlist,
} from "./wishlists";

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
    await ctx.sql`TRUNCATE wishlist_items, items, wishlists, users RESTART IDENTITY CASCADE`;
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
    expect(wishlist.hideClaimsFromOwner).toBe(true);
  });

  it("generates a slug from the same alphabet as share links", async () => {
    const wishlist = await createDefaultWishlist(ownerId, ctx.db);
    expect(wishlist.slug).toMatch(/^[a-z0-9]{10}$/);
  });

  it("generates a different slug on each call", async () => {
    const first = await createDefaultWishlist(ownerId, ctx.db);

    // Clear the partial-unique-default index so a second insert is legal —
    // this test only checks slug variation, not the one-default rule.
    await ctx.sql`UPDATE wishlists SET is_default = false WHERE id = ${first.id}`;

    const second = await createDefaultWishlist(ownerId, ctx.db);
    expect(second.slug).not.toBe(first.slug);
  });

  it("rolls back inside a failed transaction, same as any other insert", async () => {
    // What makes it safe for registerUser (T011) to call this and then throw
    // later in the same transaction: the wishlist has to disappear too.
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

describe.skipIf(!hasTestDatabase)("wishlist CRUD", () => {
  let ctx: TestDb;
  let ownerId: string;
  let otherId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE wishlist_items, items, wishlists, users RESTART IDENTITY CASCADE`;
    const created = await ctx.db
      .insert(users)
      .values([
        { email: "owner@example.com", passwordHash: "x", displayName: "Owner" },
        { email: "other@example.com", passwordHash: "x", displayName: "Other" },
      ])
      .returning();
    ownerId = created[0].id;
    otherId = created[1].id;
  });

  describe("createWishlist", () => {
    it("creates a non-default list with the given title", async () => {
      const wishlist = await createWishlist(
        ownerId,
        { title: "Birthday" },
        ctx.db,
      );
      expect(wishlist.title).toBe("Birthday");
      expect(wishlist.isDefault).toBe(false);
    });

    it("does not collide with an existing default list for the same owner", async () => {
      await createDefaultWishlist(ownerId, ctx.db);
      // isDefault: false means this never touches the partial unique index
      // that only covers rows where is_default is true.
      const code = await errorCode(
        createWishlist(ownerId, { title: "Second list" }, ctx.db),
      );
      expect(code).toBeUndefined();
    });
  });

  describe("updateWishlist", () => {
    it("renames a list", async () => {
      const created = await createWishlist(ownerId, { title: "Old" }, ctx.db);
      const updated = await updateWishlist(
        created.id,
        ownerId,
        { title: "New" },
        ctx.db,
      );
      expect(updated.title).toBe("New");
    });

    it("renames the default list — only deletion is blocked", async () => {
      const created = await createDefaultWishlist(ownerId, ctx.db);
      const updated = await updateWishlist(
        created.id,
        ownerId,
        { title: "Renamed default" },
        ctx.db,
      );
      expect(updated.title).toBe("Renamed default");
      expect(updated.isDefault).toBe(true);
    });

    it("toggles hideClaimsFromOwner independently of title", async () => {
      const created = await createWishlist(ownerId, { title: "A" }, ctx.db);
      const updated = await updateWishlist(
        created.id,
        ownerId,
        { hideClaimsFromOwner: false },
        ctx.db,
      );
      expect(updated.hideClaimsFromOwner).toBe(false);
      expect(updated.title).toBe("A");
    });

    it("rejects an update from a non-owner", async () => {
      const created = await createWishlist(ownerId, { title: "A" }, ctx.db);
      const code = await errorCode(
        updateWishlist(created.id, otherId, { title: "Hijacked" }, ctx.db),
      );
      expect(code).toBe("FORBIDDEN");

      // And the title must be genuinely unchanged.
      const [row] = await ctx.db
        .select()
        .from(wishlists)
        .where(eq(wishlists.id, created.id));
      expect(row.title).toBe("A");
    });

    it("returns not-found for an unknown id", async () => {
      const code = await errorCode(
        updateWishlist(
          "00000000-0000-0000-0000-000000000000",
          ownerId,
          { title: "X" },
          ctx.db,
        ),
      );
      expect(code).toBe("WISHLIST_NOT_FOUND");
    });
  });

  describe("deleteWishlist", () => {
    it("deletes a list with no items", async () => {
      const created = await createWishlist(ownerId, { title: "Empty" }, ctx.db);
      await deleteWishlist(created.id, ownerId, { deleteOrphans: false }, ctx.db);

      const rows = await ctx.db
        .select()
        .from(wishlists)
        .where(eq(wishlists.id, created.id));
      expect(rows).toHaveLength(0);
    });

    it("blocks deleting the default list, with or without the flag", async () => {
      const created = await createDefaultWishlist(ownerId, ctx.db);

      const withoutFlag = await errorCode(
        deleteWishlist(created.id, ownerId, { deleteOrphans: false }, ctx.db),
      );
      const withFlag = await errorCode(
        deleteWishlist(created.id, ownerId, { deleteOrphans: true }, ctx.db),
      );

      expect(withoutFlag).toBe("DEFAULT_WISHLIST_UNDELETABLE");
      expect(withFlag).toBe("DEFAULT_WISHLIST_UNDELETABLE");

      const rows = await ctx.db
        .select()
        .from(wishlists)
        .where(eq(wishlists.id, created.id));
      expect(rows).toHaveLength(1);
    });

    it("rejects deletion by a non-owner", async () => {
      const created = await createWishlist(ownerId, { title: "A" }, ctx.db);
      const code = await errorCode(
        deleteWishlist(created.id, otherId, { deleteOrphans: false }, ctx.db),
      );
      expect(code).toBe("FORBIDDEN");
    });

    it("returns not-found for an unknown id", async () => {
      const code = await errorCode(
        deleteWishlist(
          "00000000-0000-0000-0000-000000000000",
          ownerId,
          { deleteOrphans: false },
          ctx.db,
        ),
      );
      expect(code).toBe("WISHLIST_NOT_FOUND");
    });

    it("succeeds with no flag when every item also lives elsewhere", async () => {
      const listA = await createWishlist(ownerId, { title: "A" }, ctx.db);
      const listB = await createWishlist(ownerId, { title: "B" }, ctx.db);
      const [item] = await ctx.db
        .insert(items)
        .values({ ownerId, url: "https://example.com", title: "Shared item" })
        .returning();

      await ctx.db.insert(wishlistItems).values([
        { wishlistId: listA.id, itemId: item.id },
        { wishlistId: listB.id, itemId: item.id },
      ]);

      // No confirmation needed: deleting A leaves the item live in B.
      await deleteWishlist(listA.id, ownerId, { deleteOrphans: false }, ctx.db);

      const [row] = await ctx.db.select().from(items).where(eq(items.id, item.id));
      expect(row.deletedAt).toBeNull();

      const remainingLinks = await ctx.db
        .select()
        .from(wishlistItems)
        .where(eq(wishlistItems.itemId, item.id));
      expect(remainingLinks).toHaveLength(1);
      expect(remainingLinks[0].wishlistId).toBe(listB.id);
    });

    it("requires confirmation before deleting items that live only here", async () => {
      const list = await createWishlist(ownerId, { title: "Solo" }, ctx.db);
      const [item] = await ctx.db
        .insert(items)
        .values({ ownerId, url: "https://example.com", title: "Lonely item" })
        .returning();
      await ctx.db.insert(wishlistItems).values({ wishlistId: list.id, itemId: item.id });

      let thrown: unknown;
      try {
        await deleteWishlist(list.id, ownerId, { deleteOrphans: false }, ctx.db);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(DomainError);
      const error = thrown as DomainError;
      expect(error.code).toBe("CONFIRM_DELETE_ORPHANS");
      expect(error.details?.orphanItems).toEqual([
        { id: item.id, title: "Lonely item" },
      ]);

      // Nothing touched: the whole point of asking first.
      const listRow = await ctx.db
        .select()
        .from(wishlists)
        .where(eq(wishlists.id, list.id));
      expect(listRow).toHaveLength(1);

      const itemRow = await ctx.db.select().from(items).where(eq(items.id, item.id));
      expect(itemRow[0].deletedAt).toBeNull();
    });

    it("soft-deletes orphan items and removes the list when confirmed", async () => {
      const list = await createWishlist(ownerId, { title: "Solo" }, ctx.db);
      const [item] = await ctx.db
        .insert(items)
        .values({ ownerId, url: "https://example.com", title: "Lonely item" })
        .returning();
      await ctx.db.insert(wishlistItems).values({ wishlistId: list.id, itemId: item.id });

      await deleteWishlist(list.id, ownerId, { deleteOrphans: true }, ctx.db);

      const listRow = await ctx.db
        .select()
        .from(wishlists)
        .where(eq(wishlists.id, list.id));
      expect(listRow).toHaveLength(0);

      const itemRow = await ctx.db.select().from(items).where(eq(items.id, item.id));
      expect(itemRow[0].deletedAt).toBeInstanceOf(Date);
    });

    it("only orphans items that are actually solo, in a mixed list", async () => {
      const list = await createWishlist(ownerId, { title: "Mixed" }, ctx.db);
      const other = await createWishlist(ownerId, { title: "Other" }, ctx.db);

      const created = await ctx.db
        .insert(items)
        .values([
          { ownerId, url: "https://example.com/1", title: "Solo item" },
          { ownerId, url: "https://example.com/2", title: "Shared item" },
        ])
        .returning();
      const [solo, shared] = created;

      await ctx.db.insert(wishlistItems).values([
        { wishlistId: list.id, itemId: solo.id },
        { wishlistId: list.id, itemId: shared.id },
        { wishlistId: other.id, itemId: shared.id },
      ]);

      const code = await errorCode(
        deleteWishlist(list.id, ownerId, { deleteOrphans: false }, ctx.db),
      );
      expect(code).toBe("CONFIRM_DELETE_ORPHANS");

      await deleteWishlist(list.id, ownerId, { deleteOrphans: true }, ctx.db);

      const soloRow = await ctx.db.select().from(items).where(eq(items.id, solo.id));
      const sharedRow = await ctx.db
        .select()
        .from(items)
        .where(eq(items.id, shared.id));

      expect(soloRow[0].deletedAt).toBeInstanceOf(Date);
      expect(sharedRow[0].deletedAt).toBeNull();
    });
  });
});

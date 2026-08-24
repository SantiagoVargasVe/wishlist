import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { items, itemClaims, users, wishlistItems, wishlists } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { DomainError } from "../errors";
import { claimItem, unclaimItem } from "./claims";

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe.skipIf(!hasTestDatabase)("claims", () => {
  let ctx: TestDb;
  let ownerId: string;
  let slug: string;
  let otherSlug: string;
  let itemId: string;
  let deletedItemId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE item_claims, wishlist_items, items, wishlists, users RESTART IDENTITY CASCADE`;

    const [owner] = await ctx.db
      .insert(users)
      .values({ email: "owner@example.com", passwordHash: "x", displayName: "Owner" })
      .returning();
    ownerId = owner.id;

    const createdLists = await ctx.db
      .insert(wishlists)
      .values([
        { ownerId, title: "List", slug: "listaaaaaa" },
        { ownerId, title: "Other list", slug: "otherlist1" },
      ])
      .returning();
    slug = createdLists[0].slug;
    otherSlug = createdLists[1].slug;

    const createdItems = await ctx.db
      .insert(items)
      .values([
        { ownerId, url: "https://example.com/a", title: "Item A" },
        { ownerId, url: "https://example.com/b", title: "Deleted item", deletedAt: new Date() },
      ])
      .returning();
    itemId = createdItems[0].id;
    deletedItemId = createdItems[1].id;

    await ctx.db.insert(wishlistItems).values([
      { wishlistId: createdLists[0].id, itemId },
      { wishlistId: createdLists[0].id, itemId: deletedItemId },
    ]);
  });

  describe("claimItem", () => {
    it("claims a live item that belongs to the wishlist behind the slug", async () => {
      const result = await claimItem(slug, itemId, null, ctx.db);

      expect(result.claimToken).toEqual(expect.any(String));
      expect(result.claimToken.length).toBeGreaterThanOrEqual(20);

      const [row] = await ctx.db
        .select()
        .from(itemClaims)
        .where(eq(itemClaims.itemId, itemId));
      expect(row.claimToken).toBe(result.claimToken);
      expect(row.claimedByUserId).toBeNull();
    });

    it("records the claimer's user id when logged in", async () => {
      await claimItem(slug, itemId, ownerId, ctx.db);

      const [row] = await ctx.db.select().from(itemClaims).where(eq(itemClaims.itemId, itemId));
      expect(row.claimedByUserId).toBe(ownerId);
    });

    it("404s for an item that isn't in the wishlist behind that slug", async () => {
      expect(await errorCode(claimItem(otherSlug, itemId, null, ctx.db))).toBe("ITEM_NOT_FOUND");
    });

    it("404s for a soft-deleted item, even if it's still filed in the list", async () => {
      expect(await errorCode(claimItem(slug, deletedItemId, null, ctx.db))).toBe(
        "ITEM_NOT_FOUND",
      );
    });

    it("409s a second claim on an already-claimed item", async () => {
      await claimItem(slug, itemId, null, ctx.db);
      expect(await errorCode(claimItem(slug, itemId, null, ctx.db))).toBe("ITEM_ALREADY_CLAIMED");
    });

    it("lets exactly one of two simultaneous claims win — the race the feature exists to prevent", async () => {
      const [a, b] = await Promise.allSettled([
        claimItem(slug, itemId, null, ctx.db),
        claimItem(slug, itemId, null, ctx.db),
      ]);

      const outcomes = [a, b].map((r) => r.status);
      expect(outcomes.filter((s) => s === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((s) => s === "rejected")).toHaveLength(1);

      const rejected = [a, b].find((r) => r.status === "rejected");
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(DomainError);
        expect((rejected.reason as DomainError).code).toBe("ITEM_ALREADY_CLAIMED");
      }
    });
  });

  describe("unclaimItem", () => {
    it("removes the claim when the token matches", async () => {
      const { claimToken } = await claimItem(slug, itemId, null, ctx.db);
      await unclaimItem(slug, itemId, claimToken, null, ctx.db);

      const rows = await ctx.db.select().from(itemClaims).where(eq(itemClaims.itemId, itemId));
      expect(rows).toHaveLength(0);
    });

    it("removes the claim for the original claimer even with the wrong token", async () => {
      await claimItem(slug, itemId, ownerId, ctx.db);
      await unclaimItem(slug, itemId, "wrong-token", ownerId, ctx.db);

      const rows = await ctx.db.select().from(itemClaims).where(eq(itemClaims.itemId, itemId));
      expect(rows).toHaveLength(0);
    });

    it("404s when the item was never claimed", async () => {
      expect(await errorCode(unclaimItem(slug, itemId, "anything", null, ctx.db))).toBe(
        "CLAIM_NOT_FOUND",
      );
    });

    it("403s a mismatched token from an anonymous caller", async () => {
      await claimItem(slug, itemId, null, ctx.db);
      expect(await errorCode(unclaimItem(slug, itemId, "wrong-token", null, ctx.db))).toBe(
        "FORBIDDEN",
      );
    });

    it("403s a different logged-in user, even with no token", async () => {
      const [otherUser] = await ctx.db
        .insert(users)
        .values({ email: "other@example.com", passwordHash: "x", displayName: "Other" })
        .returning();

      await claimItem(slug, itemId, ownerId, ctx.db);
      expect(await errorCode(unclaimItem(slug, itemId, "wrong-token", otherUser.id, ctx.db))).toBe(
        "FORBIDDEN",
      );
    });
  });
});

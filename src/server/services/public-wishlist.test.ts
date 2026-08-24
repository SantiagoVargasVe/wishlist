import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { users } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { DomainError } from "../errors";
import { claimItem } from "./claims";
import { createItem, deleteItem } from "./items";
import { getPublicWishlist } from "./public-wishlist";
import { createDefaultWishlist } from "./wishlists";

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe.skipIf(!hasTestDatabase)("getPublicWishlist", () => {
  let ctx: TestDb;
  let ownerId: string;

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
      .values({ email: "owner@example.com", passwordHash: "x", displayName: "Ana" })
      .returning();
    ownerId = owner.id;
  });

  it("throws WISHLIST_NOT_FOUND for a slug that doesn't exist", async () => {
    expect(await errorCode(getPublicWishlist("nope-nope-no", ctx.db))).toBe("WISHLIST_NOT_FOUND");
  });

  it("resolves an empty wishlist with items: [], not a 404", async () => {
    const list = await createDefaultWishlist(ownerId, ctx.db);

    const result = await getPublicWishlist(list.slug, ctx.db);

    expect(result.items).toEqual([]);
  });

  it("exposes the owner's display name and nothing else about them", async () => {
    const list = await createDefaultWishlist(ownerId, ctx.db);

    const result = await getPublicWishlist(list.slug, ctx.db);

    expect(result.ownerDisplayName).toBe("Ana");
    expect(result).not.toHaveProperty("ownerId");
    expect(result).not.toHaveProperty("ownerEmail");
  });

  it("reports claimed: false for an unclaimed item", async () => {
    const list = await createDefaultWishlist(ownerId, ctx.db);
    await createItem(
      ownerId,
      { url: "https://example.com/p", title: "Headphones", wishlistIds: [list.id] },
      ctx.db,
    );

    const result = await getPublicWishlist(list.slug, ctx.db);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].claimed).toBe(false);
  });

  it("reports claimed: true with no claimer identity anywhere in the result", async () => {
    const list = await createDefaultWishlist(ownerId, ctx.db);
    const item = await createItem(
      ownerId,
      { url: "https://example.com/p", title: "Headphones", wishlistIds: [list.id] },
      ctx.db,
    );
    await claimItem(list.slug, item.id, ownerId, ctx.db);

    const result = await getPublicWishlist(list.slug, ctx.db);
    const json = JSON.stringify(result);

    expect(result.items[0].claimed).toBe(true);
    expect(json).not.toContain(ownerId);
    expect(json.toLowerCase()).not.toContain("token");
  });

  it("never returns a soft-deleted item", async () => {
    const list = await createDefaultWishlist(ownerId, ctx.db);
    const item = await createItem(
      ownerId,
      { url: "https://example.com/p", title: "Gone soon", wishlistIds: [list.id] },
      ctx.db,
    );
    await deleteItem(item.id, ownerId, ctx.db);

    const result = await getPublicWishlist(list.slug, ctx.db);

    expect(result.items).toEqual([]);
  });
});

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { items, users, wishlistItems, wishlists } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { DomainError } from "../errors";
import { createItem, deleteItem, updateItem } from "./items";

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

describe.skipIf(!hasTestDatabase)("item CRUD", () => {
  let ctx: TestDb;
  let ownerId: string;
  let otherId: string;
  let listA: string;
  let listB: string;
  let otherList: string;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE wishlist_items, items, wishlists, users RESTART IDENTITY CASCADE`;

    const createdUsers = await ctx.db
      .insert(users)
      .values([
        { email: "owner@example.com", passwordHash: "x", displayName: "Owner" },
        { email: "other@example.com", passwordHash: "x", displayName: "Other" },
      ])
      .returning();
    ownerId = createdUsers[0].id;
    otherId = createdUsers[1].id;

    const createdLists = await ctx.db
      .insert(wishlists)
      .values([
        { ownerId, title: "List A", slug: "listaaaaaa" },
        { ownerId, title: "List B", slug: "listbbbbbb" },
        { ownerId: otherId, title: "Other's list", slug: "otherlist1" },
      ])
      .returning();
    listA = createdLists[0].id;
    listB = createdLists[1].id;
    otherList = createdLists[2].id;
  });

  describe("createItem", () => {
    it("creates an item and files it into the given list", async () => {
      const item = await createItem(
        ownerId,
        { url: "https://example.com/p", title: "Headphones", wishlistIds: [listA] },
        ctx.db,
      );

      expect(item.title).toBe("Headphones");
      expect(item.ogStatus).toBe("pending");
      expect(item.priceAmount).toBeNull();

      const links = await ctx.db
        .select()
        .from(wishlistItems)
        .where(eq(wishlistItems.itemId, item.id));
      expect(links).toHaveLength(1);
      expect(links[0].wishlistId).toBe(listA);
    });

    it("files one item into multiple owned lists at once", async () => {
      const item = await createItem(
        ownerId,
        { url: "https://example.com/p", title: "Headphones", wishlistIds: [listA, listB] },
        ctx.db,
      );

      const links = await ctx.db
        .select()
        .from(wishlistItems)
        .where(eq(wishlistItems.itemId, item.id));
      expect(links.map((l) => l.wishlistId).sort()).toEqual([listA, listB].sort());
    });

    it("rejects a list owned by someone else", async () => {
      const code = await errorCode(
        createItem(
          ownerId,
          { url: "https://example.com/p", title: "X", wishlistIds: [otherList] },
          ctx.db,
        ),
      );
      expect(code).toBe("VALIDATION_FAILED");

      // Nothing should have been created.
      const rows = await ctx.db.select().from(items);
      expect(rows).toHaveLength(0);
    });

    it("rejects a wishlist id that doesn't exist", async () => {
      const code = await errorCode(
        createItem(
          ownerId,
          {
            url: "https://example.com/p",
            title: "X",
            wishlistIds: ["00000000-0000-0000-0000-000000000000"],
          },
          ctx.db,
        ),
      );
      expect(code).toBe("VALIDATION_FAILED");
    });

    it("rejects the whole request if any one of several lists is invalid", async () => {
      const code = await errorCode(
        createItem(
          ownerId,
          { url: "https://example.com/p", title: "X", wishlistIds: [listA, otherList] },
          ctx.db,
        ),
      );
      expect(code).toBe("VALIDATION_FAILED");

      const rows = await ctx.db.select().from(items);
      expect(rows).toHaveLength(0);
    });

    it("computes the USD snapshot for a COP price", async () => {
      const item = await createItem(
        ownerId,
        {
          url: "https://example.com/p",
          title: "X",
          priceAmount: "410000",
          priceCurrency: "COP",
          wishlistIds: [listA],
        },
        ctx.db,
      );

      expect(item.priceAmount).toBe("410000.00");
      expect(item.priceCurrency).toBe("COP");
      // Default test rate is FX_COP_PER_USD=4100 (see .env.example / test env).
      expect(item.priceUsdSnapshot).toBe("100.00");
    });

    it("snapshots a USD price at its own value", async () => {
      const item = await createItem(
        ownerId,
        {
          url: "https://example.com/p",
          title: "X",
          priceAmount: "49.99",
          priceCurrency: "USD",
          wishlistIds: [listA],
        },
        ctx.db,
      );

      expect(item.priceUsdSnapshot).toBe("49.99");
    });

    it("creates an item with no price at all", async () => {
      // Price is the field manual entry and OG scraping both most often skip.
      const item = await createItem(
        ownerId,
        { url: "https://example.com/p", title: "X", wishlistIds: [listA] },
        ctx.db,
      );
      expect(item.priceAmount).toBeNull();
      expect(item.priceUsdSnapshot).toBeNull();
    });
  });

  describe("updateItem", () => {
    async function seedItem() {
      return createItem(
        ownerId,
        { url: "https://example.com/original", title: "Original", wishlistIds: [listA] },
        ctx.db,
      );
    }

    it("renames an item", async () => {
      const item = await seedItem();
      const updated = await updateItem(item.id, ownerId, { title: "Renamed" }, ctx.db);
      expect(updated.title).toBe("Renamed");
    });

    it("clears notes by sending null", async () => {
      const item = await seedItem();
      await updateItem(item.id, ownerId, { notes: "a note" }, ctx.db);
      const cleared = await updateItem(item.id, ownerId, { notes: null }, ctx.db);
      expect(cleared.notes).toBeNull();
    });

    it("resets og_status to pending when the url changes", async () => {
      const item = await seedItem();
      // Manually mark it as if a future OG fetch had already succeeded.
      await ctx.db
        .update(items)
        .set({ ogStatus: "ok", ogFetchedAt: new Date() })
        .where(eq(items.id, item.id));

      const updated = await updateItem(
        item.id,
        ownerId,
        { url: "https://example.com/different" },
        ctx.db,
      );

      expect(updated.ogStatus).toBe("pending");
      expect(updated.ogFetchedAt).toBeNull();
    });

    it("leaves og_status alone when the url is unchanged", async () => {
      const item = await seedItem();
      await ctx.db
        .update(items)
        .set({ ogStatus: "ok", ogFetchedAt: new Date() })
        .where(eq(items.id, item.id));

      const updated = await updateItem(
        item.id,
        ownerId,
        { title: "Just the title" },
        ctx.db,
      );

      expect(updated.ogStatus).toBe("ok");
      expect(updated.ogFetchedAt).not.toBeNull();
    });

    it("leaves og_status alone when url is resent unchanged", async () => {
      const item = await seedItem();
      await ctx.db
        .update(items)
        .set({ ogStatus: "ok", ogFetchedAt: new Date() })
        .where(eq(items.id, item.id));

      const updated = await updateItem(
        item.id,
        ownerId,
        { url: "https://example.com/original" },
        ctx.db,
      );

      expect(updated.ogStatus).toBe("ok");
    });

    it("recomputes the USD snapshot when the price changes", async () => {
      const item = await seedItem();
      const updated = await updateItem(
        item.id,
        ownerId,
        { priceAmount: "205000", priceCurrency: "COP" },
        ctx.db,
      );
      expect(updated.priceUsdSnapshot).toBe("50.00");
    });

    it("returns not-found for an unknown id", async () => {
      const code = await errorCode(
        updateItem(
          "00000000-0000-0000-0000-000000000000",
          ownerId,
          { title: "X" },
          ctx.db,
        ),
      );
      expect(code).toBe("ITEM_NOT_FOUND");
    });

    it("returns not-found for a soft-deleted item — editing can't resurrect it", async () => {
      const item = await seedItem();
      await deleteItem(item.id, ownerId, ctx.db);

      const code = await errorCode(
        updateItem(item.id, ownerId, { title: "Resurrected?" }, ctx.db),
      );
      expect(code).toBe("ITEM_NOT_FOUND");
    });

    it("rejects an update from a non-owner", async () => {
      const item = await seedItem();
      const code = await errorCode(
        updateItem(item.id, otherId, { title: "Hijacked" }, ctx.db),
      );
      expect(code).toBe("FORBIDDEN");
    });
  });

  describe("deleteItem", () => {
    it("soft-deletes the item", async () => {
      const item = await createItem(
        ownerId,
        { url: "https://example.com/p", title: "X", wishlistIds: [listA] },
        ctx.db,
      );

      await deleteItem(item.id, ownerId, ctx.db);

      const [row] = await ctx.db.select().from(items).where(eq(items.id, item.id));
      expect(row.deletedAt).toBeInstanceOf(Date);
    });

    it("removes every list membership, not just one", async () => {
      // The direct delete path is deliberately blunter than T024's per-list
      // removal — it doesn't matter how many lists the item was in.
      const item = await createItem(
        ownerId,
        { url: "https://example.com/p", title: "X", wishlistIds: [listA, listB] },
        ctx.db,
      );

      await deleteItem(item.id, ownerId, ctx.db);

      const links = await ctx.db
        .select()
        .from(wishlistItems)
        .where(eq(wishlistItems.itemId, item.id));
      expect(links).toHaveLength(0);
    });

    it("is final — deleting an already-deleted item is not-found, not a silent success", async () => {
      const item = await createItem(
        ownerId,
        { url: "https://example.com/p", title: "X", wishlistIds: [listA] },
        ctx.db,
      );

      await deleteItem(item.id, ownerId, ctx.db);
      const code = await errorCode(deleteItem(item.id, ownerId, ctx.db));
      expect(code).toBe("ITEM_NOT_FOUND");
    });

    it("rejects deletion by a non-owner", async () => {
      const item = await createItem(
        ownerId,
        { url: "https://example.com/p", title: "X", wishlistIds: [listA] },
        ctx.db,
      );
      const code = await errorCode(deleteItem(item.id, otherId, ctx.db));
      expect(code).toBe("FORBIDDEN");

      const [row] = await ctx.db.select().from(items).where(eq(items.id, item.id));
      expect(row.deletedAt).toBeNull();
    });

    it("returns not-found for an unknown id", async () => {
      const code = await errorCode(
        deleteItem("00000000-0000-0000-0000-000000000000", ownerId, ctx.db),
      );
      expect(code).toBe("ITEM_NOT_FOUND");
    });
  });
});

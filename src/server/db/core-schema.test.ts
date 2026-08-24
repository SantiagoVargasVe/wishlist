import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { generateSlug } from "@/lib/slug";
import { liveItem } from "./helpers";
import { items, users, wishlistItems, wishlists } from "./schema";
import {
  createTestDb,
  hasTestDatabase,
  PG_CHECK_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
  type TestDb,
} from "./test-support";

describe.skipIf(!hasTestDatabase)("core schema", () => {
  let ctx: TestDb;
  let ownerId: string;
  let otherId: string;

  const newUser = (email: string) => ({
    email,
    passwordHash: "x",
    displayName: email.split("@")[0],
  });

  const newItem = (overrides: Partial<typeof items.$inferInsert> = {}) => ({
    ownerId,
    url: "https://example.com/p/1",
    title: "A thing",
    ...overrides,
  });

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE wishlist_items, items, wishlists, invite_codes, users RESTART IDENTITY CASCADE`;
    const created = await ctx.db
      .insert(users)
      .values([newUser("owner@example.com"), newUser("other@example.com")])
      .returning();
    ownerId = created[0].id;
    otherId = created[1].id;
  });

  describe("one default list per owner", () => {
    it("allows a single default", async () => {
      const [row] = await ctx.db
        .insert(wishlists)
        .values({ ownerId, title: "Wishlist", slug: generateSlug(), isDefault: true })
        .returning();
      expect(row.isDefault).toBe(true);
    });

    it("rejects a second default for the same owner", async () => {
      // Enforced by a partial unique index rather than application code: a
      // check-then-insert can be raced, an index cannot.
      await ctx.db
        .insert(wishlists)
        .values({ ownerId, title: "One", slug: generateSlug(), isDefault: true });

      const code = await pgErrorCode(
        ctx.db
          .insert(wishlists)
          .values({ ownerId, title: "Two", slug: generateSlug(), isDefault: true }),
      );
      expect(code).toBe(PG_UNIQUE_VIOLATION);
    });

    it("lets different owners each have a default", async () => {
      await ctx.db
        .insert(wishlists)
        .values({ ownerId, title: "Mine", slug: generateSlug(), isDefault: true });

      const code = await pgErrorCode(
        ctx.db.insert(wishlists).values({
          ownerId: otherId,
          title: "Theirs",
          slug: generateSlug(),
          isDefault: true,
        }),
      );
      expect(code).toBeUndefined();
    });

    it("allows many non-default lists", async () => {
      await ctx.db.insert(wishlists).values([
        { ownerId, title: "A", slug: generateSlug() },
        { ownerId, title: "B", slug: generateSlug() },
        { ownerId, title: "C", slug: generateSlug() },
      ]);

      const rows = await ctx.db
        .select()
        .from(wishlists)
        .where(eq(wishlists.ownerId, ownerId));
      expect(rows).toHaveLength(3);
    });

    it("rejects a duplicate slug", async () => {
      const slug = generateSlug();
      await ctx.db.insert(wishlists).values({ ownerId, title: "A", slug });

      const code = await pgErrorCode(
        ctx.db.insert(wishlists).values({ ownerId: otherId, title: "B", slug }),
      );
      expect(code).toBe(PG_UNIQUE_VIOLATION);
    });

    it("hides claims from the owner by default", async () => {
      const [row] = await ctx.db
        .insert(wishlists)
        .values({ ownerId, title: "A", slug: generateSlug() })
        .returning();
      expect(row.hideClaimsFromOwner).toBe(true);
    });
  });

  describe("items", () => {
    it("stores money without float drift", async () => {
      // A 1.3M COP item is the normal case here, and numeric must round-trip it
      // exactly. This is why price is never a float.
      const [row] = await ctx.db
        .insert(items)
        .values(newItem({ priceAmount: "1299999.99", priceCurrency: "COP" }))
        .returning();

      expect(row.priceAmount).toBe("1299999.99");
      expect(row.priceCurrency).toBe("COP");
    });

    it("rejects an unsupported currency", async () => {
      // The FX snapshot only normalises COP and USD; silently accepting EUR
      // would corrupt cross-currency filtering with no visible error.
      const code = await pgErrorCode(
        ctx.db
          .insert(items)
          .values(newItem({ priceAmount: "10.00", priceCurrency: "EUR" })),
      );
      expect(code).toBe(PG_CHECK_VIOLATION);
    });

    it("rejects a price with no currency", async () => {
      const code = await pgErrorCode(
        ctx.db.insert(items).values(newItem({ priceAmount: "10.00" })),
      );
      expect(code).toBe(PG_CHECK_VIOLATION);
    });

    it("rejects a currency with no price", async () => {
      const code = await pgErrorCode(
        ctx.db.insert(items).values(newItem({ priceCurrency: "USD" })),
      );
      expect(code).toBe(PG_CHECK_VIOLATION);
    });

    it("allows an item with no price at all", async () => {
      // Price is the field OG scraping most often fails to find, so a priceless
      // item has to be a normal state rather than an error.
      const code = await pgErrorCode(ctx.db.insert(items).values(newItem()));
      expect(code).toBeUndefined();
    });

    it("defaults og_status to pending", async () => {
      const [row] = await ctx.db.insert(items).values(newItem()).returning();
      expect(row.ogStatus).toBe("pending");
    });

    it("rejects an unknown og_status", async () => {
      const code = await pgErrorCode(
        ctx.db.insert(items).values(newItem({ ogStatus: "weird" })),
      );
      expect(code).toBe(PG_CHECK_VIOLATION);
    });

    it("accepts every valid og_status", async () => {
      for (const status of ["pending", "ok", "failed", "manual"]) {
        const code = await pgErrorCode(
          ctx.db.insert(items).values(newItem({ ogStatus: status })),
        );
        expect(code).toBeUndefined();
      }
    });
  });

  describe("liveItem helper", () => {
    it("excludes soft-deleted items", async () => {
      const rows = await ctx.db
        .insert(items)
        .values([newItem({ title: "Kept" }), newItem({ title: "Gone" })])
        .returning();

      await ctx.db
        .update(items)
        .set({ deletedAt: new Date() })
        .where(eq(items.id, rows[1].id));

      const live = await ctx.db
        .select()
        .from(items)
        .where(and(liveItem, eq(items.ownerId, ownerId)));

      expect(live.map((i) => i.title)).toEqual(["Kept"]);
    });
  });

  describe("wishlist_items", () => {
    let wishlistId: string;
    let itemId: string;

    beforeEach(async () => {
      const [list] = await ctx.db
        .insert(wishlists)
        .values({ ownerId, title: "A", slug: generateSlug() })
        .returning();
      const [item] = await ctx.db.insert(items).values(newItem()).returning();
      wishlistId = list.id;
      itemId = item.id;
    });

    it("links an item to a list", async () => {
      const [row] = await ctx.db
        .insert(wishlistItems)
        .values({ wishlistId, itemId })
        .returning();
      expect(row.position).toBe(0);
    });

    it("rejects the same item twice in one list", async () => {
      await ctx.db.insert(wishlistItems).values({ wishlistId, itemId });
      const code = await pgErrorCode(
        ctx.db.insert(wishlistItems).values({ wishlistId, itemId }),
      );
      expect(code).toBe(PG_UNIQUE_VIOLATION);
    });

    it("allows one item in several lists", async () => {
      // The many-to-many requirement: one item, many lists.
      const [second] = await ctx.db
        .insert(wishlists)
        .values({ ownerId, title: "B", slug: generateSlug() })
        .returning();

      await ctx.db.insert(wishlistItems).values([
        { wishlistId, itemId },
        { wishlistId: second.id, itemId },
      ]);

      const rows = await ctx.db
        .select()
        .from(wishlistItems)
        .where(eq(wishlistItems.itemId, itemId));
      expect(rows).toHaveLength(2);
    });

    it("removes join rows when the list is deleted", async () => {
      await ctx.db.insert(wishlistItems).values({ wishlistId, itemId });
      await ctx.db.delete(wishlists).where(eq(wishlists.id, wishlistId));

      const rows = await ctx.db.select().from(wishlistItems);
      expect(rows).toHaveLength(0);

      // The item itself survives — deleting a list is not deleting its contents.
      const remaining = await ctx.db.select().from(items);
      expect(remaining).toHaveLength(1);
    });
  });

  describe("cascade from users", () => {
    it("removes a deleted user's lists and items", async () => {
      await ctx.db
        .insert(wishlists)
        .values({ ownerId, title: "A", slug: generateSlug() });
      await ctx.db.insert(items).values(newItem());

      await ctx.db.delete(users).where(eq(users.id, ownerId));

      expect(await ctx.db.select().from(wishlists)).toHaveLength(0);
      expect(await ctx.db.select().from(items)).toHaveLength(0);
    });
  });
});

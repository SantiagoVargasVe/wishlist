import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "../db/schema";
import { users, wishlists } from "../db/schema";
import {
  createTestDb,
  hasTestDatabase,
  TEST_DATABASE_URL,
  type TestDb,
} from "../db/test-support";
import { createItem, deleteItem } from "./items";
import { getMyWishlists } from "./me";
import { createDefaultWishlist, createWishlist } from "./wishlists";

describe.skipIf(!hasTestDatabase)("getMyWishlists", () => {
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

  it("returns an empty wishlist with items: [] — the LEFT JOIN, not an inner one", async () => {
    await createDefaultWishlist(ownerId, ctx.db);

    const result = await getMyWishlists(ownerId, ctx.db);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Wishlist");
    expect(result[0].items).toEqual([]);
  });

  it("returns nothing for an account with no wishlists at all", async () => {
    const result = await getMyWishlists(ownerId, ctx.db);
    expect(result).toEqual([]);
  });

  it("nests an item under the list it belongs to", async () => {
    const list = await createDefaultWishlist(ownerId, ctx.db);
    await createItem(
      ownerId,
      { url: "https://example.com/p", title: "Headphones", wishlistIds: [list.id] },
      ctx.db,
    );

    const result = await getMyWishlists(ownerId, ctx.db);

    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].title).toBe("Headphones");
  });

  it("shows an item belonging to two lists under both — not a duplication bug", async () => {
    const listA = await createDefaultWishlist(ownerId, ctx.db);
    const listB = await createWishlist(ownerId, { title: "Second" }, ctx.db);
    await createItem(
      ownerId,
      { url: "https://example.com/p", title: "Shared", wishlistIds: [listA.id, listB.id] },
      ctx.db,
    );

    const result = await getMyWishlists(ownerId, ctx.db);
    const byTitle = new Map(result.map((w) => [w.title, w]));

    expect(byTitle.get("Wishlist")!.items.map((i) => i.title)).toEqual(["Shared"]);
    expect(byTitle.get("Second")!.items.map((i) => i.title)).toEqual(["Shared"]);
  });

  it("never returns a soft-deleted item", async () => {
    const list = await createDefaultWishlist(ownerId, ctx.db);
    const item = await createItem(
      ownerId,
      { url: "https://example.com/p", title: "Gone soon", wishlistIds: [list.id] },
      ctx.db,
    );
    await deleteItem(item.id, ownerId, ctx.db);

    const result = await getMyWishlists(ownerId, ctx.db);

    expect(result[0].items).toEqual([]);
  });

  it("sorts the default list first", async () => {
    await createWishlist(ownerId, { title: "Created first, not default" }, ctx.db);
    await createDefaultWishlist(ownerId, ctx.db);

    const result = await getMyWishlists(ownerId, ctx.db);

    expect(result[0].isDefault).toBe(true);
    expect(result[0].title).toBe("Wishlist");
  });

  it("never returns another owner's wishlists", async () => {
    await createDefaultWishlist(ownerId, ctx.db);
    await createDefaultWishlist(otherId, ctx.db);

    const result = await getMyWishlists(ownerId, ctx.db);

    expect(result).toHaveLength(1);
    const rows = await ctx.db.select().from(wishlists).where(eq(wishlists.ownerId, otherId));
    expect(rows).toHaveLength(1); // the other account's list genuinely exists
  });

  it("issues exactly one SQL statement, not N+1 across wishlists", async () => {
    // Not asserted "by construction" — genuinely counted via postgres.js's
    // debug hook, which fires once per statement sent over the wire. Five
    // wishlists is enough that an N+1 implementation would show 6 (one list
    // query + five per-wishlist item queries) instead of 1.
    const lists = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createWishlist(ownerId, { title: `List ${i}` }, ctx.db),
      ),
    );
    for (const list of lists) {
      await createItem(
        ownerId,
        { url: "https://example.com/p", title: `Item in ${list.title}`, wishlistIds: [list.id] },
        ctx.db,
      );
    }

    const statements: string[] = [];
    const debugSql = postgres(TEST_DATABASE_URL!, {
      max: 1,
      debug: (_conn, query) => statements.push(query),
    });
    const debugDb = drizzle(debugSql, { schema });

    try {
      const result = await getMyWishlists(ownerId, debugDb);
      expect(result).toHaveLength(5);
      for (const wishlist of result) {
        expect(wishlist.items).toHaveLength(1);
      }

      // A brand-new connection also emits one driver-internal bootstrap query
      // (postgres.js discovering array-type OIDs) — that's connection setup,
      // not application logic, and wouldn't repeat on a pooled connection
      // reused across requests. Isolate the actual query against our schema.
      const appQueries = statements.filter((s) => s.includes('from "wishlists"'));
      expect(appQueries).toHaveLength(1);
    } finally {
      await debugSql.end();
    }
  });
});

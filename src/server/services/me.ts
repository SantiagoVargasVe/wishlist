import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "../db";
import { liveItem } from "../db/helpers";
import { items, wishlistItems, wishlists } from "../db/schema";
import type { Db } from "../db/types";
import { itemColumns, type PublicItem } from "./items";
import { wishlistColumns, type PublicWishlist } from "./wishlists";

export type MyWishlist = PublicWishlist & { items: PublicItem[] };

/**
 * `GET /api/me`. The one aggregate read the whole owner UI renders from —
 * every wishlist the caller owns, each with its live items nested inside.
 *
 * One join query, not one query per wishlist — see docs/backend/CLAUDE.md
 * § Queries. `LEFT JOIN` through both `wishlist_items` and `items` so a
 * wishlist with zero items still appears, with `items: []`, rather than
 * silently vanishing the way an inner join would make it.
 *
 * An item that belongs to two lists appears once under each — that's the
 * correct shape for a UI that renders one wishlist's items at a time, not
 * duplication to worry about.
 *
 * **No claim data.** `item_claims` (T040) doesn't exist yet, so there's
 * nothing to strip per `hide_claims_from_owner` (T043). When it does, that
 * work adds a third join here and filters per wishlist's flag — it does not
 * belong in this function's shape until there's something real to filter.
 */
export async function getMyWishlists(
  ownerId: string,
  db: Db = getDb(),
): Promise<MyWishlist[]> {
  const rows = await db
    .select({
      wishlist: wishlistColumns,
      item: itemColumns,
    })
    .from(wishlists)
    .leftJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
    .leftJoin(items, and(eq(items.id, wishlistItems.itemId), liveItem))
    .where(eq(wishlists.ownerId, ownerId))
    .orderBy(
      desc(wishlists.isDefault),
      asc(wishlists.createdAt),
      asc(wishlistItems.position),
      asc(wishlistItems.addedAt),
    );

  const byId = new Map<string, MyWishlist>();

  for (const row of rows) {
    let entry = byId.get(row.wishlist.id);
    if (!entry) {
      entry = { ...row.wishlist, items: [] };
      byId.set(row.wishlist.id, entry);
    }
    if (row.item?.id) entry.items.push(row.item);
  }

  return [...byId.values()];
}

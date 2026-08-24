import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "../db";
import { liveItem } from "../db/helpers";
import { itemClaims, items, users, wishlistItems, wishlists } from "../db/schema";
import type { Db } from "../db/types";
import { WishlistErrors } from "../errors";

/** What a visitor sees about one item. Claim state, never the claimer's identity (ADR-0005). */
export type PublicVisitorItem = {
  id: string;
  url: string;
  title: string;
  notes: string | null;
  imagePath: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  claimed: boolean;
};

export type PublicVisitorWishlist = {
  title: string;
  ownerDisplayName: string;
  items: PublicVisitorItem[];
};

/**
 * `GET /api/w/:slug`. Deliberately a different shape from `getMyWishlists`
 * (T025) — this one exposes claim state and hides everything else about the
 * owner beyond their display name; the owner read does the reverse. They
 * must never share a handler or a service function, or claim data leaks to
 * the owner — see api-contract.md § Public list view.
 *
 * Two queries, not one five-way join: a wishlist with zero items still needs
 * to resolve (not 404), and starting the item query from `wishlist_items`
 * gets that for free — an empty result is just an empty array, no `LEFT
 * JOIN`-and-degroup step the way T025's multi-wishlist aggregate needed.
 */
export async function getPublicWishlist(
  slug: string,
  db: Db = getDb(),
): Promise<PublicVisitorWishlist> {
  const [wishlist] = await db
    .select({ title: wishlists.title, ownerDisplayName: users.displayName })
    .from(wishlists)
    .innerJoin(users, eq(users.id, wishlists.ownerId))
    .where(eq(wishlists.slug, slug))
    .limit(1);

  if (!wishlist) throw WishlistErrors.notFound();

  const rows = await db
    .select({
      id: items.id,
      url: items.url,
      title: items.title,
      notes: items.notes,
      imagePath: items.imagePath,
      priceAmount: items.priceAmount,
      priceCurrency: items.priceCurrency,
      claimedItemId: itemClaims.itemId,
    })
    .from(wishlistItems)
    .innerJoin(wishlists, eq(wishlists.id, wishlistItems.wishlistId))
    .innerJoin(items, and(eq(items.id, wishlistItems.itemId), liveItem))
    .leftJoin(itemClaims, eq(itemClaims.itemId, items.id))
    .where(eq(wishlists.slug, slug))
    .orderBy(asc(wishlistItems.position), asc(wishlistItems.addedAt));

  return {
    ...wishlist,
    items: rows.map(({ claimedItemId, ...item }) => ({
      ...item,
      claimed: claimedItemId !== null,
    })),
  };
}

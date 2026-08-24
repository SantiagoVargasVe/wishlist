import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { CreateItemInput, UpdateItemInput } from "@/lib/schemas/item";
import { assertOwned } from "../auth/ownership";
import { getDb } from "../db";
import { PG_UNIQUE_VIOLATION, isPgError } from "../db/pg-errors";
import { liveItem } from "../db/helpers";
import { items, wishlistItems, wishlists } from "../db/schema";
import type { Db } from "../db/types";
import { ItemErrors, WishlistErrors } from "../errors";

/** What an owner sees about their own item. Never includes `deletedAt`. */
export type PublicItem = {
  id: string;
  url: string;
  title: string;
  notes: string | null;
  imagePath: string | null;
  sourceImageUrl: string | null;
  siteName: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  ogStatus: string;
  ogFetchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const itemColumns = {
  id: items.id,
  url: items.url,
  title: items.title,
  notes: items.notes,
  imagePath: items.imagePath,
  sourceImageUrl: items.sourceImageUrl,
  siteName: items.siteName,
  priceAmount: items.priceAmount,
  priceCurrency: items.priceCurrency,
  ogStatus: items.ogStatus,
  ogFetchedAt: items.ogFetchedAt,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt,
};

/**
 * `priceAmount`/`priceCurrency` are validated as a pair by the Zod schema
 * before either service function runs, so seeing one guarantees the other.
 * Stored exactly as entered — see ADR-0009 for why there's no derived
 * conversion.
 */
function priceFields(amount: string | undefined, currency: string | undefined) {
  if (amount === undefined) return {};
  return { priceAmount: amount, priceCurrency: currency };
}

/**
 * `POST /api/items`. Every id in `wishlistIds` must be a list the caller
 * owns — otherwise an item could be filed into someone else's list, or the
 * request silently drops an invalid id and creates something the caller
 * didn't ask for. The item row and its list memberships are created in one
 * transaction: an item with zero lists is as broken a state as a user with
 * no default wishlist.
 */
export async function createItem(
  ownerId: string,
  input: CreateItemInput,
  db: Db = getDb(),
): Promise<PublicItem> {
  const owned = await db
    .select({ id: wishlists.id })
    .from(wishlists)
    .where(
      and(inArray(wishlists.id, input.wishlistIds), eq(wishlists.ownerId, ownerId)),
    );

  const ownedIds = new Set(owned.map((w) => w.id));
  const invalid = input.wishlistIds.filter((id) => !ownedIds.has(id));
  if (invalid.length > 0) throw ItemErrors.invalidWishlists(invalid);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(items)
      .values({
        ownerId,
        url: input.url,
        title: input.title,
        notes: input.notes,
        ...priceFields(input.priceAmount, input.priceCurrency),
      })
      .returning(itemColumns);

    await tx.insert(wishlistItems).values(
      input.wishlistIds.map((wishlistId) => ({ wishlistId, itemId: row.id })),
    );

    return row;
  });
}

/**
 * `PATCH /api/items/:id`. `404` for missing *or soft-deleted* — `liveItem`
 * gates the lookup, so an edit can never resurrect a deleted item by writing
 * to its row.
 *
 * Changing `url` resets `og_status` to `pending` and clears `og_fetched_at`.
 * That's a hook for T031-T034, not a live trigger — nothing can fetch
 * anything yet, so this only marks the item as needing a (re)fetch once the
 * scraper exists.
 */
export async function updateItem(
  id: string,
  ownerId: string,
  input: UpdateItemInput,
  db: Db = getDb(),
): Promise<PublicItem> {
  const [existing] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, id), liveItem))
    .limit(1);
  assertOwned(existing, ownerId, ItemErrors.notFound);

  const urlChanged = input.url !== undefined && input.url !== existing.url;

  const [row] = await db
    .update(items)
    .set({
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...priceFields(input.priceAmount, input.priceCurrency),
      ...(urlChanged ? { ogStatus: "pending", ogFetchedAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(items.id, id))
    .returning(itemColumns);

  return row;
}

/**
 * `DELETE /api/items/:id`. The *direct* delete path, per
 * docs/context/data-model.md's deletion table: soft-deletes the item and
 * removes **every** `wishlist_items` row for it, regardless of how many lists
 * it belonged to. Deliberately blunter than T024's per-list removal, which
 * only ever touches the one join row for the list it was removed from.
 */
export async function deleteItem(
  id: string,
  ownerId: string,
  db: Db = getDb(),
): Promise<void> {
  const [existing] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, id), liveItem))
    .limit(1);
  assertOwned(existing, ownerId, ItemErrors.notFound);

  await db.transaction(async (tx) => {
    await tx.delete(wishlistItems).where(eq(wishlistItems.itemId, id));
    await tx
      .update(items)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(items.id, id));
  });
}

/**
 * `POST /api/items/:id/wishlists`. The surgical counterpart to `deleteItem`'s
 * blunt one — files an existing item into one more list the caller owns,
 * touching nothing else. Owner checked on both the item and the target list;
 * either missing (or not the caller's) is `404`.
 */
export async function addItemToWishlist(
  itemId: string,
  wishlistId: string,
  ownerId: string,
  db: Db = getDb(),
): Promise<void> {
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), liveItem))
    .limit(1);
  assertOwned(item, ownerId, ItemErrors.notFound);

  const [wishlist] = await db
    .select()
    .from(wishlists)
    .where(eq(wishlists.id, wishlistId))
    .limit(1);
  assertOwned(wishlist, ownerId, WishlistErrors.notFound);

  try {
    await db.insert(wishlistItems).values({ wishlistId, itemId });
  } catch (error) {
    // The composite primary key (T020) is what actually guarantees this
    // can't race into two rows; the check is what turns that into a clean
    // error instead of a raw constraint violation.
    if (isPgError(error, PG_UNIQUE_VIOLATION)) throw ItemErrors.alreadyInWishlist();
    throw error;
  }
}

/**
 * `DELETE /api/items/:id/wishlists/:wishlistId`. Removing an item's *only*
 * remaining membership also soft-deletes it — data-model.md's "nothing lands
 * in orphan limbo" rule. No confirmation step, unlike deleting a whole
 * wishlist: this is one item, one explicit action the caller already chose,
 * not a bulk operation with a surprising blast radius.
 *
 * The membership delete, the remaining-count check, and the conditional soft
 * delete run in one transaction — a partial result (join row gone but the
 * item not soft-deleted, or the reverse) would be a real bug.
 */
export async function removeItemFromWishlist(
  itemId: string,
  wishlistId: string,
  ownerId: string,
  db: Db = getDb(),
): Promise<void> {
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), liveItem))
    .limit(1);
  assertOwned(item, ownerId, ItemErrors.notFound);

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(wishlistItems)
      .where(
        and(eq(wishlistItems.itemId, itemId), eq(wishlistItems.wishlistId, wishlistId)),
      )
      .returning({ wishlistId: wishlistItems.wishlistId });

    if (deleted.length === 0) throw ItemErrors.notInWishlist();

    // Bare count(*) is bigint; postgres.js parses that as a string by
    // default, so an unadorned count would never equal 0 below. Same cast
    // pattern as wishlists.ts's findSoloItems, for the same reason.
    const [{ remaining }] = await tx
      .select({ remaining: sql<number>`count(*)::int` })
      .from(wishlistItems)
      .where(eq(wishlistItems.itemId, itemId));

    if (remaining === 0) {
      await tx
        .update(items)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(items.id, itemId));
    }
  });
}

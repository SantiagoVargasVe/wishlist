import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import { generateSlug } from "@/lib/slug";
import { assertOwned } from "../auth/ownership";
import { getDb } from "../db";
import { items, wishlistItems, wishlists } from "../db/schema";
import type { Db, DbOrTx } from "../db/types";
import { WishlistErrors } from "../errors";
import type { CreateWishlistInput, UpdateWishlistInput } from "@/lib/schemas/wishlist";

/** What an owner sees about their own wishlist. */
export type PublicWishlist = {
  id: string;
  slug: string;
  title: string;
  isDefault: boolean;
  hideClaimsFromOwner: boolean;
};

const wishlistColumns = {
  id: wishlists.id,
  slug: wishlists.slug,
  title: wishlists.title,
  isDefault: wishlists.isDefault,
  hideClaimsFromOwner: wishlists.hideClaimsFromOwner,
};

/**
 * Seed value, not a permanent product decision — the list is renameable
 * immediately after creation. See docs/context/product.md.
 */
const DEFAULT_WISHLIST_TITLE = "Wishlist";

/**
 * Create the one default list every user gets on registration.
 *
 * Takes `DbOrTx` rather than `Db` so `registerUser` (T011) can call this with
 * its own transaction handle — a user must never exist without a default
 * list, or vice versa, which only holds if both inserts share one transaction.
 *
 * Slug collisions are not retried: at ~50 bits of entropy the probability is
 * astronomically small, and a unique-violation here would surface as a 500
 * rather than silently succeeding with the wrong slug. Retry logic for a risk
 * this size would be complexity with no real payoff.
 */
export async function createDefaultWishlist(
  ownerId: string,
  db: DbOrTx,
): Promise<PublicWishlist> {
  const [row] = await db
    .insert(wishlists)
    .values({
      ownerId,
      title: DEFAULT_WISHLIST_TITLE,
      slug: generateSlug(),
      isDefault: true,
    })
    .returning(wishlistColumns);

  return row;
}

/** `POST /api/wishlists`. Always non-default — only registration creates one of those. */
export async function createWishlist(
  ownerId: string,
  input: CreateWishlistInput,
  db: Db = getDb(),
): Promise<PublicWishlist> {
  const [row] = await db
    .insert(wishlists)
    .values({ ownerId, title: input.title, slug: generateSlug(), isDefault: false })
    .returning(wishlistColumns);

  return row;
}

/** `PATCH /api/wishlists/:id`. The default list may be renamed — only deletion is blocked. */
export async function updateWishlist(
  id: string,
  ownerId: string,
  input: UpdateWishlistInput,
  db: Db = getDb(),
): Promise<PublicWishlist> {
  const [existing] = await db
    .select()
    .from(wishlists)
    .where(eq(wishlists.id, id))
    .limit(1);
  assertOwned(existing, ownerId, WishlistErrors.notFound);

  const [row] = await db
    .update(wishlists)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.hideClaimsFromOwner !== undefined
        ? { hideClaimsFromOwner: input.hideClaimsFromOwner }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(wishlists.id, id))
    .returning(wishlistColumns);

  return row;
}

/**
 * Items whose *only* membership, across every one of the owner's lists, is
 * this wishlist — the set that would be orphaned by deleting it.
 *
 * Two queries rather than one correlated subquery: this app's per-list item
 * counts are small, and the extra round trip is cheap next to the value of a
 * plan a reviewer can read without mentally executing SQL.
 */
async function findSoloItems(
  wishlistId: string,
  db: DbOrTx,
): Promise<{ id: string; title: string }[]> {
  const memberships = await db
    .select({ itemId: wishlistItems.itemId })
    .from(wishlistItems)
    .where(eq(wishlistItems.wishlistId, wishlistId));

  if (memberships.length === 0) return [];
  const itemIds = memberships.map((m) => m.itemId);

  // Explicit ::int cast: bare count(*) is bigint, and postgres.js parses
  // bigint as a string by default — an unadorned count() would compare as
  // "1" !== 1 below and silently treat nothing as solo.
  const counts = await db
    .select({
      itemId: wishlistItems.itemId,
      count: sql<number>`count(*)::int`,
    })
    .from(wishlistItems)
    .where(inArray(wishlistItems.itemId, itemIds))
    .groupBy(wishlistItems.itemId);

  const soloIds = counts.filter((c) => c.count === 1).map((c) => c.itemId);
  if (soloIds.length === 0) return [];

  return db
    .select({ id: items.id, title: items.title })
    .from(items)
    .where(inArray(items.id, soloIds));
}

/**
 * `DELETE /api/wishlists/:id`.
 *
 * The default list can never be deleted (only renamed). Deleting a list whose
 * items live only there requires `deleteOrphans: true` — otherwise this
 * throws with the affected items listed, and nothing is touched, matching the
 * "prompt" behaviour in docs/context/data-model.md.
 *
 * The orphan check runs as plain reads before any mutation, so rejecting a
 * delete never opens a transaction. The actual mutation — soft-deleting
 * orphans, then removing the list — is transactional, since a partial result
 * there (items gone, list still present, or the reverse) is a real bug.
 * A confirm-then-delete race with the owner adding the same item to another
 * list in between is accepted as out of scope: this is a single-owner action
 * with no realistic concurrent actor.
 */
export async function deleteWishlist(
  id: string,
  ownerId: string,
  options: { deleteOrphans: boolean },
  db: Db = getDb(),
): Promise<void> {
  const [existing] = await db
    .select()
    .from(wishlists)
    .where(eq(wishlists.id, id))
    .limit(1);
  assertOwned(existing, ownerId, WishlistErrors.notFound);

  if (existing.isDefault) throw WishlistErrors.cannotDeleteDefault();

  const orphans = await findSoloItems(id, db);

  if (orphans.length > 0 && !options.deleteOrphans) {
    throw WishlistErrors.confirmDeleteOrphans(orphans);
  }

  await db.transaction(async (tx) => {
    if (orphans.length > 0) {
      await tx
        .update(items)
        .set({ deletedAt: new Date() })
        .where(
          inArray(
            items.id,
            orphans.map((o) => o.id),
          ),
        );
    }

    // wishlist_items rows for this list cascade automatically. Items that
    // also live in another list are unaffected — only their membership here
    // disappears.
    await tx.delete(wishlists).where(eq(wishlists.id, id));
  });
}

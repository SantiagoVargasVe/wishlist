import "server-only";

import { and, eq } from "drizzle-orm";

import { generateClaimToken } from "@/lib/claim-token";
import { liveItem } from "../db/helpers";
import { getDb } from "../db";
import { PG_UNIQUE_VIOLATION, isPgError } from "../db/pg-errors";
import { itemClaims, items, wishlistItems, wishlists } from "../db/schema";
import type { Db } from "../db/types";
import { ClaimErrors, ItemErrors } from "../errors";

/**
 * The item, only if it's a live member of the wishlist behind `slug`. Scopes
 * every claim operation to "you were given this link" — the same possession
 * model as the rest of the public view, not an ownership check (there's no
 * owner concept for an anonymous claimer).
 */
async function findItemInWishlist(slug: string, itemId: string, db: Db) {
  const [row] = await db
    .select({ id: items.id })
    .from(wishlists)
    .innerJoin(wishlistItems, eq(wishlistItems.wishlistId, wishlists.id))
    .innerJoin(items, and(eq(items.id, wishlistItems.itemId), liveItem))
    .where(and(eq(wishlists.slug, slug), eq(items.id, itemId)))
    .limit(1);

  return row ?? null;
}

/**
 * `POST /api/w/:slug/items/:itemId/claim`. `claimedByUserId` is the session
 * user id when logged in, `null` for an anonymous claimer — either way it's
 * never echoed back to any reader (ADR-0005); only `claimToken` is.
 *
 * The insert is the actual race-safety mechanism: `item_claims.item_id` is
 * unique, so two simultaneous claims both attempt the insert and exactly one
 * survives. A read-then-write here would have a window where both read "not
 * claimed yet" and both insert — the precise bug this feature exists to
 * prevent.
 */
export async function claimItem(
  slug: string,
  itemId: string,
  claimedByUserId: string | null,
  db: Db = getDb(),
): Promise<{ claimToken: string }> {
  const item = await findItemInWishlist(slug, itemId, db);
  if (!item) throw ItemErrors.notFound();

  const claimToken = generateClaimToken();

  try {
    await db.insert(itemClaims).values({ itemId, claimedByUserId, claimToken });
  } catch (error) {
    if (isPgError(error, PG_UNIQUE_VIOLATION)) throw ClaimErrors.alreadyClaimed();
    throw error;
  }

  return { claimToken };
}

/**
 * `DELETE /api/w/:slug/items/:itemId/claim`. Succeeds if `claimToken`
 * matches the stored one, or if the caller is authenticated as the original
 * claimer — either is proof enough that this is genuinely their claim to
 * undo.
 */
export async function unclaimItem(
  slug: string,
  itemId: string,
  claimToken: string,
  requesterUserId: string | null,
  db: Db = getDb(),
): Promise<void> {
  const item = await findItemInWishlist(slug, itemId, db);
  if (!item) throw ItemErrors.notFound();

  const [claim] = await db
    .select()
    .from(itemClaims)
    .where(eq(itemClaims.itemId, itemId))
    .limit(1);
  if (!claim) throw ClaimErrors.notClaimed();

  const tokenMatches = claim.claimToken === claimToken;
  const isOriginalClaimer =
    requesterUserId !== null && claim.claimedByUserId === requesterUserId;
  if (!tokenMatches && !isOriginalClaimer) throw ClaimErrors.tokenMismatch();

  await db.delete(itemClaims).where(eq(itemClaims.itemId, itemId));
}

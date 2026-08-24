import "server-only";

import { generateSlug } from "@/lib/slug";
import type { DbOrTx } from "../db/types";
import { wishlists } from "../db/schema";

/** What callers may see. */
export type PublicWishlist = {
  id: string;
  slug: string;
  title: string;
  isDefault: boolean;
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
    .returning({
      id: wishlists.id,
      slug: wishlists.slug,
      title: wishlists.title,
      isDefault: wishlists.isDefault,
    });

  return row;
}

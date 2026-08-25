import { cache } from "react";

import { currentUserId } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { getMyWishlists } from "@/server/services/me";
import { getPublicWishlist } from "@/server/services/public-wishlist";

/**
 * `cache()` so every consumer within one request — the page body,
 * `generateMetadata()`, `opengraph-image.tsx` — shares one query instead of
 * one each. Extracted out of `page.tsx` because T058 needs the same lookups
 * from a second file; `cache()`'s dedup is keyed on the function reference,
 * so both files importing these (rather than each defining their own) is
 * what makes that sharing real.
 *
 * Returns every owned wishlist, not just the one matching a given slug —
 * T053's add-item modal needs the full set. Callers that only care about
 * the current one do their own `.find()`.
 */
export const findOwnedWishlists = cache(async () => {
  const userId = await currentUserId();
  if (!userId) return null;

  return getMyWishlists(userId);
});

/** `null` for a slug that genuinely doesn't exist — anything else propagates. */
export const findPublicWishlist = cache(async (slug: string) => {
  try {
    return await getPublicWishlist(slug);
  } catch (error) {
    if (error instanceof DomainError && error.code === "WISHLIST_NOT_FOUND") return null;
    throw error;
  }
});

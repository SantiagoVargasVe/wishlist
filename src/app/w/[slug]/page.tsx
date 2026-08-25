import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { t } from "@/lib/i18n";
import { currentUserId } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { getMyWishlists } from "@/server/services/me";
import { getPublicWishlist } from "@/server/services/public-wishlist";

import { OwnerView } from "./owner-view";
import { VisitorView } from "./visitor-view";

type Props = { params: Promise<{ slug: string }> };

/**
 * `cache()` so `generateMetadata` and the page body share one call each —
 * Next dedupes `fetch()` automatically but not arbitrary async functions,
 * and "one query, not one per consumer" is the same bar T025 already holds
 * the data layer to.
 *
 * Returns every owned wishlist, not just the one matching `slug` — T053's
 * add-item modal needs the full set for its "which lists" checkbox list.
 * Callers that only care about the current one still do their own `.find()`.
 */
const findOwnedWishlists = cache(async () => {
  const userId = await currentUserId();
  if (!userId) return null;

  return getMyWishlists(userId);
});

/** `null` for a slug that genuinely doesn't exist — anything else propagates. */
const findPublicWishlist = cache(async (slug: string) => {
  try {
    return await getPublicWishlist(slug);
  } catch (error) {
    if (error instanceof DomainError && error.code === "WISHLIST_NOT_FOUND") return null;
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const owned = (await findOwnedWishlists())?.find((w) => w.slug === slug);
  if (owned) return { title: owned.title };

  const publicWishlist = await findPublicWishlist(slug);
  return { title: publicWishlist?.title ?? t("common.appName") };
}

export default async function WishlistPage({ params }: Props) {
  const { slug } = await params;

  const ownedWishlists = await findOwnedWishlists();
  const owned = ownedWishlists?.find((w) => w.slug === slug);
  if (owned && ownedWishlists) return <OwnerView wishlist={owned} wishlists={ownedWishlists} />;

  const publicWishlist = await findPublicWishlist(slug);
  if (!publicWishlist) notFound();

  return <VisitorView slug={slug} wishlist={publicWishlist} />;
}

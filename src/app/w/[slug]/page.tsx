import type { Metadata } from "next";
import { cache } from "react";

import { t } from "@/lib/i18n";
import { currentUserId } from "@/server/auth/session";
import { getMyWishlists } from "@/server/services/me";

import { ItemGrid } from "./item-grid";

type Props = { params: Promise<{ slug: string }> };

/**
 * `cache()` so `generateMetadata` and the page body share one call — Next
 * doesn't dedupe arbitrary async functions the way it dedupes `fetch()`, and
 * "one query, not one per consumer" is the same bar T025 already holds the
 * data layer to.
 */
const findOwnedWishlist = cache(async (slug: string) => {
  const userId = await currentUserId();
  if (!userId) return null;

  const wishlists = await getMyWishlists(userId);
  return wishlists.find((w) => w.slug === slug) ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const wishlist = await findOwnedWishlist(slug);
  return { title: wishlist?.title ?? t("common.appName") };
}

export default async function WishlistPage({ params }: Props) {
  const { slug } = await params;
  const wishlist = await findOwnedWishlist(slug);

  if (!wishlist) {
    // Not this session's own list. Could be a real visitor link or an
    // invalid slug — telling those apart needs GET /api/w/:slug, which is
    // T052's job. This placeholder is deliberately temporary; T052 replaces
    // this branch outright rather than extending it.
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-muted-foreground">{t("wishlist.visitorViewComingSoon")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{wishlist.title}</h1>
      <div className="mt-6">
        <ItemGrid items={wishlist.items} />
      </div>
    </div>
  );
}

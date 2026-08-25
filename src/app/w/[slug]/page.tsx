import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { t } from "@/lib/i18n";
import { config } from "@/server/config";

import { ogImageUrl, shareDescription, shareTitle } from "./og-metadata";
import { OwnerView } from "./owner-view";
import { VisitorView } from "./visitor-view";
import { findOwnedWishlists, findPublicWishlist } from "./wishlist-data";

type Props = { params: Promise<{ slug: string }> };

/**
 * Full OG treatment only applies to the public branch — `{displayName}`
 * comes from `ownerDisplayName`, a field `MyWishlist` doesn't have, and a
 * logged-in owner previewing their own link is never crawled by WhatsApp
 * (crawlers carry no session cookie) — see T058's task file § Design
 * decisions. `images` is only set when a live item actually has one; when
 * it's omitted, Next falls through to `opengraph-image.tsx`'s generated
 * card on its own.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const owned = (await findOwnedWishlists())?.find((w) => w.slug === slug);
  if (owned) return { title: owned.title };

  const publicWishlist = await findPublicWishlist(slug);
  if (!publicWishlist) return { title: t("common.appName") };

  const title = shareTitle(publicWishlist);
  const description = shareDescription(publicWishlist.items.length);
  const imageUrl = ogImageUrl(publicWishlist.items, config.APP_URL);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
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

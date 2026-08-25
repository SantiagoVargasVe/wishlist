import { t } from "@/lib/i18n";
import type { PublicVisitorItem, PublicVisitorWishlist } from "@/server/services/public-wishlist";

/** `"{ownerDisplayName} — {title}"` — the format docs/frontend/CLAUDE.md specifies for the share page. */
export function shareTitle(wishlist: Pick<PublicVisitorWishlist, "title" | "ownerDisplayName">): string {
  return t("wishlist.shareMetaTitle", { name: wishlist.ownerDisplayName, title: wishlist.title });
}

/** Correctly pluralized in Spanish — "1 artículo" is not "1 artículos". */
export function shareDescription(itemCount: number): string {
  return itemCount === 1 ? t("wishlist.itemsCountOne") : t("wishlist.itemsCount", { n: itemCount });
}

/**
 * The first live item with a stored image, as an absolute URL a crawler can
 * fetch directly — `null` when none exists (every item today, since T033's
 * download pipeline doesn't exist yet), which is the caller's signal to fall
 * through to the generated `opengraph-image.tsx` card instead.
 */
export function ogImageUrl(items: PublicVisitorItem[], appUrl: string): string | null {
  const withImage = items.find((item) => item.imagePath !== null);
  return withImage ? `${appUrl}/media/${withImage.imagePath}` : null;
}

"use client";

import { useWishlistQuery } from "@/lib/api/queries";
import { t } from "@/lib/i18n";
import type { PublicVisitorWishlist } from "@/server/services/public-wishlist";

import { VisitorItemCard } from "./visitor-item-card";

/**
 * Client component: the claim/undo buttons need TanStack Query's cache for
 * the optimistic flip (design-system.md § Data). `initialWishlist` is T052's
 * SSR data, passed straight in as `useQuery`'s `initialData` — no extra
 * round trip on first paint.
 */
export function VisitorItemGrid({
  slug,
  initialWishlist,
}: {
  slug: string;
  initialWishlist: PublicVisitorWishlist;
}) {
  const { data } = useWishlistQuery(slug, initialWishlist);

  if (data.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("wishlist.empty")}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {data.items.map((item) => (
        <VisitorItemCard key={item.id} slug={slug} item={item} />
      ))}
    </div>
  );
}

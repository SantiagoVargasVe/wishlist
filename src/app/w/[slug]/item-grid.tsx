import { t } from "@/lib/i18n";
import type { MyWishlist } from "@/server/services/me";
import type { PublicItem } from "@/server/services/items";

import { ItemCard } from "./item-card";

/**
 * `wishlists` (every list the owner has, not just this one) is what lets
 * each card know whether removing itself from `wishlistId` would be its
 * *last* membership — see item-actions.tsx / RemoveFromListButton.
 */
export function ItemGrid({
  items,
  wishlistId,
  wishlists,
}: {
  items: PublicItem[];
  wishlistId: string;
  wishlists: MyWishlist[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("wishlist.empty")}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => {
        const membershipCount = wishlists.filter((w) => w.items.some((i) => i.id === item.id)).length;
        return (
          <ItemCard key={item.id} item={item} wishlistId={wishlistId} isLastList={membershipCount <= 1} />
        );
      })}
    </div>
  );
}

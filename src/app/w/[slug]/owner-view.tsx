import type { MyWishlist } from "@/server/services/me";

import { AddItemModal } from "./add-item-modal";
import { ItemGrid } from "./item-grid";

export function OwnerView({
  wishlist,
  wishlists,
}: {
  wishlist: MyWishlist;
  wishlists: MyWishlist[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{wishlist.title}</h1>
        <AddItemModal wishlists={wishlists} currentWishlistId={wishlist.id} />
      </div>
      <div className="mt-6">
        <ItemGrid items={wishlist.items} />
      </div>
    </div>
  );
}

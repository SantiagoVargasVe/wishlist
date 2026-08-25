import type { MyWishlist } from "@/server/services/me";

import { AddItemModal } from "./add-item-modal";
import { CreateWishlistModal } from "./create-wishlist-modal";
import { DeleteWishlistButton } from "./delete-wishlist-button";
import { ItemGrid } from "./item-grid";
import { RenameWishlistModal } from "./rename-wishlist-modal";

export function OwnerView({
  wishlist,
  wishlists,
}: {
  wishlist: MyWishlist;
  wishlists: MyWishlist[];
}) {
  // Always exists (every user gets exactly one on registration, and it can
  // never be deleted) — the fallback is only for a state that shouldn't
  // occur, not a real branch this ever takes.
  const defaultWishlist = wishlists.find((w) => w.isDefault) ?? wishlist;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{wishlist.title}</h1>
          <RenameWishlistModal wishlist={wishlist} />
          {!wishlist.isDefault && (
            <DeleteWishlistButton wishlist={wishlist} redirectSlug={defaultWishlist.slug} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <CreateWishlistModal />
          <AddItemModal wishlists={wishlists} currentWishlistId={wishlist.id} />
        </div>
      </div>
      <div className="mt-6">
        <ItemGrid items={wishlist.items} wishlistId={wishlist.id} wishlists={wishlists} />
      </div>
    </div>
  );
}

import type { MyWishlist } from "@/server/services/me";

import { ItemGrid } from "./item-grid";

export function OwnerView({ wishlist }: { wishlist: MyWishlist }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{wishlist.title}</h1>
      <div className="mt-6">
        <ItemGrid items={wishlist.items} />
      </div>
    </div>
  );
}

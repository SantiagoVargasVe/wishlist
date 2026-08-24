import { t } from "@/lib/i18n";
import type { PublicVisitorWishlist } from "@/server/services/public-wishlist";

import { VisitorItemGrid } from "./visitor-item-grid";

export function VisitorView({ wishlist }: { wishlist: PublicVisitorWishlist }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{wishlist.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("wishlist.byOwner", { name: wishlist.ownerDisplayName })}
      </p>
      <div className="mt-6">
        <VisitorItemGrid items={wishlist.items} />
      </div>
    </div>
  );
}

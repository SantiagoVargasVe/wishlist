import { t } from "@/lib/i18n";
import type { PublicItem } from "@/server/services/items";

import { ItemCard } from "./item-card";

export function ItemGrid({ items }: { items: PublicItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("wishlist.empty")}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}

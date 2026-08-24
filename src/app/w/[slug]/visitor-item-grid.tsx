import { t } from "@/lib/i18n";
import type { PublicVisitorItem } from "@/server/services/public-wishlist";

import { VisitorItemCard } from "./visitor-item-card";

export function VisitorItemGrid({ items }: { items: PublicVisitorItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("wishlist.empty")}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <VisitorItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}

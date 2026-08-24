import Image from "next/image";

import { formatMoney } from "@/lib/money";
import { t } from "@/lib/i18n";
import type { PublicItem } from "@/server/services/items";

/**
 * Read-only for now — the only owner interaction this task builds is the
 * outbound link. Edit/delete lands in T054.
 */
export function ItemCard({ item }: { item: PublicItem }) {
  const price =
    item.priceAmount && item.priceCurrency
      ? formatMoney(item.priceAmount, item.priceCurrency)
      : null;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-colors hover:border-primary"
    >
      <div className="flex aspect-square items-center justify-center bg-muted">
        {item.imagePath ? (
          <Image
            src={`/media/${item.imagePath}`}
            alt=""
            width={400}
            height={400}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm text-muted-foreground">{t("wishlist.noImage")}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
        {price && <p className="text-sm text-muted-foreground">{price}</p>}
      </div>
    </a>
  );
}

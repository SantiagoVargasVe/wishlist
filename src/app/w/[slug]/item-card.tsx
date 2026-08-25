import Image from "next/image";

import { formatMoney } from "@/lib/money";
import { t } from "@/lib/i18n";
import type { PublicItem } from "@/server/services/items";

import { ItemActions } from "./item-actions";

/**
 * The title (not the whole card) is the outbound link — the same call
 * `VisitorItemCard` (T052) made, and for the same reason: the actions row
 * below (T054) needs room without nesting interactive elements inside an
 * anchor.
 */
export function ItemCard({
  item,
  wishlistId,
  isLastList,
}: {
  item: PublicItem;
  wishlistId: string;
  isLastList: boolean;
}) {
  const price =
    item.priceAmount && item.priceCurrency
      ? formatMoney(item.priceAmount, item.priceCurrency)
      : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
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
      <div className="flex flex-1 flex-col gap-2 p-3">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-sm font-medium hover:underline"
        >
          {item.title}
        </a>
        {price && <p className="text-sm text-muted-foreground">{price}</p>}
        <ItemActions item={item} wishlistId={wishlistId} isLastList={isLastList} />
      </div>
    </div>
  );
}

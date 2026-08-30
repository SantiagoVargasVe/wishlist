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
    <div className="flex h-[26rem] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {/* Fixed height, not aspect-square: aspect-square ties height to the
          grid column's width, which varies across breakpoints and column
          counts — a fixed height keeps every card the same regardless.
          object-cover (T089) to match what a guest sees on `VisitorItemCard`
          — the owner reviews their list next to the link they share, so
          consistency wins over T080's original never-crop preference; the
          bg-muted fill still backs the no-image placeholder. */}
      <div className="flex h-48 shrink-0 items-center justify-center bg-muted">
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
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-3">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          // min-h reserves the same space whether the title wraps to one
          // line or two, so a short title doesn't pull the price/actions
          // below it up and make cards in the same row look uneven.
          className="line-clamp-2 min-h-10 text-sm font-medium hover:underline"
        >
          {item.title}
        </a>
        {/* Always rendered, even with no price — an item with no price
            would otherwise be one line shorter than its row-mates. */}
        <p className="text-sm text-muted-foreground">
          {price && item.priceCurrency ? `${price} ${item.priceCurrency}` : " "}
        </p>
        <div className="mt-auto">
          <ItemActions item={item} wishlistId={wishlistId} isLastList={isLastList} />
        </div>
      </div>
    </div>
  );
}

import { formatMoney } from "@/lib/money";
import type { PublicItem } from "@/server/services/items";

import { ItemActions } from "./item-actions";
import { ItemImage } from "./item-image";

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

  // No fixed card height any more (T114 reverses T080's h-[26rem] / h-48): a
  // fixed-height frame has a different aspect ratio at every column width, so
  // no image shape fills it. Cards still come out even — every card in a row
  // has the same square frame, the content below has a constant height, and
  // the grid stretches the row.
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <ItemImage imagePath={item.imagePath} />
      <div className="flex flex-1 flex-col gap-2 p-3">
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

import { t } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { PublicVisitorItem } from "@/server/services/public-wishlist";

import { ClaimButton } from "./claim-button";
import { ItemImage } from "./item-image";

/**
 * The title (not the whole card) is the outbound link, deliberately, so the
 * claim/undo button below has room without nesting interactive elements.
 */
export function VisitorItemCard({ slug, item }: { slug: string; item: PublicVisitorItem }) {
  const price =
    item.priceAmount && item.priceCurrency
      ? formatMoney(item.priceAmount, item.priceCurrency)
      : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <ItemImage imagePath={item.imagePath} imageVersion={item.ogFetchedAt}>
        {item.claimed && (
          <span className="absolute top-2 right-2 rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
            {t("wishlist.claimed")}
          </span>
        )}
      </ItemImage>
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
        {/* Pinned to the bottom so buttons line up across a row whether a
            title wraps to one line or two. flex-col keeps it full width. */}
        <div className="mt-auto flex flex-col">
          <ClaimButton slug={slug} item={item} />
        </div>
      </div>
    </div>
  );
}

import Image from "next/image";

import { t } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { PublicVisitorItem } from "@/server/services/public-wishlist";

/**
 * Read-only, same as T051's owner card — the claim/unclaim button is T041.
 * The title (not the whole card) is the outbound link, deliberately, so
 * T041 has room to add a button below without nesting interactive elements.
 */
export function VisitorItemCard({ item }: { item: PublicVisitorItem }) {
  const price =
    item.priceAmount && item.priceCurrency
      ? formatMoney(item.priceAmount, item.priceCurrency)
      : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <div className="relative flex aspect-square items-center justify-center bg-muted">
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
        {item.claimed && (
          <span className="absolute top-2 right-2 rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
            {t("wishlist.claimed")}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-sm font-medium hover:underline"
        >
          {item.title}
        </a>
        {price && <p className="text-sm text-muted-foreground">{price}</p>}
      </div>
    </div>
  );
}

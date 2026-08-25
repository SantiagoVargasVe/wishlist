import Link from "next/link";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { MyWishlist } from "@/server/services/me";

/**
 * Real navigation between routes, not a client-side panel swap — plain
 * `<Link>`s with `aria-current`, not Base UI's `Tabs` (that primitive's
 * `tablist`/`tabpanel` contract assumes switching content in place). No
 * client JS needed, so this stays a Server Component.
 *
 * Hidden entirely at one list — a switcher with nothing to switch between
 * is clutter, and every account starts with exactly one.
 */
export function WishlistFilter({
  wishlists,
  currentId,
}: {
  wishlists: MyWishlist[];
  currentId: string;
}) {
  if (wishlists.length <= 1) return null;

  return (
    <nav aria-label={t("wishlist.filterLabel")} className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {wishlists.map((wishlist) => {
        const isCurrent = wishlist.id === currentId;
        return (
          <Link
            key={wishlist.id}
            href={`/w/${wishlist.slug}`}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              isCurrent
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            {wishlist.title}
          </Link>
        );
      })}
    </nav>
  );
}

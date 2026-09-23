import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";

/**
 * The item photo's frame, shared by the owner and visitor cards so the two
 * can't drift apart again (T089, T114).
 *
 * Square at every breakpoint and never sized by its image: `overflow-hidden`
 * turns off the content-based minimum height an `aspect-ratio` box otherwise
 * gets, and `fill` takes the image out of flow. Without them a 0.31:1 bottle
 * made its "square" frame three times taller than wide, and the grid
 * stretched the whole row to match.
 *
 * `object-cover` is safe because packshots on white are stored as square tiles
 * already (src/server/og/packshot.ts), so they show whole. Only full-bleed
 * photos lose an edge, and those crop well.
 *
 * `children` renders over the image — the visitor card's "claimed" badge.
 */
export function ItemImage({
  imagePath,
  className,
  children,
}: {
  imagePath: string | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-square shrink-0 items-center justify-center overflow-hidden bg-muted",
        className,
      )}
    >
      {imagePath ? (
        <Image
          src={mediaUrl(imagePath)}
          alt=""
          fill
          // One column below `sm`; from there, the grid's widest column is
          // about 360px (two columns in a max-w-3xl container).
          sizes="(min-width: 640px) 360px, 100vw"
          className="object-cover"
        />
      ) : (
        <span className="text-sm text-muted-foreground">{t("wishlist.noImage")}</span>
      )}
      {children}
    </div>
  );
}

import { ImageResponse } from "next/og";

import { t } from "@/lib/i18n";

import { shareTitle } from "./og-metadata";
import { findPublicWishlist } from "./wishlist-data";

export const alt = "Wishlist";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Hex equivalents of globals.css's light-theme `--primary` / `--primary-foreground` —
// Satori (the renderer behind ImageResponse) doesn't support oklch().
const BACKGROUND = "#8a79ab";
const FOREGROUND = "#f8f7fa";

const MAX_TITLE_LENGTH = 60;

type Props = { params: Promise<{ slug: string }> };

/**
 * Next's own file-convention fallback for `og:image` — used automatically
 * whenever `generateMetadata()` doesn't set `openGraph.images` itself (see
 * page.tsx). Only the public path is meaningful here: WhatsApp's crawler
 * fetches this route as a second, unauthenticated request, so it never
 * carries the cookie an owned wishlist would need — an unknown or
 * owner-only slug just renders the generic branded card.
 */
export default async function Image({ params }: Props) {
  const { slug } = await params;
  const publicWishlist = await findPublicWishlist(slug);

  const title = publicWishlist ? shareTitle(publicWishlist) : t("common.appName");
  const truncated =
    title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BACKGROUND,
          fontFamily: "sans-serif",
          padding: "0 96px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: FOREGROUND,
            opacity: 0.75,
          }}
        >
          {t("common.appName")}
        </div>
        <div
          style={{ marginTop: 28, fontSize: 64, fontWeight: 700, lineHeight: 1.2, color: FOREGROUND }}
        >
          {truncated}
        </div>
      </div>
    ),
    size,
  );
}

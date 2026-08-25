import type { CheerioAPI } from "cheerio";

type DynamicImageMap = Record<string, unknown>;

/**
 * Amazon's product image lives only in `data-a-dynamic-image`, a JSON map of
 * `{ imageUrl: [width, height] }` on the main product `<img>` — not `og:image`,
 * `twitter:image`, or JSON-LD, confirmed live (see T035's task file). Picks the
 * largest-area entry, since the map typically lists several resolutions of the
 * same picture.
 */
export function extractAmazonImage($: CheerioAPI): string | null {
  const raw = $("#landingImage, #imgBlkFront").first().attr("data-a-dynamic-image");
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  let best: { url: string; area: number } | null = null;
  for (const [url, dims] of Object.entries(parsed as DynamicImageMap)) {
    if (!Array.isArray(dims) || dims.length !== 2) continue;
    const [width, height] = dims as unknown[];
    if (typeof width !== "number" || typeof height !== "number") continue;

    const area = width * height;
    if (!best || area > best.area) best = { url, area };
  }

  return best?.url ?? null;
}

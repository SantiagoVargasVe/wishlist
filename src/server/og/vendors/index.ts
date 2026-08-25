import type { CheerioAPI } from "cheerio";

import { extractAmazonImage } from "./amazon";

type VendorImageExtractor = ($: CheerioAPI) => string | null;

/**
 * Hostname-keyed, not attribute-sniffed: matching `pageUrl` first (rather than
 * checking every page for `data-a-dynamic-image`) keeps a coincidentally-named
 * attribute on an unrelated site from being misread as a product image. One
 * vendor today — a second extends this array, not the shape of it.
 */
const VENDORS: { hostnamePattern: RegExp; extract: VendorImageExtractor }[] = [
  { hostnamePattern: /(^|\.)amazon\.[a-z.]+$/i, extract: extractAmazonImage },
];

/** Lowest-precedence `imageUrl` source in `parser.ts` — only reached when no standard tag matched. */
export function resolveVendorImage($: CheerioAPI, pageUrl: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    return null;
  }

  const vendor = VENDORS.find((v) => v.hostnamePattern.test(hostname));
  return vendor ? vendor.extract($) : null;
}

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

import { resolveVendorImage } from "./vendors";

/**
 * Pure HTML → structured metadata. No fetching (safeFetch, T030), no
 * caching, no endpoint (T032) — a `cheerio.load(html)` in, a plain object
 * out. Every field is a best-effort prefill suggestion: a page with none of
 * a field's sources present resolves that field to `null`, never throws —
 * see root CLAUDE.md's non-negotiable #2.
 */
export type ParsedProduct = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  /** Plain decimal string, e.g. "49.99" — never a float. */
  priceAmount: string | null;
  /** Best-effort ISO 4217, e.g. "USD" — not filtered to this app's supported currencies; that's a caller decision. */
  priceCurrency: string | null;
};

const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SITE_NAME_LENGTH = 100;

type JsonLdOffer = {
  "@type"?: string;
  price?: string | number;
  priceCurrency?: string;
  lowPrice?: string | number;
  /** Usually a schema.org URL (`https://schema.org/InStock`), sometimes the bare token. */
  availability?: string;
};

type JsonLdProduct = {
  name?: string;
  description?: string;
  image?: string | { url?: string } | (string | { url?: string })[];
  offers?: JsonLdOffer | JsonLdOffer[];
  /** Present on a `ProductGroup`: one `Product` per size/colour, each with its own `offers`. */
  hasVariant?: JsonLdProduct[];
};

/**
 * Untrusted scraped content (security.md § Input handling): trim, collapse
 * whitespace, strip control characters and anything tag-shaped, then cap the
 * length. Limits match `createItemSchema`'s own (title 300, notes/description
 * 2000) so a full-length scrape is never double-truncated downstream.
 *
 * Also strips U+FFFD (the replacement character) alongside the raw
 * control-char range: per the HTML spec, `cheerio.load` itself replaces a
 * literal NUL byte with U+FFFD during tokenization, so a NUL never reaches
 * this function as `\x00` — confirmed empirically, not assumed.
 */
function clean(raw: string | undefined | null, maxLength: number): string | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F�]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? stripped.slice(0, maxLength) : null;
}

function metaContent($: CheerioAPI, selector: string): string | undefined {
  return $(selector).first().attr("content")?.trim() || undefined;
}

/**
 * The OG spec calls for `property="og:x"`, but plenty of real sites (MDN's
 * own docs pages, confirmed live while testing this against a real fetch)
 * use `name="og:x"` instead. Checking both costs nothing and is strictly
 * more correct than trusting every site to follow the spec.
 */
function ogMeta($: CheerioAPI, key: string): string | undefined {
  return metaContent($, `meta[property="og:${key}"]`) ?? metaContent($, `meta[name="og:${key}"]`);
}

/**
 * `ProductGroup` counts as well as `Product`. Plenty of retailers publish one
 * node for the garment and a `hasVariant` array of `Product`s beneath it, one
 * per size/colour — Zara does, and matching only `Product` meant walking past
 * a title, description, image and price that were all sitting right there.
 */
const PRODUCT_TYPES = ["Product", "ProductGroup"];

function isProductType(type: unknown): boolean {
  if (typeof type === "string") return PRODUCT_TYPES.includes(type);
  return Array.isArray(type) && type.some((t) => typeof t === "string" && PRODUCT_TYPES.includes(t));
}

function findProductNode(node: unknown): JsonLdProduct | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }

  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (isProductType(obj["@type"])) return obj as JsonLdProduct;
    if (Array.isArray(obj["@graph"])) return findProductNode(obj["@graph"]);
  }

  return null;
}

/** First parseable `Product`/`ProductGroup` block across every `ld+json` script — malformed ones are skipped, not fatal. */
function findJsonLdProduct($: CheerioAPI): JsonLdProduct | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const product = findProductNode(JSON.parse($(el).text()));
      if (product) return product;
    } catch {
      // Hostile or just broken markup — try the next script block.
    }
  }
  return null;
}

function jsonLdImage(product: JsonLdProduct | null): string | undefined {
  const image = product?.image;
  const first = Array.isArray(image) ? image[0] : image;
  if (typeof first === "string") return first;
  if (first && typeof first === "object") return first.url;
  return undefined;
}

/** Matches both `https://schema.org/InStock` and a bare `InStock`. */
const IN_STOCK_PATTERN = /(^|\/)InStock$/i;

type VariantPrice = { amount: string; currency?: string; inStock: boolean; numeric: number };

function offerAmount(offer: JsonLdOffer): { amount?: string; currency?: string } {
  const raw = offer.price ?? offer.lowPrice;
  return { amount: raw === undefined ? undefined : String(raw), currency: offer.priceCurrency };
}

/**
 * Every offer across every variant, flattened. Anything malformed — a
 * `hasVariant` that isn't an array, a non-object entry, an offer with no
 * price, a price that isn't a finite number — is skipped rather than throwing,
 * matching the rest of this module: a page we can't read resolves to `null`,
 * it never fails the preview (root CLAUDE.md non-negotiable #2).
 */
function variantPrices(product: JsonLdProduct): VariantPrice[] {
  const variants = Array.isArray(product.hasVariant) ? product.hasVariant : [];
  const prices: VariantPrice[] = [];

  for (const variant of variants) {
    if (!variant || typeof variant !== "object") continue;
    const offers = variant.offers;
    const list = Array.isArray(offers) ? offers : offers ? [offers] : [];

    for (const offer of list) {
      if (!offer || typeof offer !== "object") continue;
      const { amount, currency } = offerAmount(offer);
      if (amount === undefined) continue;
      const numeric = Number(amount);
      if (!Number.isFinite(numeric)) continue;
      prices.push({
        amount,
        currency,
        numeric,
        inStock: IN_STOCK_PATTERN.test(offer.availability ?? ""),
      });
    }
  }

  return prices;
}

/**
 * A `ProductGroup` carries no price of its own; each variant does, and they
 * genuinely differ. On the real Zara page this was built against, the *first*
 * variant was `OutOfStock` at 9.98 while others differed — so `hasVariant[0]`
 * would have quoted a price nobody can actually buy.
 *
 * Cheapest in-stock variant, falling back to cheapest overall when nothing is
 * in stock. Cheapest matches the "from $X" a shopper expects on a page with
 * per-size pricing, and preferring in-stock stops a sold-out clearance size
 * from setting the headline. Like every other field here it's a prefill
 * suggestion the user can edit, not a quote.
 */
function jsonLdPrice(product: JsonLdProduct | null): { amount?: string; currency?: string } {
  if (!product) return {};

  // A node's own offers win outright — this is the path every plain `Product`
  // page takes, and its behaviour is deliberately unchanged.
  const offers = product.offers;
  const own = Array.isArray(offers) ? offers[0] : offers;
  if (own) {
    const { amount, currency } = offerAmount(own);
    if (amount !== undefined) return { amount, currency };
  }

  const prices = variantPrices(product);
  if (prices.length === 0) return {};

  const inStock = prices.filter((p) => p.inStock);
  const pool = inStock.length > 0 ? inStock : prices;
  const cheapest = pool.reduce((best, p) => (p.numeric < best.numeric ? p : best));

  return { amount: cheapest.amount, currency: cheapest.currency };
}

/**
 * Only resolves a price when an explicit 3-letter currency code is present
 * in the paired data value — a bare "$" is genuinely ambiguous between USD
 * and COP for this app, and guessing wrong is a real correctness bug (a
 * mistagged $1,300,000 COP item reads nothing like $1.3M USD).
 */
function twitterPrice($: CheerioAPI): { amount?: string; currency?: string } {
  let result: { amount?: string; currency?: string } = {};

  $('meta[name^="twitter:label"]').each((_, el) => {
    const label = $(el).attr("content")?.trim().toLowerCase();
    if (!label?.includes("price")) return undefined;

    const suffix = $(el).attr("name")?.replace("twitter:label", "") ?? "";
    const data = $(`meta[name="twitter:data${suffix}"]`).attr("content")?.trim();
    const code = data?.match(/\b([A-Za-z]{3})\b/);
    if (!data || !code) return undefined;

    result = { amount: data, currency: code[1] };
    return false; // stop at the first price-labeled pair
  });

  return result;
}

/**
 * Handles both common thousands/decimal conventions — `1,300.50` (US) and
 * `1.300,50` / `1.300.000` (COP and most of the rest of the world) — by
 * trying each shape in turn. Anything that doesn't confidently match either,
 * or that falls outside `numeric(14,2)`'s bounds, is `null` rather than a
 * guess.
 */
function normalizeAmount(raw: string | undefined): string | null {
  if (!raw) return null;

  const value = raw
    .trim()
    .replace(/^[A-Za-z$€£¥]+\s*/, "")
    .replace(/\s*[A-Za-z$€£¥]+$/, "")
    .trim();

  let normalized: string | null = null;
  if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(value)) {
    normalized = value.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(value)) {
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+(\.\d{1,2})?$/.test(value)) {
    normalized = value;
  }
  if (!normalized) return null;

  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return null;

  const [intPart, decPart] = normalized.split(".");
  if (intPart.length > 12 || (decPart && decPart.length > 2)) return null;

  return normalized;
}

function normalizeCurrency(raw: string | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** Amount and currency are a pair — a candidate only counts if both normalize. */
function extractPrice(
  $: CheerioAPI,
  product: JsonLdProduct | null,
): { priceAmount: string | null; priceCurrency: string | null } {
  const candidates = [
    jsonLdPrice(product),
    {
      amount: metaContent($, 'meta[property="product:price:amount"]'),
      currency: metaContent($, 'meta[property="product:price:currency"]'),
    },
    twitterPrice($),
  ];

  for (const candidate of candidates) {
    const priceAmount = normalizeAmount(candidate.amount);
    const priceCurrency = normalizeCurrency(candidate.currency);
    if (priceAmount && priceCurrency) return { priceAmount, priceCurrency };
  }

  return { priceAmount: null, priceCurrency: null };
}

function extractTitle($: CheerioAPI, product: JsonLdProduct | null): string | null {
  const raw =
    ogMeta($, "title") ?? metaContent($, 'meta[name="twitter:title"]') ?? product?.name ?? $("title").first().text();
  return clean(raw, MAX_TITLE_LENGTH);
}

function extractDescription($: CheerioAPI, product: JsonLdProduct | null): string | null {
  const raw =
    ogMeta($, "description") ??
    metaContent($, 'meta[name="twitter:description"]') ??
    product?.description ??
    metaContent($, 'meta[name="description"]');
  return clean(raw, MAX_DESCRIPTION_LENGTH);
}

/**
 * Not every site emits an absolute image URL despite the spec asking for one.
 * `resolveVendorImage` is the lowest-precedence source — some pages (Amazon,
 * see T035) expose no standard image tag at all, only a vendor-proprietary
 * one; any standard tag a site does provide still wins outright.
 */
function extractImageUrl($: CheerioAPI, product: JsonLdProduct | null, pageUrl: string): string | null {
  const raw =
    ogMeta($, "image:secure_url") ??
    ogMeta($, "image") ??
    metaContent($, 'meta[name="twitter:image"]') ??
    metaContent($, 'meta[name="twitter:image:src"]') ??
    jsonLdImage(product) ??
    resolveVendorImage($, pageUrl) ??
    undefined;
  if (!raw) return null;

  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}

function extractSiteName($: CheerioAPI, pageUrl: string): string | null {
  const raw = ogMeta($, "site_name");
  if (raw) return clean(raw, MAX_SITE_NAME_LENGTH);

  try {
    return clean(new URL(pageUrl).hostname, MAX_SITE_NAME_LENGTH);
  } catch {
    return null;
  }
}

export function parseProductMetadata(html: string, pageUrl: string): ParsedProduct {
  const $ = cheerio.load(html);
  const product = findJsonLdProduct($);

  return {
    title: extractTitle($, product),
    description: extractDescription($, product),
    imageUrl: extractImageUrl($, product, pageUrl),
    siteName: extractSiteName($, pageUrl),
    ...extractPrice($, product),
  };
}

import "server-only";

import { createHash } from "node:crypto";

import { and, eq, gt, sql } from "drizzle-orm";

import { config } from "../config";
import { getDb } from "../db";
import { ogCache } from "../db/schema";
import type { Db } from "../db/types";
import { safeFetch } from "../net/safe-fetch";
import { parseProductMetadata } from "./parser";
import { SUPPORTED_CURRENCIES } from "./supported-currencies";
import { resolveMercadoLibrePreview } from "./vendors/mercadolibre/resolve";

export type PreviewResult = {
  title: string | null;
  imageUrl: string | null;
  price: string | null;
  currency: string | null;
  siteName: string | null;
  ogStatus: "ok" | "failed";
};

/** The fragment never affects what a server returns, and stripping it means #foo/#bar variants of one page share a cache entry. */
function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  return url.toString();
}

function hashUrl(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

async function getCached(urlHash: string, db: Db): Promise<PreviewResult | null> {
  const [row] = await db
    .select({ payload: ogCache.payload })
    .from(ogCache)
    .where(
      and(
        eq(ogCache.urlHash, urlHash),
        gt(ogCache.fetchedAt, sql`now() - make_interval(hours => ${config.OG_CACHE_TTL_HOURS})`),
      ),
    )
    .limit(1);

  return row ? (row.payload as PreviewResult) : null;
}

async function writeCache(urlHash: string, result: PreviewResult, db: Db): Promise<void> {
  await db
    .insert(ogCache)
    .values({ urlHash, payload: result })
    .onConflictDoUpdate({
      target: ogCache.urlHash,
      set: { payload: result, fetchedAt: sql`now()` },
    });
}

const FAILED_RESULT: PreviewResult = {
  title: null,
  imageUrl: null,
  price: null,
  currency: null,
  siteName: null,
  ogStatus: "failed",
};

/**
 * Fetches through `safeFetch` and parses via `parseProductMetadata`. Never
 * throws — a blocked/timed-out/unparseable page resolves to `ogStatus:
 * "failed"` with every field null, the same "prefill suggestion, not a
 * gate" contract the rest of the OG pipeline holds to.
 *
 * A MercadoLibre catalog-product URL (with `MELI_CLIENT_ID`/`MELI_CLIENT_SECRET`
 * configured) is resolved through their own API instead — confirmed live
 * (T036) that MercadoLibre 302s a generic `safeFetch` request to a bot-check
 * wall before any HTML is served, so falling through to the code below for
 * one of those URLs would only waste a timeout on a fetch that can't
 * succeed. `resolveMercadoLibrePreview` returns `null` only when the URL
 * isn't a MercadoLibre catalog link or credentials aren't configured; once
 * it commits to handling a URL it always returns a full result, `ogStatus`
 * "ok" or "failed", never partial.
 */
async function scrape(url: string): Promise<PreviewResult> {
  const meli = await resolveMercadoLibrePreview(
    url,
    config.MELI_CLIENT_ID,
    config.MELI_CLIENT_SECRET,
  ).catch((error: unknown) => {
    console.error(`resolveMercadoLibrePreview threw for ${url}:`, error);
    return null;
  });
  if (meli) return meli;

  let html: string;
  let finalUrl: string;
  try {
    const response = await safeFetch(url, {
      allowedContentTypePrefixes: ["text/html"],
      maxBytes: config.OG_MAX_HTML_BYTES,
      timeoutMs: config.OG_FETCH_TIMEOUT_MS,
      userAgent: config.OG_USER_AGENT,
    });
    html = response.body.toString("utf-8");
    finalUrl = response.finalUrl;
  } catch {
    return FAILED_RESULT;
  }

  const parsed = parseProductMetadata(html, finalUrl);
  // createItemSchema only accepts COP/USD — a price in any other currency is
  // real data the parser correctly extracted, but not one this form can use,
  // so it's dropped here rather than prefilling a value the save would reject.
  const supported = parsed.priceCurrency !== null && SUPPORTED_CURRENCIES.has(parsed.priceCurrency);

  return {
    title: parsed.title,
    imageUrl: parsed.imageUrl,
    price: supported ? parsed.priceAmount : null,
    currency: supported ? parsed.priceCurrency : null,
    siteName: parsed.siteName,
    ogStatus: "ok",
  };
}

/** `POST /api/preview`. Cache hit skips the fetch entirely; only a successful scrape is ever cached. */
export async function getPreview(url: string, db: Db = getDb()): Promise<PreviewResult> {
  const normalized = normalizeUrl(url);
  const urlHash = hashUrl(normalized);

  const cached = await getCached(urlHash, db);
  if (cached) return cached;

  const result = await scrape(url);
  if (result.ogStatus === "ok") await writeCache(urlHash, result, db);

  return result;
}

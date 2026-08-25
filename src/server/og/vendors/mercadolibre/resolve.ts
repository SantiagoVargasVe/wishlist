import "server-only";

import type { PreviewResult } from "../../preview";
import { SUPPORTED_CURRENCIES } from "../../supported-currencies";
import { getMeliAccessToken, type MeliTokenProvider } from "./token";

const API_BASE = "https://api.mercadolibre.com";

// `.../p/MCO43708014` — a catalog-product permalink. Confirmed live (T036)
// this is the *only* MercadoLibre link shape this integration can resolve:
// individual listing permalinks (`articulo.mercadolibre.com.co/MCO-xxxx-...`)
// need `GET /items/:id`, which returns `403 access_denied` for an app-level
// token no matter how live the item is — that needs the item's own seller
// to grant a real login-based consent, out of scope here. A non-catalog
// MercadoLibre URL simply doesn't match this pattern and resolves to `null`,
// falling through to whatever the generic path already does for it (fails,
// same as before this feature existed — not a regression).
const CATALOG_PERMALINK_PATTERN = /\/p\/([A-Za-z]{2,4}\d+)(?:[/?#]|$)/;
const HOSTNAME_PATTERN = /(^|\.)mercadolibre\.[a-z.]+$|(^|\.)mercadolivre\.com\.br$/i;

const FAILED_RESULT: PreviewResult = {
  title: null,
  imageUrl: null,
  price: null,
  currency: null,
  siteName: null,
  ogStatus: "failed",
};

type MeliProduct = { name?: string; pictures?: { url?: string }[] };
type MeliItemsResponse = { results?: { price?: number; currency_id?: string }[] };

function extractCatalogTarget(
  pageUrl: string,
): { productId: string; hostname: string } | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (!HOSTNAME_PATTERN.test(url.hostname)) return null;

  const match = CATALOG_PERMALINK_PATTERN.exec(url.pathname);
  return match ? { productId: match[1].toUpperCase(), hostname: url.hostname } : null;
}

/** First result is MercadoLibre's own ranking of competing offers for this catalog product — not necessarily the cheapest, but their best-ranked one, same signal a visitor sees first on the real page. */
async function fetchPrice(
  fetchImpl: typeof fetch,
  headers: HeadersInit,
  productId: string,
): Promise<{ price: string | null; currency: string | null }> {
  try {
    const response = await fetchImpl(`${API_BASE}/products/${productId}/items`, { headers });
    if (!response.ok) {
      console.error(`MercadoLibre /products/${productId}/items: HTTP ${response.status}`);
      return { price: null, currency: null };
    }

    const data = (await response.json()) as MeliItemsResponse;
    const first = data.results?.[0];
    if (first?.price === undefined || !first.currency_id) return { price: null, currency: null };
    if (!SUPPORTED_CURRENCIES.has(first.currency_id)) return { price: null, currency: null };

    return { price: String(first.price), currency: first.currency_id };
  } catch (error) {
    console.error(`MercadoLibre price lookup failed for ${productId}:`, error);
    return { price: null, currency: null };
  }
}

export type MeliResolveDeps = {
  fetchImpl?: typeof fetch;
  getAccessToken?: MeliTokenProvider;
};

/**
 * Resolves a MercadoLibre catalog-product URL via their official API.
 * Returns `null` only when this integration doesn't apply — not a
 * MercadoLibre catalog link, or `MELI_CLIENT_ID`/`MELI_CLIENT_SECRET` aren't
 * configured — signaling the caller to fall through to the generic scrape.
 * Once it commits to a URL it always returns a full `PreviewResult`
 * (`ogStatus: "ok"` or `"failed"`), never `null`, because a generic
 * `safeFetch` retry of the same URL is known (T036) to be doomed anyway.
 */
export async function resolveMercadoLibrePreview(
  pageUrl: string,
  clientId: string | undefined,
  clientSecret: string | undefined,
  deps: MeliResolveDeps = {},
): Promise<PreviewResult | null> {
  if (!clientId || !clientSecret) return null;

  const target = extractCatalogTarget(pageUrl);
  if (!target) return null;

  const fetchImpl = deps.fetchImpl ?? fetch;
  const getAccessToken = deps.getAccessToken ?? getMeliAccessToken;

  try {
    const token = await getAccessToken(clientId, clientSecret);
    const headers = { authorization: `Bearer ${token}`, accept: "application/json" };

    const productResponse = await fetchImpl(
      `${API_BASE}/products/${target.productId}`,
      { headers },
    );
    if (!productResponse.ok) {
      console.error(
        `MercadoLibre /products/${target.productId}: HTTP ${productResponse.status}`,
      );
      return FAILED_RESULT;
    }

    const product = (await productResponse.json()) as MeliProduct;
    const { price, currency } = await fetchPrice(fetchImpl, headers, target.productId);

    return {
      title: product.name ?? null,
      imageUrl: product.pictures?.[0]?.url ?? null,
      price,
      currency,
      siteName: target.hostname,
      ogStatus: "ok",
    };
  } catch (error) {
    console.error(`MercadoLibre resolution failed for ${pageUrl}:`, error);
    return FAILED_RESULT;
  }
}

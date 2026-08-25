import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../net/safe-fetch", () => ({ safeFetch: vi.fn() }));
vi.mock("./parser", () => ({ parseProductMetadata: vi.fn() }));
vi.mock("./vendors/mercadolibre/resolve", () => ({ resolveMercadoLibrePreview: vi.fn() }));

import { ogCache } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { safeFetch } from "../net/safe-fetch";
import { parseProductMetadata } from "./parser";
import { getPreview } from "./preview";
import { resolveMercadoLibrePreview } from "./vendors/mercadolibre/resolve";

const HTML_RESPONSE = {
  body: Buffer.from("<html></html>"),
  contentType: "text/html",
  finalUrl: "https://example.com/product",
};

const EMPTY_PARSED = {
  title: null,
  description: null,
  imageUrl: null,
  siteName: null,
  priceAmount: null,
  priceCurrency: null,
};

describe.skipIf(!hasTestDatabase)("getPreview", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    // preview.ts reads config lazily, so setting these before first use is
    // enough — same pattern jwt.test.ts uses. Unlike safe-fetch.ts, this
    // service is genuinely app-specific (OG_CACHE_TTL_HOURS is intrinsic to
    // what og_cache is for), so it's fine for it to read config directly;
    // it just means its tests need a minimal environment satisfied.
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.AUTH_SECRET = "x".repeat(48);
    process.env.APP_URL = "http://localhost:3000";

    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.sql`TRUNCATE og_cache RESTART IDENTITY CASCADE`;
    // Default: not a MercadoLibre URL (or credentials unset) — falls through
    // to the generic safeFetch path every existing test below exercises.
    // Overridden per-test in the "MercadoLibre catalog resolution" block.
    vi.mocked(resolveMercadoLibrePreview).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.mocked(safeFetch).mockReset();
    vi.mocked(parseProductMetadata).mockReset();
    vi.mocked(resolveMercadoLibrePreview).mockReset();
  });

  it("fetches and parses on a cache miss, then writes the cache", async () => {
    vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
    vi.mocked(parseProductMetadata).mockReturnValue({
      ...EMPTY_PARSED,
      title: "Widget",
      imageUrl: "https://cdn.example/w.jpg",
      priceAmount: "49.99",
      priceCurrency: "USD",
    });

    const result = await getPreview("https://example.com/product", ctx.db);

    expect(result).toEqual({
      title: "Widget",
      imageUrl: "https://cdn.example/w.jpg",
      price: "49.99",
      currency: "USD",
      siteName: null,
      ogStatus: "ok",
    });
    expect(safeFetch).toHaveBeenCalledTimes(1);

    const rows = await ctx.db.select().from(ogCache);
    expect(rows).toHaveLength(1);
  });

  it("skips safeFetch entirely on a cache hit", async () => {
    vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
    vi.mocked(parseProductMetadata).mockReturnValue({ ...EMPTY_PARSED, title: "Widget" });

    await getPreview("https://example.com/product", ctx.db);
    vi.mocked(safeFetch).mockClear();

    const second = await getPreview("https://example.com/product", ctx.db);

    expect(safeFetch).not.toHaveBeenCalled();
    expect(second.title).toBe("Widget");
  });

  it("treats an expired cache row as a miss", async () => {
    vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
    vi.mocked(parseProductMetadata).mockReturnValue({ ...EMPTY_PARSED, title: "First" });
    await getPreview("https://example.com/product", ctx.db);

    await ctx.db.update(ogCache).set({ fetchedAt: sql`now() - interval '1000 hours'` });

    vi.mocked(parseProductMetadata).mockReturnValue({ ...EMPTY_PARSED, title: "Second" });
    const result = await getPreview("https://example.com/product", ctx.db);

    expect(result.title).toBe("Second");
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it("resolves to ogStatus: failed rather than throwing when safeFetch fails", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("blocked"));

    const result = await getPreview("https://example.com/blocked", ctx.db);

    expect(result).toEqual({
      title: null,
      imageUrl: null,
      price: null,
      currency: null,
      siteName: null,
      ogStatus: "failed",
    });
  });

  it("does not cache a failed scrape", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("blocked"));
    await getPreview("https://example.com/blocked", ctx.db);

    const rows = await ctx.db.select().from(ogCache);
    expect(rows).toHaveLength(0);
  });

  // T088. The shape that caused this: a CDN bot-manager challenge answers 200
  // with a real HTML body, so nothing throws and nothing parses. Caching that
  // as "ok" served an empty form for a week with no way to retry.
  it("does not cache a scrape that parsed cleanly but found nothing", async () => {
    vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
    vi.mocked(parseProductMetadata).mockReturnValue({
      ...EMPTY_PARSED,
      siteName: "www.example.com",
    });

    const result = await getPreview("https://example.com/challenge", ctx.db);

    expect(result.ogStatus).toBe("ok");
    expect(result.title).toBeNull();
    expect(result.imageUrl).toBeNull();

    // siteName alone must not qualify — it falls back to the hostname, so it
    // is non-null even when the parse found absolutely nothing.
    expect(result.siteName).toBe("www.example.com");
    const rows = await ctx.db.select().from(ogCache);
    expect(rows).toHaveLength(0);
  });

  it("re-fetches on the next request after an empty scrape, rather than serving a cached blank", async () => {
    vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
    vi.mocked(parseProductMetadata).mockReturnValue({ ...EMPTY_PARSED });
    await getPreview("https://example.com/retry", ctx.db);

    // Whatever was blocking the first attempt is fixed — a new User-Agent, a
    // parser change. The retry must actually go out, not hit a cached blank.
    vi.mocked(parseProductMetadata).mockReturnValue({ ...EMPTY_PARSED, title: "Now Works" });
    const second = await getPreview("https://example.com/retry", ctx.db);

    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(second.title).toBe("Now Works");
  });

  it("caches a page that has a title but no image", async () => {
    vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
    vi.mocked(parseProductMetadata).mockReturnValue({ ...EMPTY_PARSED, title: "Imageless Product" });

    await getPreview("https://example.com/no-image", ctx.db);

    const rows = await ctx.db.select().from(ogCache);
    expect(rows).toHaveLength(1);
  });

  it("caches a page that has an image but no title", async () => {
    vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
    vi.mocked(parseProductMetadata).mockReturnValue({
      ...EMPTY_PARSED,
      imageUrl: "https://cdn.example/only.jpg",
    });

    await getPreview("https://example.com/no-title", ctx.db);

    const rows = await ctx.db.select().from(ogCache);
    expect(rows).toHaveLength(1);
  });

  it("drops a parsed price whose currency isn't COP or USD", async () => {
    vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
    vi.mocked(parseProductMetadata).mockReturnValue({
      ...EMPTY_PARSED,
      title: "Euro item",
      priceAmount: "19.99",
      priceCurrency: "EUR",
    });

    const result = await getPreview("https://example.com/euro", ctx.db);

    expect(result.price).toBeNull();
    expect(result.currency).toBeNull();
  });

  it("keeps a supported-currency price", async () => {
    vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
    vi.mocked(parseProductMetadata).mockReturnValue({
      ...EMPTY_PARSED,
      title: "COP item",
      priceAmount: "1300000",
      priceCurrency: "COP",
    });

    const result = await getPreview("https://example.com/cop", ctx.db);

    expect(result).toMatchObject({ price: "1300000", currency: "COP" });
  });

  describe("MercadoLibre catalog resolution (T036)", () => {
    it("uses the MercadoLibre result directly, without ever calling safeFetch", async () => {
      vi.mocked(resolveMercadoLibrePreview).mockResolvedValue({
        title: "Celular Samsung Galaxy A15",
        imageUrl: "https://http2.mlstatic.com/pic.jpg",
        price: "899000",
        currency: "COP",
        siteName: "www.mercadolibre.com.co",
        ogStatus: "ok",
      });

      const result = await getPreview(
        "https://www.mercadolibre.com.co/producto/p/MCO43708014",
        ctx.db,
      );

      expect(result.title).toBe("Celular Samsung Galaxy A15");
      expect(safeFetch).not.toHaveBeenCalled();
      expect(parseProductMetadata).not.toHaveBeenCalled();
    });

    it("caches a successful MercadoLibre resolution the same as a generic scrape", async () => {
      vi.mocked(resolveMercadoLibrePreview).mockResolvedValue({
        title: "Widget",
        imageUrl: null,
        price: null,
        currency: null,
        siteName: "www.mercadolibre.com.co",
        ogStatus: "ok",
      });

      await getPreview("https://www.mercadolibre.com.co/producto/p/MCO1", ctx.db);
      const rows = await ctx.db.select().from(ogCache);

      expect(rows).toHaveLength(1);
    });

    it("does not cache a failed MercadoLibre resolution", async () => {
      vi.mocked(resolveMercadoLibrePreview).mockResolvedValue({
        title: null,
        imageUrl: null,
        price: null,
        currency: null,
        siteName: null,
        ogStatus: "failed",
      });

      await getPreview("https://www.mercadolibre.com.co/producto/p/MCO1", ctx.db);
      const rows = await ctx.db.select().from(ogCache);

      expect(rows).toHaveLength(0);
    });

    it("falls through to the generic scrape when resolveMercadoLibrePreview returns null", async () => {
      vi.mocked(resolveMercadoLibrePreview).mockResolvedValue(null);
      vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
      vi.mocked(parseProductMetadata).mockReturnValue({ ...EMPTY_PARSED, title: "Generic" });

      const result = await getPreview("https://example.com/not-meli", ctx.db);

      expect(result.title).toBe("Generic");
      expect(safeFetch).toHaveBeenCalledTimes(1);
    });

    it("treats resolveMercadoLibrePreview throwing the same as returning null — falls through rather than failing the whole preview", async () => {
      vi.mocked(resolveMercadoLibrePreview).mockRejectedValue(new Error("unexpected"));
      vi.mocked(safeFetch).mockResolvedValue(HTML_RESPONSE);
      vi.mocked(parseProductMetadata).mockReturnValue({ ...EMPTY_PARSED, title: "Generic" });

      const result = await getPreview("https://www.mercadolibre.com.co/producto/p/MCO1", ctx.db);

      expect(result.title).toBe("Generic");
    });
  });
});

import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../net/safe-fetch", () => ({ safeFetch: vi.fn() }));
vi.mock("./parser", () => ({ parseProductMetadata: vi.fn() }));

import { ogCache } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { safeFetch } from "../net/safe-fetch";
import { parseProductMetadata } from "./parser";
import { getPreview } from "./preview";

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
  });

  afterEach(() => {
    vi.mocked(safeFetch).mockReset();
    vi.mocked(parseProductMetadata).mockReset();
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
});

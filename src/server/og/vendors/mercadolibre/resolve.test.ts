import { describe, expect, it, vi } from "vitest";

import { resolveMercadoLibrePreview } from "./resolve";

const CATALOG_URL =
  "https://www.mercadolibre.com.co/celular-samsung-galaxy-a15/p/MCO43708014";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

function fakeToken(token = "test-token") {
  return vi.fn().mockResolvedValue(token);
}

describe("resolveMercadoLibrePreview", () => {
  it("returns null when credentials aren't configured, without making any request", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveMercadoLibrePreview(CATALOG_URL, undefined, undefined, {
      fetchImpl,
    });

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null for a non-MercadoLibre URL", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveMercadoLibrePreview(
      "https://retailer.example/p/MCO43708014",
      "id",
      "secret",
      { fetchImpl },
    );

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null for a MercadoLibre URL that isn't a catalog-product permalink", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveMercadoLibrePreview(
      "https://articulo.mercadolibre.com.co/MCO-479157309-audifonos-_JM",
      "id",
      "secret",
      { fetchImpl },
    );

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves title, image, price, and currency for a real catalog-product URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Celular Samsung Galaxy A15",
          pictures: [{ url: "https://http2.mlstatic.com/pic.jpg" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ price: 899000, currency_id: "COP" }] }),
      );

    const result = await resolveMercadoLibrePreview(CATALOG_URL, "id", "secret", {
      fetchImpl,
      getAccessToken: fakeToken(),
    });

    expect(result).toEqual({
      title: "Celular Samsung Galaxy A15",
      imageUrl: "https://http2.mlstatic.com/pic.jpg",
      price: "899000",
      currency: "COP",
      siteName: "www.mercadolibre.com.co",
      ogStatus: "ok",
    });

    const [productCall, itemsCall] = fetchImpl.mock.calls;
    expect(productCall[0]).toBe("https://api.mercadolibre.com/products/MCO43708014");
    expect(itemsCall[0]).toBe("https://api.mercadolibre.com/products/MCO43708014/items");
    expect(productCall[1].headers.authorization).toBe("Bearer test-token");
  });

  it("resolves title and image with null price when nobody currently sells this product", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ name: "Widget", pictures: [] }))
      .mockResolvedValueOnce(jsonResponse({}, false)); // "No winners found", confirmed live

    const result = await resolveMercadoLibrePreview(CATALOG_URL, "id", "secret", {
      fetchImpl,
      getAccessToken: fakeToken(),
    });

    expect(result).toMatchObject({ title: "Widget", imageUrl: null, price: null, currency: null, ogStatus: "ok" });
  });

  it("drops a price in a currency the save form doesn't support", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ name: "Widget", pictures: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ price: 100, currency_id: "ARS" }] }));

    const result = await resolveMercadoLibrePreview(CATALOG_URL, "id", "secret", {
      fetchImpl,
      getAccessToken: fakeToken(),
    });

    expect(result).toMatchObject({ price: null, currency: null });
  });

  it("resolves to ogStatus: failed, not null, when the product lookup 404s — and logs why", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await resolveMercadoLibrePreview(CATALOG_URL, "id", "secret", {
      fetchImpl,
      getAccessToken: fakeToken(),
    });

    expect(result).toEqual({
      title: null,
      imageUrl: null,
      price: null,
      currency: null,
      siteName: null,
      ogStatus: "failed",
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("HTTP 404"));
    errorSpy.mockRestore();
  });

  it("resolves to ogStatus: failed, not null, when the token exchange itself fails — and logs why", async () => {
    const fetchImpl = vi.fn();
    const getAccessToken = vi.fn().mockRejectedValue(new Error("token exchange failed: 400"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await resolveMercadoLibrePreview(CATALOG_URL, "id", "secret", {
      fetchImpl,
      getAccessToken,
    });

    expect(result?.ogStatus).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("MercadoLibre resolution failed"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("matches other MercadoLibre country TLDs and mercadolivre.com.br", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ name: "Widget", pictures: [] }));

    for (const url of [
      "https://www.mercadolibre.com.ar/producto/p/MLA123",
      "https://www.mercadolivre.com.br/produto/p/MLB456",
    ]) {
      fetchImpl.mockClear();
      const result = await resolveMercadoLibrePreview(url, "id", "secret", {
        fetchImpl,
        getAccessToken: fakeToken(),
      });
      expect(result?.ogStatus).toBe("ok");
    }
  });
});

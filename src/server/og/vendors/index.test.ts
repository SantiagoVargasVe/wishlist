import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

import { resolveVendorImage } from "./index";

function loadWithLandingImage(): cheerio.CheerioAPI {
  const dynamicImage = JSON.stringify({ "https://m.media-amazon.com/images/only.jpg": [400, 400] });
  return cheerio.load(
    `<!doctype html><html><body><img id="landingImage" data-a-dynamic-image='${dynamicImage}'></body></html>`,
  );
}

describe("resolveVendorImage", () => {
  it("delegates to the Amazon extractor for an amazon.com URL", () => {
    const $ = loadWithLandingImage();
    expect(resolveVendorImage($, "https://www.amazon.com/dp/B0FK39FXJH")).toBe(
      "https://m.media-amazon.com/images/only.jpg",
    );
  });

  it("matches regional Amazon TLDs, not just .com", () => {
    const $ = loadWithLandingImage();
    expect(resolveVendorImage($, "https://www.amazon.co.uk/dp/B0FK39FXJH")).toBe(
      "https://m.media-amazon.com/images/only.jpg",
    );
  });

  it("does not delegate for an unrelated hostname, even with the same attribute present", () => {
    const $ = loadWithLandingImage();
    expect(resolveVendorImage($, "https://retailer.example/products/widget")).toBeNull();
  });

  it("does not match a hostname that merely contains \"amazon\" as a substring", () => {
    const $ = loadWithLandingImage();
    expect(resolveVendorImage($, "https://not-amazon.example/dp/x")).toBeNull();
  });

  it("returns null for a malformed pageUrl instead of throwing", () => {
    const $ = loadWithLandingImage();
    expect(resolveVendorImage($, "not a url")).toBeNull();
  });
});

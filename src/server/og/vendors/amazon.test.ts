import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

import { extractAmazonImage } from "./amazon";

function loadWithLandingImage(dynamicImageAttr: string | null): cheerio.CheerioAPI {
  const attr = dynamicImageAttr === null ? "" : ` data-a-dynamic-image='${dynamicImageAttr}'`;
  return cheerio.load(`<!doctype html><html><body><img id="landingImage"${attr}></body></html>`);
}

describe("extractAmazonImage", () => {
  it("picks the largest-area entry among several resolutions", () => {
    const $ = loadWithLandingImage(
      JSON.stringify({
        "https://m.media-amazon.com/images/small.jpg": [100, 100],
        "https://m.media-amazon.com/images/large.jpg": [1000, 1000],
        "https://m.media-amazon.com/images/medium.jpg": [500, 500],
      }),
    );
    expect(extractAmazonImage($)).toBe("https://m.media-amazon.com/images/large.jpg");
  });

  it("returns null when the attribute is missing entirely", () => {
    const $ = loadWithLandingImage(null);
    expect(extractAmazonImage($)).toBeNull();
  });

  it("returns null on malformed JSON instead of throwing", () => {
    const $ = loadWithLandingImage("{not valid json");
    expect(extractAmazonImage($)).toBeNull();
  });

  it("returns null when the JSON isn't an object (e.g. an array or a string)", () => {
    expect(extractAmazonImage(loadWithLandingImage(JSON.stringify(["a", "b"])))).toBeNull();
    expect(extractAmazonImage(loadWithLandingImage(JSON.stringify("just a string")))).toBeNull();
  });

  it("skips entries whose dimensions aren't a two-number array", () => {
    const $ = loadWithLandingImage(
      JSON.stringify({
        "https://m.media-amazon.com/images/bad-shape.jpg": [100],
        "https://m.media-amazon.com/images/non-numeric.jpg": ["w", "h"],
        "https://m.media-amazon.com/images/only-valid.jpg": [200, 200],
      }),
    );
    expect(extractAmazonImage($)).toBe("https://m.media-amazon.com/images/only-valid.jpg");
  });

  it("returns null when every entry has a bad shape", () => {
    const $ = loadWithLandingImage(JSON.stringify({ "https://example.com/x.jpg": [100] }));
    expect(extractAmazonImage($)).toBeNull();
  });

  it("falls back to #imgBlkFront when #landingImage is absent", () => {
    const $ = cheerio.load(
      `<!doctype html><html><body><img id="imgBlkFront" data-a-dynamic-image='${JSON.stringify({
        "https://m.media-amazon.com/images/only.jpg": [300, 300],
      })}'></body></html>`,
    );
    expect(extractAmazonImage($)).toBe("https://m.media-amazon.com/images/only.jpg");
  });
});

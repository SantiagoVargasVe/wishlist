import { describe, expect, it } from "vitest";

import type { PublicVisitorItem } from "@/server/services/public-wishlist";

import { ogImageUrl, shareDescription, shareTitle } from "./og-metadata";

function item(overrides: Partial<PublicVisitorItem>): PublicVisitorItem {
  return {
    id: "i1",
    url: "https://example.com",
    title: "Bicicleta",
    notes: null,
    imagePath: null,
    priceAmount: null,
    priceCurrency: null,
    claimed: false,
    ...overrides,
  };
}

describe("shareTitle", () => {
  it("formats as '{ownerDisplayName} — {title}'", () => {
    expect(shareTitle({ title: "Cumpleaños", ownerDisplayName: "Ana" })).toBe(
      "Ana — Cumpleaños",
    );
  });
});

describe("shareDescription", () => {
  it("uses the singular form for exactly one item", () => {
    expect(shareDescription(1)).toBe("1 artículo");
  });

  it("uses the plural form for zero items", () => {
    expect(shareDescription(0)).toBe("0 artículos");
  });

  it("uses the plural form for more than one item", () => {
    expect(shareDescription(3)).toBe("3 artículos");
  });
});

describe("ogImageUrl", () => {
  it("returns null when no item has a stored image", () => {
    const items = [item({ imagePath: null }), item({ id: "i2", imagePath: null })];
    expect(ogImageUrl(items, "https://wish.example.com")).toBeNull();
  });

  it("returns the absolute media url of the first item with a stored image", () => {
    const items = [
      item({ id: "i1", imagePath: null }),
      item({ id: "i2", imagePath: "abc.webp" }),
      item({ id: "i3", imagePath: "def.webp" }),
    ];
    expect(ogImageUrl(items, "https://wish.example.com")).toBe(
      "https://wish.example.com/media/abc.webp",
    );
  });
});

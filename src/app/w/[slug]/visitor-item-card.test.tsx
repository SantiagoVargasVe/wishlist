import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./claim-button", () => ({ ClaimButton: () => null }));

import { mediaUrl } from "@/lib/media";
import type { PublicVisitorItem } from "@/server/services/public-wishlist";

import { VisitorItemCard } from "./visitor-item-card";

const ogFetchedAt = new Date("2026-09-01T10:00:00.000Z");

const item: PublicVisitorItem = {
  id: "i1",
  url: "https://example.com/x",
  title: "Bicicleta",
  notes: null,
  imagePath: "abc.webp",
  ogFetchedAt,
  priceAmount: null,
  priceCurrency: null,
  claimed: false,
};

/** `alt=""` means the <img> has no `img` role — select it directly. */
function imageSrc(container: HTMLElement): string | null | undefined {
  return container.querySelector("img")?.getAttribute("src");
}

describe("VisitorItemCard", () => {
  // T115: a picture the owner replaces must reach visitors who loaded the old one.
  it("keys the image URL on when this item's image was stored", () => {
    const { container } = render(<VisitorItemCard slug="s1" item={item} />);
    expect(imageSrc(container)).toContain(encodeURIComponent(mediaUrl("abc.webp", ogFetchedAt)));
  });

  it("keeps the same image URL after a claim's refetch serializes the version to a string", () => {
    // SSR renders the grid with a Date. TanStack Query's refetch after a claim
    // returns the same row over JSON. A different URL would reload every image.
    const fromSsr = imageSrc(render(<VisitorItemCard slug="s1" item={item} />).container);
    const refetched = JSON.parse(JSON.stringify(item)) as PublicVisitorItem;
    const fromRefetch = imageSrc(render(<VisitorItemCard slug="s1" item={refetched} />).container);

    expect(typeof refetched.ogFetchedAt).toBe("string");
    expect(fromRefetch).toBe(fromSsr);
  });
});

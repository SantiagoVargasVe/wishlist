import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./item-actions", () => ({ ItemActions: () => null }));

import { mediaUrl } from "@/lib/media";

import { ItemCard } from "./item-card";

const baseItem = {
  id: "1",
  url: "https://example.com/product",
  title: "Bicicleta",
  notes: null,
  imagePath: null,
  sourceImageUrl: null,
  siteName: null,
  priceAmount: null,
  priceCurrency: null,
  ogStatus: "pending",
  ogFetchedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const cardProps = { wishlistId: "w1", isLastList: false };

describe("ItemCard", () => {
  it("shows the formatted price with an explicit currency code — $ alone doesn't distinguish COP from USD", () => {
    render(
      <ItemCard item={{ ...baseItem, priceAmount: "49.99", priceCurrency: "USD" }} {...cardProps} />,
    );
    expect(screen.getByText("$49.99 USD")).toBeInTheDocument();
  });

  it("shows no price when either amount or currency is missing", () => {
    render(
      <ItemCard item={{ ...baseItem, priceAmount: "49.99", priceCurrency: null }} {...cardProps} />,
    );
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("renders its image through the shared ItemImage frame (T114)", () => {
    const { container } = render(
      <ItemCard item={{ ...baseItem, imagePath: "abc.webp" }} {...cardProps} />,
    );
    // `alt=""` means the <img> has no `img` role — select it directly.
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      encodeURIComponent(mediaUrl("abc.webp", null)),
    );
  });

  it("keys the image URL on when this item's image was stored (T115)", () => {
    const ogFetchedAt = new Date("2026-09-01T10:00:00.000Z");
    const { container } = render(
      <ItemCard item={{ ...baseItem, imagePath: "abc.webp", ogFetchedAt }} {...cardProps} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      encodeURIComponent(mediaUrl("abc.webp", ogFetchedAt)),
    );
  });

  it("falls back to a placeholder when there is no image", () => {
    render(<ItemCard item={baseItem} {...cardProps} />);
    expect(screen.getByText("Sin imagen")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("links the title (not the whole card) out to the item's own URL in a new tab", () => {
    render(<ItemCard item={baseItem} {...cardProps} />);
    const link = screen.getByRole("link", { name: baseItem.title });
    expect(link).toHaveAttribute("href", baseItem.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

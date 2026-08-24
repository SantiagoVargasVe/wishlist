import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

describe("ItemCard", () => {
  it("shows the formatted price when both amount and currency are set", () => {
    render(<ItemCard item={{ ...baseItem, priceAmount: "49.99", priceCurrency: "USD" }} />);
    expect(screen.getByText("$49.99")).toBeInTheDocument();
  });

  it("shows no price when either amount or currency is missing", () => {
    render(<ItemCard item={{ ...baseItem, priceAmount: "49.99", priceCurrency: null }} />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("falls back to a placeholder when there is no image", () => {
    render(<ItemCard item={baseItem} />);
    expect(screen.getByText("Sin imagen")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("links out to the item's own URL in a new tab", () => {
    render(<ItemCard item={baseItem} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", baseItem.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./item-actions", () => ({ ItemActions: () => null }));

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

  it("renders the image with object-cover, matching the visitor card (T089)", () => {
    const { container } = render(
      <ItemCard item={{ ...baseItem, imagePath: "abc.jpg" }} {...cardProps} />,
    );
    // `alt=""` means the <img> has no `img` role — select it directly.
    expect(container.querySelector("img")).toHaveClass("object-cover");
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

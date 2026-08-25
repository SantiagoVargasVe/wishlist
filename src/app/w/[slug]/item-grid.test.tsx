import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./item-card", () => ({
  ItemCard: ({
    item,
    wishlistId,
    isLastList,
  }: {
    item: { id: string; title: string };
    wishlistId: string;
    isLastList: boolean;
  }) => (
    <div data-wishlist-id={wishlistId} data-is-last-list={isLastList}>
      {item.title}
    </div>
  ),
}));

import type { MyWishlist } from "@/server/services/me";
import type { PublicItem } from "@/server/services/items";

import { ItemGrid } from "./item-grid";

function item(id: string, title: string): PublicItem {
  return {
    id,
    title,
    url: "https://example.com",
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
}

function wishlist(id: string, items: PublicItem[]): MyWishlist {
  return { id, slug: id, title: id, isDefault: false, hideClaimsFromOwner: false, items };
}

describe("ItemGrid", () => {
  it("shows the empty state when there are no items", () => {
    render(<ItemGrid items={[]} wishlistId="w1" wishlists={[wishlist("w1", [])]} />);
    expect(screen.getByText("Todavía no hay artículos en esta lista.")).toBeInTheDocument();
  });

  it("marks an item isLastList when it appears in only the current wishlist", () => {
    const bici = item("i1", "Bicicleta");
    const wishlists = [wishlist("w1", [bici])];

    render(<ItemGrid items={[bici]} wishlistId="w1" wishlists={wishlists} />);

    expect(screen.getByText("Bicicleta")).toHaveAttribute("data-is-last-list", "true");
  });

  it("does not mark an item isLastList when it also appears in another wishlist", () => {
    const bici = item("i1", "Bicicleta");
    const wishlists = [wishlist("w1", [bici]), wishlist("w2", [bici])];

    render(<ItemGrid items={[bici]} wishlistId="w1" wishlists={wishlists} />);

    expect(screen.getByText("Bicicleta")).toHaveAttribute("data-is-last-list", "false");
  });

  it("passes the current wishlistId through to each card", () => {
    const bici = item("i1", "Bicicleta");

    render(<ItemGrid items={[bici]} wishlistId="w1" wishlists={[wishlist("w1", [bici])]} />);

    expect(screen.getByText("Bicicleta")).toHaveAttribute("data-wishlist-id", "w1");
  });
});

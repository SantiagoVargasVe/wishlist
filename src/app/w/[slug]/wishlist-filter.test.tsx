import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MyWishlist } from "@/server/services/me";

import { WishlistFilter } from "./wishlist-filter";

function makeWishlist(overrides: Partial<MyWishlist>): MyWishlist {
  return {
    id: "w1",
    slug: "abc123",
    title: "Wishlist",
    isDefault: true,
    hideClaimsFromOwner: false,
    items: [],
    ...overrides,
  };
}

describe("WishlistFilter", () => {
  it("renders nothing when the owner has only one wishlist", () => {
    const only = makeWishlist({});
    const { container } = render(<WishlistFilter wishlists={[only]} currentId={only.id} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders one link per wishlist, in the given order, when there are several", () => {
    const wishlists = [
      makeWishlist({ id: "w1", slug: "s1", title: "Wishlist" }),
      makeWishlist({ id: "w2", slug: "s2", title: "Cumpleaños", isDefault: false }),
    ];
    render(<WishlistFilter wishlists={wishlists} currentId="w1" />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("Wishlist");
    expect(links[1]).toHaveTextContent("Cumpleaños");
  });

  it("points each link at /w/{slug} for that list", () => {
    const wishlists = [
      makeWishlist({ id: "w1", slug: "s1", title: "Wishlist" }),
      makeWishlist({ id: "w2", slug: "s2", title: "Cumpleaños", isDefault: false }),
    ];
    render(<WishlistFilter wishlists={wishlists} currentId="w1" />);

    expect(screen.getByRole("link", { name: "Wishlist" })).toHaveAttribute("href", "/w/s1");
    expect(screen.getByRole("link", { name: "Cumpleaños" })).toHaveAttribute("href", "/w/s2");
  });

  it("marks only the current list with aria-current", () => {
    const wishlists = [
      makeWishlist({ id: "w1", slug: "s1", title: "Wishlist" }),
      makeWishlist({ id: "w2", slug: "s2", title: "Cumpleaños", isDefault: false }),
    ];
    render(<WishlistFilter wishlists={wishlists} currentId="w2" />);

    expect(screen.getByRole("link", { name: "Wishlist" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Cumpleaños" })).toHaveAttribute("aria-current", "page");
  });
});

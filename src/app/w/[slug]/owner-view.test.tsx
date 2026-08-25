import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./add-item-modal", () => ({ AddItemModal: () => null }));
vi.mock("./create-wishlist-modal", () => ({ CreateWishlistModal: () => null }));
vi.mock("./item-grid", () => ({ ItemGrid: () => null }));
vi.mock("./rename-wishlist-modal", () => ({
  RenameWishlistModal: ({ wishlist }: { wishlist: { title: string } }) => (
    <button>Renombrar {wishlist.title}</button>
  ),
}));
vi.mock("./delete-wishlist-button", () => ({
  DeleteWishlistButton: ({ wishlist }: { wishlist: { title: string } }) => (
    <button>Eliminar {wishlist.title}</button>
  ),
}));

import type { MyWishlist } from "@/server/services/me";

import { OwnerView } from "./owner-view";

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

describe("OwnerView", () => {
  it("shows no delete action for the default wishlist", () => {
    const wishlist = makeWishlist({ isDefault: true });
    render(<OwnerView wishlist={wishlist} wishlists={[wishlist]} />);

    expect(screen.queryByText(/^Eliminar/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Renombrar/)).toBeInTheDocument();
  });

  it("shows a delete action for a non-default wishlist", () => {
    const defaultList = makeWishlist({ id: "w1", isDefault: true, title: "Wishlist" });
    const extra = makeWishlist({ id: "w2", isDefault: false, title: "Cumpleaños" });
    render(<OwnerView wishlist={extra} wishlists={[defaultList, extra]} />);

    expect(screen.getByText("Eliminar Cumpleaños")).toBeInTheDocument();
  });
});

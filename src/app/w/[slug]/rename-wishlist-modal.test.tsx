import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const updateMutateAsyncMock = vi.fn();
vi.mock("@/lib/api/queries", () => ({
  useUpdateWishlistMutation: () => ({ mutateAsync: updateMutateAsyncMock }),
}));

import type { PublicWishlist } from "@/server/services/wishlists";

import { RenameWishlistModal } from "./rename-wishlist-modal";

const wishlist: PublicWishlist = {
  id: "w1",
  slug: "abc123",
  title: "Wishlist",
  isDefault: true,
  hideClaimsFromOwner: false,
};

beforeEach(() => {
  updateMutateAsyncMock.mockReset();
  refreshMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RenameWishlistModal", () => {
  it("prefills the current title", async () => {
    render(<RenameWishlistModal wishlist={wishlist} />);
    await userEvent.click(screen.getByRole("button", { name: "Renombrar" }));

    expect(screen.getByLabelText("Nombre de la lista")).toHaveValue("Wishlist");
  });

  it("renames and refreshes on success", async () => {
    updateMutateAsyncMock.mockResolvedValue({ wishlist });
    render(<RenameWishlistModal wishlist={wishlist} />);

    await userEvent.click(screen.getByRole("button", { name: "Renombrar" }));
    const titleInput = screen.getByLabelText("Nombre de la lista");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Cumpleaños");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateMutateAsyncMock).toHaveBeenCalledWith({
        id: "w1",
        input: { title: "Cumpleaños" },
      }),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows a form-level error on a server failure", async () => {
    updateMutateAsyncMock.mockRejectedValue(new Error("boom"));
    render(<RenameWishlistModal wishlist={wishlist} />);

    await userEvent.click(screen.getByRole("button", { name: "Renombrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo renombrar la lista. Intenta de nuevo.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

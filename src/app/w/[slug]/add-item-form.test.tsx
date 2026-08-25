import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const mutateAsyncMock = vi.fn();
vi.mock("@/lib/api/queries", () => ({
  useCreateItemMutation: () => ({ mutateAsync: mutateAsyncMock }),
}));

vi.mock("./hooks/use-item-preview", () => ({
  useItemPreview: () => ({ data: undefined, isFetching: false }),
}));

import type { PublicWishlist } from "@/server/services/wishlists";

import { AddItemForm } from "./add-item-form";

const WISHLIST_ID = "11111111-1111-4111-8111-111111111111";

const wishlists: PublicWishlist[] = [
  { id: WISHLIST_ID, slug: "s1", title: "Cumpleaños", isDefault: true, hideClaimsFromOwner: false },
];

beforeEach(() => {
  mutateAsyncMock.mockReset();
  refreshMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function fillRequiredFields() {
  await userEvent.type(screen.getByLabelText("Enlace del producto"), "https://example.com/x");
  await userEvent.type(screen.getByLabelText("Título"), "Bicicleta");
}

describe("AddItemForm", () => {
  it("submits the trimmed input, closes, and refreshes the page on success", async () => {
    mutateAsyncMock.mockResolvedValue({ item: { id: "item-1" } });
    const onSuccess = vi.fn();

    render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={onSuccess} />);
    await fillRequiredFields();
    await userEvent.click(screen.getByRole("button", { name: "Añadir" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/x",
        title: "Bicicleta",
        wishlistIds: [WISHLIST_ID],
        notes: undefined,
      }),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows a form-level error and does not close on a server failure", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("boom"));
    const onSuccess = vi.fn();

    render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={onSuccess} />);
    await fillRequiredFields();
    await userEvent.click(screen.getByRole("button", { name: "Añadir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo añadir el artículo. Intenta de nuevo.",
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows a validation error and never calls the API when the url is missing", async () => {
    render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Título"), "Bicicleta");
    await userEvent.click(screen.getByRole("button", { name: "Añadir" }));

    expect(await screen.findByText("Enter a valid URL")).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});

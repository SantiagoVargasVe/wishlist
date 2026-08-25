import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const deleteMutateAsyncMock = vi.fn();
vi.mock("@/lib/api/queries", () => ({
  useDeleteWishlistMutation: () => ({ mutateAsync: deleteMutateAsyncMock }),
}));

const toastAddMock = vi.fn();
vi.mock("@/app/_ui/toast", () => ({
  Toast: { useToastManager: () => ({ add: toastAddMock }) },
}));

import { ApiError } from "@/lib/api/errors";
import type { PublicWishlist } from "@/server/services/wishlists";

import { DeleteWishlistButton } from "./delete-wishlist-button";

const wishlist: PublicWishlist = {
  id: "w2",
  slug: "abc123",
  title: "Cumpleaños",
  isDefault: false,
  hideClaimsFromOwner: false,
};

beforeEach(() => {
  deleteMutateAsyncMock.mockReset();
  pushMock.mockClear();
  refreshMock.mockClear();
  toastAddMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DeleteWishlistButton", () => {
  it("deletes without the orphans flag, then redirects and refreshes", async () => {
    deleteMutateAsyncMock.mockResolvedValue(undefined);
    render(<DeleteWishlistButton wishlist={wishlist} redirectSlug="default-slug" />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar lista" }));
    expect(screen.getByText('Se eliminará la lista "Cumpleaños". Esta acción no se puede deshacer.'))
      .toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() =>
      expect(deleteMutateAsyncMock).toHaveBeenCalledWith({ id: "w2", deleteOrphans: false }),
    );
    expect(pushMock).toHaveBeenCalledWith("/w/default-slug");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows the named orphan items and re-attempts with the flag once confirmed again", async () => {
    deleteMutateAsyncMock
      .mockRejectedValueOnce(
        new ApiError("CONFIRM_DELETE_ORPHANS", "confirm", 409, {
          orphanItems: [{ id: "i1", title: "Bicicleta" }],
        }),
      )
      .mockResolvedValueOnce(undefined);
    render(<DeleteWishlistButton wishlist={wishlist} redirectSlug="default-slug" />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar lista" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText("Bicicleta")).toBeInTheDocument();
    expect(deleteMutateAsyncMock).toHaveBeenCalledWith({ id: "w2", deleteOrphans: false });

    await userEvent.click(screen.getByRole("button", { name: "Eliminar de todos modos" }));

    await waitFor(() =>
      expect(deleteMutateAsyncMock).toHaveBeenLastCalledWith({ id: "w2", deleteOrphans: true }),
    );
    expect(pushMock).toHaveBeenCalledWith("/w/default-slug");
  });

  it("toasts and closes on any other failure, without navigating", async () => {
    deleteMutateAsyncMock.mockRejectedValue(new Error("boom"));
    render(<DeleteWishlistButton wishlist={wishlist} redirectSlug="default-slug" />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar lista" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(toastAddMock).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("¿Eliminar esta lista?")).not.toBeInTheDocument(),
    );
  });

  it("resets the orphan state after the dialog is cancelled and reopened", async () => {
    deleteMutateAsyncMock.mockRejectedValueOnce(
      new ApiError("CONFIRM_DELETE_ORPHANS", "confirm", 409, {
        orphanItems: [{ id: "i1", title: "Bicicleta" }],
      }),
    );
    render(<DeleteWishlistButton wishlist={wishlist} redirectSlug="default-slug" />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar lista" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText("Bicicleta")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar lista" }));

    expect(screen.queryByText("Bicicleta")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });
});

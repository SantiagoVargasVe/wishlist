import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const removeMutateAsyncMock = vi.fn();
vi.mock("@/lib/api/queries", () => ({
  useRemoveItemFromWishlistMutation: () => ({ mutateAsync: removeMutateAsyncMock }),
}));

const toastAddMock = vi.fn();
vi.mock("@/app/_ui/toast", () => ({
  Toast: { useToastManager: () => ({ add: toastAddMock }) },
}));

import type { PublicItem } from "@/server/services/items";

import { RemoveFromListButton } from "./remove-from-list-button";

const item = { id: "item-1", title: "Bicicleta" } as PublicItem;

beforeEach(() => {
  removeMutateAsyncMock.mockReset();
  refreshMock.mockClear();
  toastAddMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RemoveFromListButton", () => {
  it("removes immediately, with no confirmation, when it is not the item's last list", async () => {
    removeMutateAsyncMock.mockResolvedValue(undefined);
    render(<RemoveFromListButton item={item} wishlistId="w1" isLastList={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));

    await waitFor(() =>
      expect(removeMutateAsyncMock).toHaveBeenCalledWith({ itemId: "item-1", wishlistId: "w1" }),
    );
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("warns before removing when it is the item's last list", async () => {
    render(<RemoveFromListButton item={item} wishlistId="w1" isLastList={true} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));

    expect(removeMutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.getByText("¿Quitar este artículo?")).toBeInTheDocument();
  });

  it("removes only after the last-list warning is confirmed", async () => {
    removeMutateAsyncMock.mockResolvedValue(undefined);
    render(<RemoveFromListButton item={item} wishlistId="w1" isLastList={true} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));
    await userEvent.click(screen.getByRole("button", { name: "Quitar de todos modos" }));

    await waitFor(() =>
      expect(removeMutateAsyncMock).toHaveBeenCalledWith({ itemId: "item-1", wishlistId: "w1" }),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("toasts an error when removal fails", async () => {
    removeMutateAsyncMock.mockRejectedValue(new Error("boom"));
    render(<RemoveFromListButton item={item} wishlistId="w1" isLastList={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));

    await waitFor(() => expect(toastAddMock).toHaveBeenCalled());
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

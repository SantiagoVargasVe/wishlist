import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const deleteMutateAsyncMock = vi.fn();
vi.mock("@/lib/api/queries", () => ({
  useDeleteItemMutation: () => ({ mutateAsync: deleteMutateAsyncMock }),
}));

const toastAddMock = vi.fn();
vi.mock("@/app/_ui/toast", () => ({
  Toast: { useToastManager: () => ({ add: toastAddMock }) },
}));

import type { PublicItem } from "@/server/services/items";

import { DeleteItemButton } from "./delete-item-button";

const item = { id: "item-1", title: "Bicicleta" } as PublicItem;

beforeEach(() => {
  deleteMutateAsyncMock.mockReset();
  refreshMock.mockClear();
  toastAddMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DeleteItemButton", () => {
  it("always confirms before deleting", async () => {
    deleteMutateAsyncMock.mockResolvedValue(undefined);
    render(<DeleteItemButton item={item} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(deleteMutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.getByText("¿Eliminar este artículo?")).toBeInTheDocument();
  });

  it("deletes and refreshes once confirmed", async () => {
    deleteMutateAsyncMock.mockResolvedValue(undefined);
    render(<DeleteItemButton item={item} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Eliminar" });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(deleteMutateAsyncMock).toHaveBeenCalledWith("item-1"));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("toasts an error and leaves the item alone when the delete fails", async () => {
    deleteMutateAsyncMock.mockRejectedValue(new Error("boom"));
    render(<DeleteItemButton item={item} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Eliminar" });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(toastAddMock).toHaveBeenCalled());
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

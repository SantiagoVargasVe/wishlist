import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const createMutateAsyncMock = vi.fn();
vi.mock("@/lib/api/queries", () => ({
  useCreateWishlistMutation: () => ({ mutateAsync: createMutateAsyncMock }),
}));

import { CreateWishlistModal } from "./create-wishlist-modal";

beforeEach(() => {
  createMutateAsyncMock.mockReset();
  pushMock.mockClear();
  refreshMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function openAndFill(title: string) {
  await userEvent.click(screen.getByRole("button", { name: "Nueva lista" }));

  // Base UI's dialog schedules its initial-focus move (onto the close button,
  // the first tabbable element) via `requestAnimationFrame`, which this click
  // doesn't wait for. Left pending, it can fire mid-type and steal focus away
  // from the title input, dropping keystrokes — flaky under load, where the
  // extra scheduling delay lands squarely inside the typing window. Waiting
  // one frame here lets that focus move happen first, so ours (below) is the
  // one left standing.
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  await userEvent.type(screen.getByLabelText("Nombre de la lista"), title);
}

describe("CreateWishlistModal", () => {
  it("creates the list and navigates to its slug on success", async () => {
    createMutateAsyncMock.mockResolvedValue({ wishlist: { id: "w2", slug: "abc123" } });
    render(<CreateWishlistModal />);

    await openAndFill("Cumpleaños");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() =>
      expect(createMutateAsyncMock).toHaveBeenCalledWith({ title: "Cumpleaños" }),
    );
    expect(pushMock).toHaveBeenCalledWith("/w/abc123");
    // Busts the Router Cache so the list you were on re-renders with the
    // now-relevant nav instead of its stale one-list version (T094).
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows a validation error and never calls the API for a blank title", async () => {
    render(<CreateWishlistModal />);

    await userEvent.click(screen.getByRole("button", { name: "Nueva lista" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText("Enter a title")).toBeInTheDocument();
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows a form-level error and does not navigate on a server failure", async () => {
    createMutateAsyncMock.mockRejectedValue(new Error("boom"));
    render(<CreateWishlistModal />);

    await openAndFill("Cumpleaños");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo crear la lista. Intenta de nuevo.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});

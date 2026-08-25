import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const mutateAsyncMock = vi.fn();
const uploadImageMock = vi.fn();
vi.mock("@/lib/api/queries", () => ({
  useCreateItemMutation: () => ({ mutateAsync: mutateAsyncMock }),
  // T086: the image picker lives in both forms now. Nothing here picks
  // an image, so this never fires — it just has to exist to be called.
  useUploadItemImageMutation: () => ({ mutateAsync: uploadImageMock, isPending: false }),
}));

// `useItemImage` reaches for the toast manager to report a failed upload.
vi.mock("@/app/_ui/toast", () => ({
  Toast: { useToastManager: () => ({ add: vi.fn() }) },
}));

const useItemPreviewMock = vi.fn();
vi.mock("./hooks/use-item-preview", () => ({
  useItemPreview: (...args: unknown[]) => useItemPreviewMock(...args),
}));

import type { PublicWishlist } from "@/server/services/wishlists";

import { AddItemForm } from "./add-item-form";

const WISHLIST_ID = "11111111-1111-4111-8111-111111111111";

const wishlists: PublicWishlist[] = [
  { id: WISHLIST_ID, slug: "s1", title: "Cumpleaños", isDefault: true, hideClaimsFromOwner: false },
];

/** The common "a scrape already resolved (or the URL is being edited after that point)" state — most tests render from here. */
const RESOLVED_PREVIEW = { data: undefined, isFetching: false, fieldsEnabled: true };
const LOCKED_PREVIEW = { data: undefined, isFetching: false, fieldsEnabled: false };

beforeEach(() => {
  mutateAsyncMock.mockReset();
  refreshMock.mockClear();
  useItemPreviewMock.mockReturnValue(RESOLVED_PREVIEW);
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

  describe("catch-up refresh for a just-downloaded image (T081)", () => {
    /** Simulates useItemPreview's real behavior of calling setValue("imageUrl", ...) once a scrape resolves an image — only mocked here since the whole hook is mocked. */
    function mockPreviewWithImage() {
      let calledOnce = false;
      useItemPreviewMock.mockImplementation((_url: string, setValue: (name: string, value: unknown) => void) => {
        if (!calledOnce) {
          calledOnce = true;
          setValue("imageUrl", "https://cdn.example/pic.jpg");
        }
        return RESOLVED_PREVIEW;
      });
    }

    it("schedules two delayed catch-up refreshes when the created item had an image to download", async () => {
      const setTimeoutSpy = vi.spyOn(window, "setTimeout");
      mockPreviewWithImage();
      mutateAsyncMock.mockResolvedValue({ item: { id: "item-1" } });

      render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={vi.fn()} />);
      await fillRequiredFields();
      await userEvent.click(screen.getByRole("button", { name: "Añadir" }));

      await waitFor(() => {
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1500);
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3500);
      });
      setTimeoutSpy.mockRestore();
    });

    it("does not schedule extra refreshes when the created item never had an image", async () => {
      const setTimeoutSpy = vi.spyOn(window, "setTimeout");
      mutateAsyncMock.mockResolvedValue({ item: { id: "item-1" } });

      render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={vi.fn()} />);
      await fillRequiredFields();
      await userEvent.click(screen.getByRole("button", { name: "Añadir" }));

      await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
      expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 1500);
      setTimeoutSpy.mockRestore();
    });
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

  describe("field gating (T082)", () => {
    it("disables title/notes/price/lists until the URL preview has settled", () => {
      useItemPreviewMock.mockReturnValue(LOCKED_PREVIEW);
      render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={vi.fn()} />);

      expect(screen.getByLabelText("Título")).toBeDisabled();
      expect(screen.getByLabelText("Notas")).toBeDisabled();
      expect(screen.getByLabelText("Precio")).toBeDisabled();
      expect(screen.getByRole("combobox", { name: /listas/i })).toBeDisabled();
    });

    it("enables the rest of the form once the preview has settled, even the URL field itself stays enabled throughout", () => {
      useItemPreviewMock.mockReturnValue(RESOLVED_PREVIEW);
      render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={vi.fn()} />);

      expect(screen.getByLabelText("Enlace del producto")).toBeEnabled();
      expect(screen.getByLabelText("Título")).toBeEnabled();
      expect(screen.getByLabelText("Notas")).toBeEnabled();
      expect(screen.getByLabelText("Precio")).toBeEnabled();
    });

    it("keeps fields unlocked even when the scrape itself failed — a bad OG fetch never blocks manual entry", () => {
      // ogStatus: "failed" still means fieldsEnabled: true — settling, not
      // succeeding, is what unlocks the form (non-negotiable #2).
      useItemPreviewMock.mockReturnValue({
        data: { ogStatus: "failed" },
        isFetching: false,
        fieldsEnabled: true,
      });
      render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={vi.fn()} />);

      expect(screen.getByLabelText("Título")).toBeEnabled();
    });
  });

  describe("Save button validity gating (T082)", () => {
    it("starts disabled — url and title are both required and empty", () => {
      render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Añadir" })).toBeDisabled();
    });

    it("stays disabled with a valid url but no title yet", async () => {
      render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={vi.fn()} />);

      await userEvent.type(screen.getByLabelText("Enlace del producto"), "https://example.com/x");

      expect(screen.getByRole("button", { name: "Añadir" })).toBeDisabled();
    });

    it("enables once url, title, and at least one list are all valid", async () => {
      render(<AddItemForm wishlists={wishlists} currentWishlistId={WISHLIST_ID} onSuccess={vi.fn()} />);

      await fillRequiredFields();

      expect(screen.getByRole("button", { name: "Añadir" })).toBeEnabled();
    });
  });
});

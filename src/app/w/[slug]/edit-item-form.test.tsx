import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const updateMutateAsyncMock = vi.fn();
vi.mock("@/lib/api/queries", () => ({
  useUpdateItemMutation: () => ({ mutateAsync: updateMutateAsyncMock }),
}));

import type { PublicItem } from "@/server/services/items";

import { EditItemForm } from "./edit-item-form";

const priceyItem: PublicItem = {
  id: "item-1",
  url: "https://example.com/product",
  title: "Bicicleta",
  notes: "Talla M",
  imagePath: null,
  sourceImageUrl: null,
  siteName: null,
  priceAmount: "49.99",
  priceCurrency: "USD",
  ogStatus: "ok",
  ogFetchedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const noPriceItem: PublicItem = { ...priceyItem, priceAmount: null, priceCurrency: null };

beforeEach(() => {
  updateMutateAsyncMock.mockReset();
  refreshMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("EditItemForm", () => {
  it("prefills every field from the item", () => {
    render(<EditItemForm item={priceyItem} onSuccess={vi.fn()} />);

    expect(screen.getByLabelText("Enlace del producto")).toHaveValue(priceyItem.url);
    expect(screen.getByLabelText("Título")).toHaveValue("Bicicleta");
    expect(screen.getByLabelText("Notas")).toHaveValue("Talla M");
    expect(screen.getByLabelText("Precio")).toHaveValue("49.99");
    expect(screen.getByRole("combobox", { name: "Moneda" })).toHaveTextContent("USD");
  });

  it("resubmits the item's current values unchanged when nothing is edited", async () => {
    updateMutateAsyncMock.mockResolvedValue({ item: priceyItem });
    render(<EditItemForm item={priceyItem} onSuccess={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateMutateAsyncMock).toHaveBeenCalledWith({
        id: "item-1",
        input: expect.objectContaining({
          url: priceyItem.url,
          title: "Bicicleta",
          notes: "Talla M",
          priceAmount: "49.99",
          priceCurrency: "USD",
        }),
      }),
    );
  });

  it("sends notes: null when an existing note is cleared", async () => {
    updateMutateAsyncMock.mockResolvedValue({ item: priceyItem });
    render(<EditItemForm item={priceyItem} onSuccess={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText("Notas"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ notes: null }) }),
      ),
    );
  });

  it("omits both price keys when the item has no price and the fields are left blank", async () => {
    updateMutateAsyncMock.mockResolvedValue({ item: noPriceItem });
    render(<EditItemForm item={noPriceItem} onSuccess={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updateMutateAsyncMock).toHaveBeenCalled());
    const { input } = updateMutateAsyncMock.mock.calls[0][0];
    expect(input.priceAmount).toBeUndefined();
    expect(input.priceCurrency).toBeUndefined();
  });

  it("closes and refreshes on success", async () => {
    updateMutateAsyncMock.mockResolvedValue({ item: priceyItem });
    const onSuccess = vi.fn();
    render(<EditItemForm item={priceyItem} onSuccess={onSuccess} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows a form-level error and does not close on a server failure", async () => {
    updateMutateAsyncMock.mockRejectedValue(new Error("boom"));
    const onSuccess = vi.fn();
    render(<EditItemForm item={priceyItem} onSuccess={onSuccess} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar los cambios. Intenta de nuevo.",
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

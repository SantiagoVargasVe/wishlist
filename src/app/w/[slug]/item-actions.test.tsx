import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./edit-item-modal", () => ({
  EditItemModal: () => <button type="button">Editar</button>,
}));
vi.mock("./delete-item-button", () => ({
  DeleteItemButton: () => <button type="button">Eliminar</button>,
}));
vi.mock("./remove-from-list-button", () => ({
  RemoveFromListButton: () => <button type="button">Quitar</button>,
}));

import type { PublicItem } from "@/server/services/items";

import { ItemActions } from "./item-actions";

const item = { id: "i1", title: "Bicicleta" } as PublicItem;

describe("ItemActions", () => {
  it("hides \"Quitar\" for an item that is only in one list", () => {
    render(<ItemActions item={item} wishlistId="w1" isLastList />);

    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
  });

  it("shows \"Quitar\" for an item that is in more than one list", () => {
    render(<ItemActions item={item} wishlistId="w1" isLastList={false} />);

    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });
});

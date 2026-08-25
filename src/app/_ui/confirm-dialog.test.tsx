import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";

function setup(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ConfirmDialog
      trigger={<Button>Eliminar</Button>}
      title="¿Eliminar este artículo?"
      description="Esta acción no se puede deshacer."
      confirmLabel="Eliminar"
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("ConfirmDialog", () => {
  it("does not show the dialog content until the trigger is clicked", () => {
    setup();
    expect(screen.queryByText("¿Eliminar este artículo?")).not.toBeInTheDocument();
  });

  it("opens the dialog and shows the title and description", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(screen.getByText("¿Eliminar este artículo?")).toBeInTheDocument();
    expect(screen.getByText("Esta acción no se puede deshacer.")).toBeInTheDocument();
  });

  it("closes without calling onConfirm when cancel is clicked", async () => {
    const onConfirm = setup();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("¿Eliminar este artículo?")).not.toBeInTheDocument(),
    );
  });

  it("calls onConfirm and closes when the confirm button is clicked", async () => {
    const onConfirm = setup();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    // Two buttons now say "Eliminar": the trigger (hidden behind the popup,
    // but still in the DOM) and the dialog's own confirm button — the
    // confirm one is the second.
    const confirmButtons = screen.getAllByRole("button", { name: "Eliminar" });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText("¿Eliminar este artículo?")).not.toBeInTheDocument(),
    );
  });
});

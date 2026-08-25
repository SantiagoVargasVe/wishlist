import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastAddMock = vi.fn();
vi.mock("@/app/_ui/toast", () => ({
  Toast: { useToastManager: () => ({ add: toastAddMock }) },
}));

const mintMutateAsyncMock = vi.fn();
vi.mock("@/lib/api/queries", () => ({
  useMintInviteMutation: () => ({ mutateAsync: mintMutateAsyncMock, isPending: false }),
}));

import { ApiError } from "@/lib/api/errors";

import { InviteButton } from "./invite-button";

const originalClipboard = navigator.clipboard;

beforeEach(() => {
  mintMutateAsyncMock.mockReset();
  toastAddMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true });
});

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("InviteButton", () => {
  it("shows the code and its expiry once generated", async () => {
    mintMutateAsyncMock.mockResolvedValue({ code: "K7MQ2XPT9R", expiresAt: "2026-09-01T00:00:00Z" });
    render(<InviteButton />);

    await userEvent.click(screen.getByRole("button", { name: "Invitar" }));
    await userEvent.click(screen.getByRole("button", { name: "Generar código" }));

    expect(await screen.findByText("K7MQ2XPT9R")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar código" })).toBeInTheDocument();
  });

  it("copies the code to the clipboard and confirms with a toast", async () => {
    mintMutateAsyncMock.mockResolvedValue({ code: "K7MQ2XPT9R", expiresAt: "2026-09-01T00:00:00Z" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<InviteButton />);

    await userEvent.click(screen.getByRole("button", { name: "Invitar" }));
    await userEvent.click(screen.getByRole("button", { name: "Generar código" }));
    await screen.findByText("K7MQ2XPT9R");
    await userEvent.click(screen.getByRole("button", { name: "Copiar código" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("K7MQ2XPT9R"));
    expect(toastAddMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Código copiado" }));
  });

  it("shows the rate-limit message with the retry time when minting is rate limited", async () => {
    mintMutateAsyncMock.mockRejectedValue(
      new ApiError("RATE_LIMITED", "Too many requests", 429, { retryAfterSeconds: 120 }),
    );
    render(<InviteButton />);

    await userEvent.click(screen.getByRole("button", { name: "Invitar" }));
    await userEvent.click(screen.getByRole("button", { name: "Generar código" }));

    await waitFor(() =>
      expect(toastAddMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Demasiados intentos. Intenta de nuevo en 120 segundos.",
        }),
      ),
    );
    expect(screen.queryByText(/^[A-Z0-9]{10}$/)).not.toBeInTheDocument();
  });

  it("shows a generic error for any other minting failure", async () => {
    mintMutateAsyncMock.mockRejectedValue(new Error("boom"));
    render(<InviteButton />);

    await userEvent.click(screen.getByRole("button", { name: "Invitar" }));
    await userEvent.click(screen.getByRole("button", { name: "Generar código" }));

    await waitFor(() =>
      expect(toastAddMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Algo salió mal. Intenta de nuevo." }),
      ),
    );
  });

  it("resets to the generate view when reopened after closing", async () => {
    mintMutateAsyncMock.mockResolvedValue({ code: "K7MQ2XPT9R", expiresAt: "2026-09-01T00:00:00Z" });
    render(<InviteButton />);

    await userEvent.click(screen.getByRole("button", { name: "Invitar" }));
    await userEvent.click(screen.getByRole("button", { name: "Generar código" }));
    await screen.findByText("K7MQ2XPT9R");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    await userEvent.click(screen.getByRole("button", { name: "Invitar" }));
    expect(screen.getByRole("button", { name: "Generar código" })).toBeInTheDocument();
    expect(screen.queryByText("K7MQ2XPT9R")).not.toBeInTheDocument();
  });
});

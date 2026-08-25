import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastAddMock = vi.fn();
vi.mock("@/app/_ui/toast", () => ({
  Toast: { useToastManager: () => ({ add: toastAddMock }) },
}));

import { ShareButton } from "./share-button";

const originalShare = navigator.share;
const originalClipboard = navigator.clipboard;

beforeEach(() => {
  toastAddMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "share", { value: originalShare, configurable: true });
  Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true });
});

function stubShare(impl?: (data: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, "share", {
    value: impl ?? vi.fn().mockResolvedValue(undefined),
    configurable: true,
  });
}

function removeShare() {
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("ShareButton", () => {
  it("uses the native share sheet with the list's title and the correct url", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShare(share);
    render(<ShareButton slug="abc123" title="Cumpleaños" />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Cumpleaños",
        url: `${window.location.origin}/w/abc123`,
      }),
    );
    expect(toastAddMock).not.toHaveBeenCalled();
  });

  it("shows no error when the user cancels the native share sheet", async () => {
    const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
    stubShare(vi.fn().mockRejectedValue(abortError));
    render(<ShareButton slug="abc123" title="Cumpleaños" />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(toastAddMock).not.toHaveBeenCalled();
  });

  it("shows an error toast when the native share sheet fails for another reason", async () => {
    stubShare(vi.fn().mockRejectedValue(new Error("boom")));
    render(<ShareButton slug="abc123" title="Cumpleaños" />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() =>
      expect(toastAddMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      ),
    );
  });

  it("falls back to the clipboard and confirms with a toast when share isn't available", async () => {
    removeShare();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<ShareButton slug="abc123" title="Cumpleaños" />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/w/abc123`));
    expect(toastAddMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Enlace copiado" }));
  });

  it("shows an error toast when the clipboard write fails", async () => {
    removeShare();
    stubClipboard(vi.fn().mockRejectedValue(new Error("boom")));
    render(<ShareButton slug="abc123" title="Cumpleaños" />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() =>
      expect(toastAddMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      ),
    );
  });
});

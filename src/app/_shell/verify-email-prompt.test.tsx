import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyEmailPrompt } from "./verify-email-prompt";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
  sessionStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const noContent = () => new Response(null, { status: 204 });
const unauthorized = () =>
  new Response(
    JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }),
    { status: 401 },
  );

const resendButton = () => screen.getByRole("button", { name: /reenviar correo/i });

describe("VerifyEmailPrompt", () => {
  it("states the actual consequence rather than a generic plea", async () => {
    // An unverified user keeps full use of the app, so they should be able to
    // make an informed decision to ignore this (ADR-0013).
    render(<VerifyEmailPrompt />);

    expect(screen.getByText(/recuperar tu contraseña/i)).toBeInTheDocument();
    expect(screen.getByText(/funciona con normalidad/i)).toBeInTheDocument();
  });

  it("is a prompt, not a wall — nothing about it blocks the page", () => {
    const { container } = render(<VerifyEmailPrompt />);

    // No overlay, no scroll lock, no modal semantics: it sits in the normal
    // document flow and can be worked around by ignoring it.
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(container.querySelector(".fixed")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("resends and reports success inline", async () => {
    vi.mocked(fetch).mockResolvedValue(noContent());

    render(<VerifyEmailPrompt />);
    await userEvent.click(resendButton());

    expect(await screen.findByText(/te enviamos el correo/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/resend-verification",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports a failed resend inline without losing the prompt", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 500 }));

    render(<VerifyEmailPrompt />);
    await userEvent.click(resendButton());

    expect(await screen.findByText(/no se pudo enviar/i)).toBeInTheDocument();
    expect(resendButton()).toBeInTheDocument();
  });

  it("shows the generic failure message when the session has gone", async () => {
    vi.mocked(fetch).mockResolvedValue(unauthorized());

    render(<VerifyEmailPrompt />);
    await userEvent.click(resendButton());

    expect(await screen.findByText(/no se pudo enviar/i)).toBeInTheDocument();
  });

  it("stays disabled after a successful resend", async () => {
    // A resend invalidates the previous token (T108), so firing twice would
    // quietly kill the link the first press just mailed.
    vi.mocked(fetch).mockResolvedValue(noContent());

    render(<VerifyEmailPrompt />);
    await userEvent.click(resendButton());

    await waitFor(() => expect(resendButton()).toBeDisabled());
    await userEvent.click(resendButton());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("disappears when dismissed", async () => {
    render(<VerifyEmailPrompt />);
    await userEvent.click(screen.getByRole("button", { name: /ahora no/i }));

    expect(screen.queryByText(/recuperar tu contraseña/i)).not.toBeInTheDocument();
  });

  it("stays dismissed for the session but not forever", async () => {
    // An unverified state the user can't see is a gap they can't close, so
    // "not now" must not silently become "never".
    render(<VerifyEmailPrompt />);
    await userEvent.click(screen.getByRole("button", { name: /ahora no/i }));

    expect(sessionStorage.getItem("wishlist:verify-prompt-dismissed")).toBe("1");
    // A fresh session — the browser tab closed and reopened — shows it again.
    sessionStorage.clear();
    render(<VerifyEmailPrompt />);
    expect(screen.getByRole("button", { name: /ahora no/i })).toBeInTheDocument();
  });

  it("renders even when sessionStorage is unavailable", () => {
    // Some privacy configurations throw on access. A header that can crash the
    // whole shell is worse than a prompt shown once more than it needed to be.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    render(<VerifyEmailPrompt />);
    expect(resendButton()).toBeInTheDocument();
  });
});

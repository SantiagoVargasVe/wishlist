import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyEmailStatus } from "./verify-email-status";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const noContent = () => new Response(null, { status: 204 });
const invalidToken = () =>
  new Response(
    JSON.stringify({
      error: {
        code: "VERIFICATION_TOKEN_INVALID",
        message: "That verification link is invalid or has expired",
      },
    }),
    { status: 400 },
  );
const unauthorized = () =>
  new Response(
    JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }),
    { status: 401 },
  );

describe("VerifyEmailStatus", () => {
  it("consumes the token on load and confirms", async () => {
    // Spent on load rather than on a button press: opening the link already
    // expressed intent, and confirming a confirmation is friction.
    vi.mocked(fetch).mockResolvedValue(noContent());

    render(<VerifyEmailStatus token="a-token" />);

    expect(await screen.findByText("Correo confirmado")).toBeInTheDocument();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ token: "a-token" });
  });

  it("says what verifying bought, and offers a way onward", async () => {
    vi.mocked(fetch).mockResolvedValue(noContent());

    render(<VerifyEmailStatus token="a-token" />);

    expect(await screen.findByText(/recuperar tu contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ir a mis listas/i })).toHaveAttribute("href", "/");
  });

  it("spends the token once, not once per effect run", async () => {
    // React StrictMode runs effects twice in development; a second POST would
    // spend a token the first already consumed and render a good link expired.
    vi.mocked(fetch).mockResolvedValue(noContent());

    render(<VerifyEmailStatus token="a-token" />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("offers a resend instead of a dead end when the link is spent", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(invalidToken());

    render(<VerifyEmailStatus token="spent" />);

    expect(await screen.findByText("No pudimos confirmar tu correo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reenviar correo/i })).toBeInTheDocument();
    // Never the server's English message.
    expect(screen.queryByText(/invalid or has expired/i)).not.toBeInTheDocument();
  });

  it("resends successfully from the failure state", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(invalidToken())
      .mockResolvedValueOnce(noContent());

    render(<VerifyEmailStatus token="spent" />);
    await userEvent.click(await screen.findByRole("button", { name: /reenviar correo/i }));

    expect(await screen.findByText(/te enviamos el correo/i)).toBeInTheDocument();
  });

  it("reports a failed resend without losing the page", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(invalidToken())
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));

    render(<VerifyEmailStatus token="spent" />);
    await userEvent.click(await screen.findByRole("button", { name: /reenviar correo/i }));

    expect(await screen.findByText(/no se pudo enviar/i)).toBeInTheDocument();
    expect(screen.getByText("No pudimos confirmar tu correo")).toBeInTheDocument();
  });

  it("points a logged-out visitor at login rather than failing silently", async () => {
    // Opening the mail on a device you aren't logged in on is an ordinary way
    // to arrive here, and resend needs a session.
    vi.mocked(fetch)
      .mockResolvedValueOnce(invalidToken())
      .mockResolvedValueOnce(unauthorized());

    render(<VerifyEmailStatus token="spent" />);
    await userEvent.click(await screen.findByRole("button", { name: /reenviar correo/i }));

    expect(
      await screen.findByRole("link", { name: /inicia sesión para pedir uno nuevo/i }),
    ).toHaveAttribute("href", "/login");
  });

  it("disables resend after success so the fresh link isn't invalidated", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(invalidToken())
      .mockResolvedValue(noContent());

    render(<VerifyEmailStatus token="spent" />);
    const button = await screen.findByRole("button", { name: /reenviar correo/i });
    await userEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
  });
});

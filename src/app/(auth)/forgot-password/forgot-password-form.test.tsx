import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordForm } from "./forgot-password-form";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** What the endpoint actually answers: 202 with an empty body. */
const accepted = () => new Response(null, { status: 202 });

async function submit(email = "ana@example.com") {
  await userEvent.type(screen.getByLabelText("Correo electrónico"), email);
  await userEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));
}

describe("ForgotPasswordForm", () => {
  it("shows a Spanish validation error without calling the API", async () => {
    render(<ForgotPasswordForm />);
    await userEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));

    expect(await screen.findByText("Ingresa un correo electrónico válido")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not claim the address is registered", async () => {
    // The API answers an identical 202 either way, so the page cannot honestly
    // say "revisa tu correo" — that would be a promise the server never made.
    vi.mocked(fetch).mockResolvedValue(accepted());

    render(<ForgotPasswordForm />);
    await submit();

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/si esa dirección está registrada/i);
    expect(screen.queryByText(/^revisa tu correo/i)).not.toBeInTheDocument();
  });

  it("handles the empty 202 body without treating it as a failure", async () => {
    // `/forgot-password` returns no body at all, deliberately. Parsing it as
    // JSON would throw and show a successful request as an error.
    vi.mocked(fetch).mockResolvedValue(accepted());

    render(<ForgotPasswordForm />);
    await submit();

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces the form once the request goes through", async () => {
    // Leaving it mounted invites a second submit that spends another of the
    // three requests this address gets in an hour and does nothing new.
    vi.mocked(fetch).mockResolvedValue(accepted());

    render(<ForgotPasswordForm />);
    await submit();

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /enviar enlace/i })).not.toBeInTheDocument(),
    );
  });

  it("offers a way back to login from the success state", async () => {
    vi.mocked(fetch).mockResolvedValue(accepted());

    render(<ForgotPasswordForm />);
    await submit();

    expect(await screen.findByRole("link", { name: /volver a iniciar sesión/i }))
      .toHaveAttribute("href", "/login");
  });

  it("shows the rate limit as a form-level message with the wait", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
            details: { retryAfterSeconds: 300 },
          },
        }),
        { status: 429 },
      ),
    );

    render(<ForgotPasswordForm />);
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("300 segundos");
  });

  it("disables submit while in flight", async () => {
    let release: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );

    render(<ForgotPasswordForm />);
    await submit();

    const button = screen.getByRole("button", { name: /enviando/i });
    expect(button).toBeDisabled();

    // Settle before the test ends, so the state update lands inside act().
    release(accepted());
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { ResetPasswordForm } from "./reset-password-form";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
  pushMock.mockClear();
  refreshMock.mockClear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const noContent = () => new Response(null, { status: 204 });

const invalidToken = () =>
  new Response(
    JSON.stringify({
      error: { code: "RESET_TOKEN_INVALID", message: "That reset link is invalid or has expired" },
    }),
    { status: 400 },
  );

async function fillAndSubmit(password = "una-clave-nueva", confirm = password) {
  await userEvent.type(screen.getByLabelText("Contraseña nueva"), password);
  await userEvent.type(screen.getByLabelText("Repite la contraseña"), confirm);
  await userEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));
}

const renderForm = () => render(<ResetPasswordForm token="a-token" />);

describe("ResetPasswordForm", () => {
  it("enforces the same password rules as registration, client-side", async () => {
    renderForm();
    await fillAndSubmit("corta");

    expect(await screen.findByText("Usa al menos 10 caracteres")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirmation before calling the API", async () => {
    // A typo'd new password on an account you're locked out of is a bad way to
    // find out.
    renderForm();
    await fillAndSubmit("una-clave-nueva", "otra-clave-nueva");

    expect(await screen.findByText("Las contraseñas no coinciden")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the token from the URL with the new password", async () => {
    vi.mocked(fetch).mockResolvedValue(noContent());

    renderForm();
    await fillAndSubmit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      token: "a-token",
      password: "una-clave-nueva",
    });
  });

  it("redirects to login with a confirmation rather than logging in", async () => {
    // The API sets no cookie (T103): a reset link arriving in a mailbox is not
    // proof of session intent.
    vi.mocked(fetch).mockResolvedValue(noContent());

    renderForm();
    await fillAndSubmit();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login?reset=1"));
  });

  it("offers a new link instead of a dead end when the token is spent", async () => {
    vi.mocked(fetch).mockResolvedValue(invalidToken());

    renderForm();
    await fillAndSubmit();

    expect(await screen.findByText("Ese enlace ya no sirve")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pedir un enlace nuevo/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    // Never the server's English message.
    expect(screen.queryByText(/invalid or has expired/i)).not.toBeInTheDocument();
  });

  it("shows the rate limit as a form-level message", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
            details: { retryAfterSeconds: 90 },
          },
        }),
        { status: 429 },
      ),
    );

    renderForm();
    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("90 segundos");
  });

  it("disables submit in flight and keeps it disabled after success", async () => {
    // The token is single-use: a double-submit would burn it and land the user
    // on the expired screen having just succeeded.
    let release: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );

    renderForm();
    await fillAndSubmit();

    expect(screen.getByRole("button", { name: /guardando/i })).toBeDisabled();

    release(noContent());
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { LoginForm } from "./login-form";

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

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
  await userEvent.type(screen.getByLabelText("Contraseña"), "correcthorsebattery");
  await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
}

describe("LoginForm", () => {
  it("shows a Spanish validation error without calling the API", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByText("Ingresa un correo electrónico válido")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows invalid credentials as a form-level message, not on email or password", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" },
        }),
        { status: 401 },
      ),
    );

    render(<LoginForm />);
    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
    // The server's English message never reaches the user.
    expect(screen.queryByText(/email or password is incorrect/i)).not.toBeInTheDocument();
  });

  it("redirects home on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" } }), { status: 200 }),
    );

    render(<LoginForm />);
    await fillAndSubmit();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });
});

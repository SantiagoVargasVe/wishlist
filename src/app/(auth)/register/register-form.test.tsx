import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { RegisterForm } from "./register-form";

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
  await userEvent.type(screen.getByLabelText("Nombre"), "Ana");
  await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
  await userEvent.type(screen.getByLabelText("Contraseña"), "correcthorsebattery");
  await userEvent.type(screen.getByLabelText("Código de invitación"), "K7MQ2XPT9R");
  await userEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));
}

describe("RegisterForm", () => {
  it("shows a Spanish validation error without calling the API", async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText("Ingresa un nombre")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps EMAIL_TAKEN onto the email field, in Spanish", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "EMAIL_TAKEN", message: "An account with that email already exists" },
        }),
        { status: 409 },
      ),
    );

    render(<RegisterForm />);
    await fillAndSubmit();

    expect(await screen.findByText("Ya existe una cuenta con ese correo")).toBeInTheDocument();
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
  });

  it("maps INVITE_ALREADY_USED onto the invite code field", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "INVITE_ALREADY_USED", message: "That invite code has been used" },
        }),
        { status: 409 },
      ),
    );

    render(<RegisterForm />);
    await fillAndSubmit();

    expect(await screen.findByText("Ese código de invitación ya fue usado")).toBeInTheDocument();
  });

  it("redirects home on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" }, wishlist: { id: "1" } }), { status: 201 }),
    );

    render(<RegisterForm />);
    await fillAndSubmit();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });
});

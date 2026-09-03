import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({ currentSession: vi.fn() }));
vi.mock("../_ui/toast", () => ({ Toaster: () => null }));
vi.mock("../_ui/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("./invite-button", () => ({ InviteButton: () => <button>Invitar (mock)</button> }));

import { currentSession } from "@/server/auth/session";

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("shows the invite entry point when a session exists", async () => {
    vi.mocked(currentSession).mockResolvedValue({ userId: "user-1", emailVerified: true });

    render(await AppShell({ children: <div>content</div> }));

    expect(screen.getByRole("button", { name: "Invitar (mock)" })).toBeInTheDocument();
  });

  it("shows a log-in link, not the invite entry point, for a logged-out visitor (T095)", async () => {
    vi.mocked(currentSession).mockResolvedValue(null);

    render(await AppShell({ children: <div>content</div> }));

    expect(screen.queryByRole("button", { name: "Invitar (mock)" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("always renders its children", async () => {
    vi.mocked(currentSession).mockResolvedValue(null);

    render(await AppShell({ children: <div>page content</div> }));

    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("prompts a logged-in user whose address is unverified (T109)", async () => {
    vi.mocked(currentSession).mockResolvedValue({ userId: "user-1", emailVerified: false });

    render(await AppShell({ children: <div>content</div> }));

    expect(screen.getByRole("button", { name: /reenviar correo/i })).toBeInTheDocument();
    // Still a prompt, never a wall: the page renders underneath it.
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("does not prompt a verified user", async () => {
    vi.mocked(currentSession).mockResolvedValue({ userId: "user-1", emailVerified: true });

    render(await AppShell({ children: <div>content</div> }));

    expect(screen.queryByRole("button", { name: /reenviar correo/i })).not.toBeInTheDocument();
  });

  it("does not prompt a logged-out visitor", async () => {
    // Verification is meaningless without an account, and a visitor arriving
    // cold on a shared list should see the list, not a nag.
    vi.mocked(currentSession).mockResolvedValue(null);

    render(await AppShell({ children: <div>content</div> }));

    expect(screen.queryByRole("button", { name: /reenviar correo/i })).not.toBeInTheDocument();
  });
});

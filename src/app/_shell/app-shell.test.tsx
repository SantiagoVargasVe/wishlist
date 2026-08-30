import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({ currentUserId: vi.fn() }));
vi.mock("../_ui/toast", () => ({ Toaster: () => null }));
vi.mock("../_ui/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("./invite-button", () => ({ InviteButton: () => <button>Invitar (mock)</button> }));

import { currentUserId } from "@/server/auth/session";

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("shows the invite entry point when a session exists", async () => {
    vi.mocked(currentUserId).mockResolvedValue("user-1");

    render(await AppShell({ children: <div>content</div> }));

    expect(screen.getByRole("button", { name: "Invitar (mock)" })).toBeInTheDocument();
  });

  it("shows a log-in link, not the invite entry point, for a logged-out visitor (T095)", async () => {
    vi.mocked(currentUserId).mockResolvedValue(null);

    render(await AppShell({ children: <div>content</div> }));

    expect(screen.queryByRole("button", { name: "Invitar (mock)" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("always renders its children", async () => {
    vi.mocked(currentUserId).mockResolvedValue(null);

    render(await AppShell({ children: <div>page content</div> }));

    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});

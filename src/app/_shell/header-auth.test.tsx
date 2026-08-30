import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./invite-button", () => ({
  InviteButton: () => <button type="button">Invitar</button>,
}));

import { HeaderAuth } from "./header-auth";

describe("HeaderAuth", () => {
  it("shows a log-in link to an anonymous visitor, not the invite button", () => {
    render(<HeaderAuth isLoggedIn={false} />);

    const link = screen.getByRole("link", { name: "Iniciar sesión" });
    expect(link).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Invitar" })).not.toBeInTheDocument();
  });

  it("shows the invite button to a logged-in user, not the log-in link", () => {
    render(<HeaderAuth isLoggedIn />);

    expect(screen.getByRole("button", { name: "Invitar" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Iniciar sesión" })).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/queries", () => ({
  useClaimMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUnclaimMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/app/_ui/toast", () => ({
  Toast: { useToastManager: () => ({ add: vi.fn() }) },
}));

const getClaimTokenMock = vi.fn();
vi.mock("@/lib/claim-tokens", () => ({
  getClaimToken: (...args: unknown[]) => getClaimTokenMock(...args),
  setClaimToken: vi.fn(),
  removeClaimToken: vi.fn(),
}));

import type { PublicVisitorItem } from "@/server/services/public-wishlist";

import { ClaimButton } from "./claim-button";

const item: PublicVisitorItem = {
  id: "i1",
  url: "https://example.com/x",
  title: "Bicicleta",
  notes: null,
  imagePath: null,
  priceAmount: null,
  priceCurrency: null,
  claimed: false,
};

beforeEach(() => {
  getClaimTokenMock.mockReset().mockReturnValue(null);
});

describe("ClaimButton", () => {
  it("gives the tap target a >=44px min height with vertical padding (T096)", () => {
    render(<ClaimButton slug="s1" item={item} />);
    const button = screen.getByRole("button", { name: "Marcar como comprado" });
    expect(button).toHaveClass("min-h-11", "py-2.5");
  });
});

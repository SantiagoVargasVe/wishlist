import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ apiFetch: vi.fn() }));

import type { PublicVisitorWishlist } from "@/server/services/public-wishlist";

import { apiFetch } from "./client";
import { queryKeys } from "./keys";
import { useClaimMutation } from "./queries";

const baseWishlist: PublicVisitorWishlist = {
  title: "Wishlist",
  ownerDisplayName: "Ana",
  items: [
    {
      id: "item-1",
      url: "https://example.com",
      title: "Bici",
      notes: null,
      imagePath: null,
      priceAmount: null,
      priceCurrency: null,
      claimed: false,
    },
  ],
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe("useClaimMutation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("flips claimed to true before the request resolves — the optimistic part", async () => {
    const { client, Wrapper } = createWrapper();
    client.setQueryData(queryKeys.wishlist("slug1"), baseWishlist);

    let resolveClaim!: (value: { claimToken: string }) => void;
    vi.mocked(apiFetch).mockReturnValue(
      new Promise((resolve) => {
        resolveClaim = resolve;
      }),
    );

    const { result } = renderHook(() => useClaimMutation("slug1"), { wrapper: Wrapper });

    act(() => {
      result.current.mutate("item-1");
    });

    await waitFor(() => {
      const data = client.getQueryData<PublicVisitorWishlist>(queryKeys.wishlist("slug1"));
      expect(data?.items[0].claimed).toBe(true);
    });
    // Still in flight — the flip above happened before the request resolved.
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      resolveClaim({ claimToken: "tok" });
      await waitFor(() => expect(result.current.isPending).toBe(false));
    });
  });

  it("rolls back the optimistic flip when the request fails", async () => {
    const { client, Wrapper } = createWrapper();
    client.setQueryData(queryKeys.wishlist("slug1"), baseWishlist);
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useClaimMutation("slug1"), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate("item-1");
      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    const data = client.getQueryData<PublicVisitorWishlist>(queryKeys.wishlist("slug1"));
    expect(data?.items[0].claimed).toBe(false);
  });
});

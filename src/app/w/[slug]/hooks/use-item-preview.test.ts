import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/queries", () => ({ usePreviewQuery: vi.fn() }));

import { usePreviewQuery } from "@/lib/api/queries";
import type { PreviewResult } from "@/server/og/preview";

import { useItemPreview } from "./use-item-preview";

const OK_RESULT: PreviewResult = {
  title: "Widget",
  imageUrl: "https://cdn.example/w.jpg",
  price: "49.99",
  currency: "USD",
  siteName: "example.com",
  ogStatus: "ok",
};

function mockPreview(data: PreviewResult | undefined) {
  vi.mocked(usePreviewQuery).mockReturnValue({
    data,
    isFetching: false,
  } as ReturnType<typeof usePreviewQuery>);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useItemPreview", () => {
  it("does not query while the url is not yet schema-valid", () => {
    mockPreview(undefined);

    renderHook(({ url }) => useItemPreview(url, vi.fn()), { initialProps: { url: "" } });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(vi.mocked(usePreviewQuery)).toHaveBeenLastCalledWith(null);
  });

  it("queries the debounced url once it becomes schema-valid", () => {
    mockPreview(undefined);

    const { rerender } = renderHook(({ url }) => useItemPreview(url, vi.fn()), {
      initialProps: { url: "" },
    });
    rerender({ url: "https://example.com/product" });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(vi.mocked(usePreviewQuery)).toHaveBeenLastCalledWith("https://example.com/product");
  });

  it("prefills title, priceAmount, and priceCurrency once a result arrives", () => {
    mockPreview(OK_RESULT);
    const setValue = vi.fn();

    renderHook(({ url }) => useItemPreview(url, setValue), {
      initialProps: { url: "https://example.com/product" },
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(setValue).toHaveBeenCalledWith("title", "Widget");
    expect(setValue).toHaveBeenCalledWith("priceAmount", "49.99");
    expect(setValue).toHaveBeenCalledWith("priceCurrency", "USD");
  });

  it("does not prefill price when the scrape found none", () => {
    mockPreview({ ...OK_RESULT, price: null, currency: null });
    const setValue = vi.fn();

    renderHook(({ url }) => useItemPreview(url, setValue), {
      initialProps: { url: "https://example.com/product" },
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(setValue).toHaveBeenCalledWith("title", "Widget");
    expect(setValue).not.toHaveBeenCalledWith("priceAmount", expect.anything());
  });

  it("does not re-apply the same url's result on a second render", () => {
    mockPreview(OK_RESULT);
    const setValue = vi.fn();

    const { rerender } = renderHook(({ url }) => useItemPreview(url, setValue), {
      initialProps: { url: "https://example.com/product" },
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(setValue).toHaveBeenCalledTimes(3);

    rerender({ url: "https://example.com/product" });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(setValue).toHaveBeenCalledTimes(3);
  });
});

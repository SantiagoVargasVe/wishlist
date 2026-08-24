import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./client";
import { ApiError } from "./errors";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("returns parsed JSON on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ wishlist: { id: "1" } }), { status: 200 }),
    );

    const result = await apiFetch<{ wishlist: { id: string } }>("/api/wishlists");
    expect(result).toEqual({ wishlist: { id: "1" } });
  });

  it("returns undefined for a 204 without attempting to parse a body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await apiFetch("/api/wishlists/1");
    expect(result).toBeUndefined();
  });

  it("maps the error envelope to a typed ApiError with code, message, status, details", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "CONFIRM_DELETE_ORPHANS",
            message: "Some items only belong to this list",
            details: { orphanItems: [{ id: "1", title: "X" }] },
          },
        }),
        { status: 409 },
      ),
    );

    const error = await apiFetch("/api/wishlists/1", { method: "DELETE" }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("CONFIRM_DELETE_ORPHANS");
    expect(error.message).toBe("Some items only belong to this list");
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ orphanItems: [{ id: "1", title: "X" }] });
  });

  it("falls back to a generic error when the body isn't valid JSON", async () => {
    // e.g. an upstream proxy's HTML error page, or the server dying mid-response.
    vi.mocked(fetch).mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    const error: ApiError = await apiFetch("/api/me").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("UNKNOWN");
    expect(error.status).toBe(502);
  });

  it("sets Content-Type only when a body is actually sent", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));

    await apiFetch("/api/wishlists", {
      method: "POST",
      body: JSON.stringify({ title: "Birthday" }),
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("never sets Content-Type on a bodyless request like a bare DELETE", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await apiFetch("/api/items/1", { method: "DELETE" });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.has("Content-Type")).toBe(false);
  });
});

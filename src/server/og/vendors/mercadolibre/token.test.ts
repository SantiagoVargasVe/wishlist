import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMeliTokenProvider } from "./token";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("createMeliTokenProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts a client_credentials grant and returns the access token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: "APP_USR-abc", expires_in: 21600 }),
    );
    const getToken = createMeliTokenProvider(fetchImpl);

    const token = await getToken("client-id", "client-secret");

    expect(token).toBe("APP_USR-abc");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.mercadolibre.com/oauth/token");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("client-id");
    expect(body.get("client_secret")).toBe("client-secret");
  });

  it("reuses the cached token instead of fetching again while it's still valid", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: "APP_USR-abc", expires_in: 21600 }),
    );
    const getToken = createMeliTokenProvider(fetchImpl);

    await getToken("client-id", "client-secret");
    vi.advanceTimersByTime(1000 * 60 * 60); // 1h — well inside the 6h lifetime
    await getToken("client-id", "client-secret");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fetches a fresh token once the cached one has expired", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "first", expires_in: 21600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "second", expires_in: 21600 }));
    const getToken = createMeliTokenProvider(fetchImpl);

    const first = await getToken("client-id", "client-secret");
    vi.advanceTimersByTime(21600 * 1000 + 1); // past the real expiry
    const second = await getToken("client-id", "client-secret");

    expect(first).toBe("first");
    expect(second).toBe("second");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws when the token endpoint rejects the credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 400));
    const getToken = createMeliTokenProvider(fetchImpl);

    await expect(getToken("bad-id", "bad-secret")).rejects.toThrow(/token exchange failed/);
  });

  it("gives each provider instance its own cache, not a shared one", async () => {
    const fetchImplA = vi.fn().mockResolvedValue(jsonResponse({ access_token: "a", expires_in: 21600 }));
    const fetchImplB = vi.fn().mockResolvedValue(jsonResponse({ access_token: "b", expires_in: 21600 }));

    const getTokenA = createMeliTokenProvider(fetchImplA);
    const getTokenB = createMeliTokenProvider(fetchImplB);

    await getTokenA("client-id", "client-secret");
    await getTokenB("client-id", "client-secret");

    expect(fetchImplA).toHaveBeenCalledTimes(1);
    expect(fetchImplB).toHaveBeenCalledTimes(1);
  });
});

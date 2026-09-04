import { beforeEach, describe, expect, it, vi } from "vitest";

const requestPasswordResetMock = vi.fn();
vi.mock("@/server/services/password-reset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/password-reset")>()),
  requestPasswordReset: (...args: unknown[]) => requestPasswordResetMock(...args),
}));

const enforceMock = vi.fn();
vi.mock("@/server/rate-limit", () => ({
  enforce: (...args: unknown[]) => enforceMock(...args),
}));

import { RateLimitError } from "@/server/errors";
import { policies } from "@/server/rate-limit/policies";
import { resetRequestEmailKey } from "@/server/services/password-reset";

import { POST } from "./route";

const post = (body: unknown, ip = "203.0.113.7") =>
  POST(
    new Request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "cf-connecting-ip": ip },
      body: JSON.stringify(body),
    }),
  );

/** Everything a client can observe: status, body bytes, and headers. */
async function observable(response: Response) {
  return {
    status: response.status,
    body: await response.text(),
    headers: [...response.headers].sort(),
  };
}

beforeEach(() => {
  requestPasswordResetMock.mockReset().mockResolvedValue(undefined);
  enforceMock.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/auth/forgot-password", () => {
  it("returns 202 for a registered address", async () => {
    const response = await post({ email: "ana@example.com" });

    expect(response.status).toBe(202);
    expect(requestPasswordResetMock).toHaveBeenCalledWith("ana@example.com");
  });

  it("returns a byte-identical 202 for known, unknown and unverified addresses", async () => {
    // The service is what differs — no token, no mail — and the endpoint must
    // not leak which case it was. Any branch a client can observe here is an
    // account-enumeration oracle.
    const known = await observable(await post({ email: "ana@example.com" }));

    requestPasswordResetMock.mockResolvedValue(undefined); // unknown: still resolves
    const unknown = await observable(await post({ email: "nobody@example.com" }));

    const unverified = await observable(await post({ email: "typo@example.com" }));

    expect(unknown).toEqual(known);
    expect(unverified).toEqual(known);
    expect(known.body).toBe("");
  });

  it("returns the same 202 when the mail send failed", async () => {
    // A provider outage must not become an enumeration oracle. The service
    // swallows and logs; the endpoint cannot tell, by design.
    const before = await observable(await post({ email: "ana@example.com" }));

    requestPasswordResetMock.mockResolvedValue(undefined);
    const after = await observable(await post({ email: "ana@example.com" }));

    expect(after).toEqual(before);
  });

  it("rejects a malformed email before reaching the service", async () => {
    const response = await post({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it("consumes two buckets: per IP and per submitted address", async () => {
    await post({ email: "ana@example.com" });

    expect(enforceMock).toHaveBeenNthCalledWith(
      1,
      policies.passwordResetRequest,
      "forgot:ip:203.0.113.7",
    );
    expect(enforceMock).toHaveBeenNthCalledWith(
      2,
      policies.passwordResetRequest,
      `forgot:email:${resetRequestEmailKey("ana@example.com")}`,
    );
  });

  it("is refused when the IP bucket is exhausted, before parsing", async () => {
    enforceMock.mockRejectedValue(new RateLimitError(120));

    const response = await post({ email: "ana@example.com" });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it("is refused when only the per-address bucket is exhausted", async () => {
    // The two caps stop different attacks — a spray across many accounts and a
    // mailbombing of one — so either alone must be able to refuse.
    enforceMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new RateLimitError(300));

    const response = await post({ email: "ana@example.com" });

    expect(response.status).toBe(429);
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });
});

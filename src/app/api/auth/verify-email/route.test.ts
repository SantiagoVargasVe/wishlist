import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeVerificationTokenMock = vi.fn();
vi.mock("@/server/services/email-verification", () => ({
  consumeVerificationToken: (...args: unknown[]) => consumeVerificationTokenMock(...args),
}));

const enforceMock = vi.fn();
vi.mock("@/server/rate-limit", () => ({
  enforce: (...args: unknown[]) => enforceMock(...args),
}));

import { EmailVerificationErrors, RateLimitError } from "@/server/errors";

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  consumeVerificationTokenMock.mockReset().mockResolvedValue({ userId: "u1" });
  enforceMock.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/auth/verify-email", () => {
  it("returns 204 and consumes the token", async () => {
    const response = await post({ token: "a-token" });

    expect(response.status).toBe(204);
    expect(consumeVerificationTokenMock).toHaveBeenCalledWith("a-token");
  });

  it("does not require a session", async () => {
    // Deliberate: someone opening a link from their mailbox on a different
    // device has no session, and requiring one would defeat the flow.
    const response = await post({ token: "a-token" });
    expect(response.status).toBe(204);
  });

  it("rejects a missing token before touching the service", async () => {
    const response = await post({});

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    expect(consumeVerificationTokenMock).not.toHaveBeenCalled();
  });

  it("rejects an absurdly long token at the boundary", async () => {
    const response = await post({ token: "x".repeat(5000) });

    expect(response.status).toBe(400);
    expect(consumeVerificationTokenMock).not.toHaveBeenCalled();
  });

  it("returns one generic 400 for an invalid, expired, used or wrong-purpose token", async () => {
    consumeVerificationTokenMock.mockRejectedValue(
      EmailVerificationErrors.invalidToken(),
    );

    const response = await post({ token: "spent" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VERIFICATION_TOKEN_INVALID");
  });

  it("is rate limited per IP", async () => {
    enforceMock.mockRejectedValue(new RateLimitError(42));

    const response = await post({ token: "a-token" });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(consumeVerificationTokenMock).not.toHaveBeenCalled();
  });
});

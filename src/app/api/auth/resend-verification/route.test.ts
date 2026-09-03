import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserIdMock = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: () => requireUserIdMock(),
}));

const getUserByIdMock = vi.fn();
vi.mock("@/server/services/auth", () => ({
  getUserById: (...args: unknown[]) => getUserByIdMock(...args),
}));

const sendVerificationEmailMock = vi.fn();
vi.mock("@/server/services/email-verification", () => ({
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmailMock(...args),
}));

const enforceMock = vi.fn();
vi.mock("@/server/rate-limit", () => ({
  enforce: (...args: unknown[]) => enforceMock(...args),
}));

import { RateLimitError, UnauthorizedError } from "@/server/errors";
import { policies } from "@/server/rate-limit/policies";

import { POST } from "./route";

const post = () =>
  POST(new Request("http://localhost/api/auth/resend-verification", { method: "POST" }));

const user = { id: "u1", email: "ana@example.com", displayName: "Ana" };

beforeEach(() => {
  requireUserIdMock.mockReset().mockResolvedValue("u1");
  getUserByIdMock.mockReset().mockResolvedValue(user);
  sendVerificationEmailMock.mockReset().mockResolvedValue(undefined);
  enforceMock.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/auth/resend-verification", () => {
  it("sends a fresh verification email and returns 204", async () => {
    const response = await post();

    expect(response.status).toBe(204);
    expect(sendVerificationEmailMock).toHaveBeenCalledWith(user);
  });

  it("requires a session", async () => {
    requireUserIdMock.mockRejectedValue(new UnauthorizedError());

    const response = await post();

    expect(response.status).toBe(401);
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });

  it("buckets the rate limit per user, not per IP", async () => {
    // The endpoint is authenticated, so the account is the honest key — a
    // household sharing one address shouldn't spend each other's budget.
    await post();

    expect(enforceMock).toHaveBeenCalledWith(
      policies.emailVerifyResend,
      "verify-resend:u1",
    );
  });

  it("returns 429 when the limit is spent", async () => {
    enforceMock.mockRejectedValue(new RateLimitError(60));

    const response = await post();

    expect(response.status).toBe(429);
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });

  it("still returns 204 when the send fails", async () => {
    // sendVerificationEmail swallows its own failures; there is nothing useful
    // to tell the caller, and the operator sees it in the log.
    const response = await post();
    expect(response.status).toBe(204);
  });
});

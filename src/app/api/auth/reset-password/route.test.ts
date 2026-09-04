import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeResetTokenMock = vi.fn();
vi.mock("@/server/services/password-reset", () => ({
  consumeResetToken: (...args: unknown[]) => consumeResetTokenMock(...args),
}));

const enforceMock = vi.fn();
vi.mock("@/server/rate-limit", () => ({
  enforce: (...args: unknown[]) => enforceMock(...args),
}));

import { PasswordResetErrors, RateLimitError } from "@/server/errors";
import { policies } from "@/server/rate-limit/policies";

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.7" },
      body: JSON.stringify(body),
    }),
  );

const valid = { token: "a-token", password: "una-clave-nueva" };

beforeEach(() => {
  consumeResetTokenMock.mockReset().mockResolvedValue({ userId: "u1" });
  enforceMock.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/auth/reset-password", () => {
  it("returns 204 and sets the new password", async () => {
    const response = await post(valid);

    expect(response.status).toBe(204);
    expect(consumeResetTokenMock).toHaveBeenCalledWith("a-token", "una-clave-nueva");
  });

  it("does not log the user in", async () => {
    // A reset link arriving in a mailbox is not proof of session intent, and
    // the user has just proven they can type the new password. T105 redirects
    // to /login.
    const response = await post(valid);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("holds the password to registration's rules", async () => {
    const response = await post({ token: "a-token", password: "corta" });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(body)).toContain("10 caracteres");
    expect(consumeResetTokenMock).not.toHaveBeenCalled();
  });

  it("rejects a missing token before touching the service", async () => {
    const response = await post({ password: "una-clave-nueva" });

    expect(response.status).toBe(400);
    expect(consumeResetTokenMock).not.toHaveBeenCalled();
  });

  it("returns one generic 400 for an invalid, expired or already-used token", async () => {
    consumeResetTokenMock.mockRejectedValue(PasswordResetErrors.invalidToken());

    const response = await post(valid);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("RESET_TOKEN_INVALID");
  });

  it("is rate limited per IP, before Argon2 runs", async () => {
    enforceMock.mockRejectedValue(new RateLimitError(90));

    const response = await post(valid);

    expect(response.status).toBe(429);
    expect(enforceMock).toHaveBeenCalledWith(
      policies.passwordResetConsume,
      "reset:203.0.113.7",
    );
    expect(consumeResetTokenMock).not.toHaveBeenCalled();
  });
});

import { SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieValue = vi.fn<() => string | undefined>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "wishlist_session" && cookieValue() !== undefined
        ? { value: cookieValue() }
        : undefined,
  }),
}));

const getSessionsValidFromMock = vi.fn<() => Promise<Date | null>>();
vi.mock("../services/auth", () => ({
  getSessionsValidFrom: () => getSessionsValidFromMock(),
}));

import { DomainError } from "../errors";
import { signSessionToken } from "./jwt";
import { currentUserId, requireUserId } from "./session";

const SECRET = "x".repeat(48);
const USER = "3f1c6b6a-1f0e-4c2a-9b6f-1a2b3c4d5e6f";

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
  process.env.AUTH_COOKIE_NAME = "wishlist_session";
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  process.env.APP_URL = "http://localhost:3000";
});

/** Mint a token whose `iat` is a chosen number of seconds from now. */
async function tokenIssuedAt(offsetSeconds: number): Promise<string> {
  const iat = Math.floor(Date.now() / 1000) + offsetSeconds;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(new TextEncoder().encode(SECRET));
}

const epochAt = (offsetSeconds: number) => new Date(Date.now() + offsetSeconds * 1000);

beforeEach(() => {
  cookieValue.mockReturnValue(undefined);
  getSessionsValidFromMock.mockResolvedValue(epochAt(-3600));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("currentUserId", () => {
  it("returns null when there is no cookie", async () => {
    expect(await currentUserId()).toBeNull();
    // Nothing to look up, so nothing is looked up.
    expect(getSessionsValidFromMock).not.toHaveBeenCalled();
  });

  it("resolves a valid session", async () => {
    cookieValue.mockReturnValue(await signSessionToken(USER));
    expect(await currentUserId()).toBe(USER);
  });

  it("reads the database exactly once", async () => {
    // This is the hottest path in the app; a second read here is a second read
    // on every authenticated request.
    cookieValue.mockReturnValue(await signSessionToken(USER));
    await currentUserId();
    expect(getSessionsValidFromMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a token issued before the epoch was bumped", async () => {
    // A password reset moved sessions_valid_from forward; the attacker's
    // 30-day cookie was minted before that and must stop working immediately.
    cookieValue.mockReturnValue(await tokenIssuedAt(-600));
    getSessionsValidFromMock.mockResolvedValue(epochAt(-300));

    expect(await currentUserId()).toBeNull();
  });

  it("accepts a token issued after the epoch was bumped", async () => {
    cookieValue.mockReturnValue(await tokenIssuedAt(-60));
    getSessionsValidFromMock.mockResolvedValue(epochAt(-300));

    expect(await currentUserId()).toBe(USER);
  });

  describe("the second boundary", () => {
    // `iat` has second resolution and sessions_valid_from is a timestamptz, so
    // the two meet inside the same second. Same-second must read as revoked:
    // the other way round leaves a one-second window in which an attacker's
    // freshly refreshed session survives the reset meant to kill it.
    const iat = 1_800_000_000;

    async function resolveAgainst(epochMs: number) {
      cookieValue.mockReturnValue(
        await new SignJWT({})
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(USER)
          .setIssuedAt(iat)
          .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
          .sign(new TextEncoder().encode(SECRET)),
      );
      getSessionsValidFromMock.mockResolvedValue(new Date(epochMs));
      return currentUserId();
    }

    it("revokes a token issued in the same second as the bump", async () => {
      expect(await resolveAgainst(iat * 1000)).toBeNull();
    });

    it("revokes it even when the bump landed later within that second", async () => {
      expect(await resolveAgainst(iat * 1000 + 999)).toBeNull();
    });

    it("keeps a token issued in the very next second", async () => {
      expect(await resolveAgainst((iat - 1) * 1000 + 999)).toBe(USER);
    });
  });

  it("returns null for a deleted user rather than throwing", async () => {
    cookieValue.mockReturnValue(await signSessionToken(USER));
    getSessionsValidFromMock.mockResolvedValue(null);

    expect(await currentUserId()).toBeNull();
  });

  it("returns null for a malformed token and never throws", async () => {
    for (const bad of ["not-a-token", "", "a.b.c"]) {
      cookieValue.mockReturnValue(bad);
      expect(await currentUserId()).toBeNull();
    }
    // A token that never verified is never worth a database round trip.
    expect(getSessionsValidFromMock).not.toHaveBeenCalled();
  });

  it("returns null for a token signed with a different secret", async () => {
    cookieValue.mockReturnValue(
      await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(USER)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode("y".repeat(48))),
    );

    expect(await currentUserId()).toBeNull();
  });

  it("returns null for a token with no iat", async () => {
    // Without one there is no way to tell whether the token predates a
    // revocation, and "can't tell" has to read as "not a session".
    cookieValue.mockReturnValue(
      await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(USER)
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(SECRET)),
    );

    expect(await currentUserId()).toBeNull();
  });
});

describe("requireUserId", () => {
  it("returns the id for a valid session", async () => {
    cookieValue.mockReturnValue(await signSessionToken(USER));
    expect(await requireUserId()).toBe(USER);
  });

  it("does not repeat the lookup currentUserId already did", async () => {
    cookieValue.mockReturnValue(await signSessionToken(USER));
    await requireUserId();
    expect(getSessionsValidFromMock).toHaveBeenCalledTimes(1);
  });

  it("throws UNAUTHORIZED for a revoked session", async () => {
    cookieValue.mockReturnValue(await tokenIssuedAt(-600));
    getSessionsValidFromMock.mockResolvedValue(epochAt(-300));

    await expect(requireUserId()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(requireUserId()).rejects.toBeInstanceOf(DomainError);
  });
});

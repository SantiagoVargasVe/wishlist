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

type Account = { sessionsValidFrom: Date; emailVerifiedAt: Date | null };
const getSessionAccountMock = vi.fn<() => Promise<Account | null>>();
vi.mock("../services/auth", () => ({
  getSessionAccount: () => getSessionAccountMock(),
}));

import { DomainError } from "../errors";
import { signSessionToken } from "./jwt";
import { currentSession, currentUserId, requireUserId } from "./session";

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

const epochAt = (offsetSeconds: number): Account => ({
  sessionsValidFrom: new Date(Date.now() + offsetSeconds * 1000),
  emailVerifiedAt: null,
});

beforeEach(() => {
  cookieValue.mockReturnValue(undefined);
  getSessionAccountMock.mockResolvedValue(epochAt(-3600));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("currentUserId", () => {
  it("returns null when there is no cookie", async () => {
    expect(await currentUserId()).toBeNull();
    // Nothing to look up, so nothing is looked up.
    expect(getSessionAccountMock).not.toHaveBeenCalled();
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
    expect(getSessionAccountMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a token issued before the epoch was bumped", async () => {
    // A password reset moved sessions_valid_from forward; the attacker's
    // 30-day cookie was minted before that and must stop working immediately.
    cookieValue.mockReturnValue(await tokenIssuedAt(-600));
    getSessionAccountMock.mockResolvedValue(epochAt(-300));

    expect(await currentUserId()).toBeNull();
  });

  it("accepts a token issued after the epoch was bumped", async () => {
    cookieValue.mockReturnValue(await tokenIssuedAt(-60));
    getSessionAccountMock.mockResolvedValue(epochAt(-300));

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
      getSessionAccountMock.mockResolvedValue({ sessionsValidFrom: new Date(epochMs), emailVerifiedAt: null });
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
    getSessionAccountMock.mockResolvedValue(null);

    expect(await currentUserId()).toBeNull();
  });

  it("returns null for a malformed token and never throws", async () => {
    for (const bad of ["not-a-token", "", "a.b.c"]) {
      cookieValue.mockReturnValue(bad);
      expect(await currentUserId()).toBeNull();
    }
    // A token that never verified is never worth a database round trip.
    expect(getSessionAccountMock).not.toHaveBeenCalled();
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
    expect(getSessionAccountMock).toHaveBeenCalledTimes(1);
  });

  it("throws UNAUTHORIZED for a revoked session", async () => {
    cookieValue.mockReturnValue(await tokenIssuedAt(-600));
    getSessionAccountMock.mockResolvedValue(epochAt(-300));

    await expect(requireUserId()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(requireUserId()).rejects.toBeInstanceOf(DomainError);
  });
});

describe("currentSession", () => {
  it("carries verification state out of the same read", async () => {
    // The app shell needs it on every render (T109); a second query for a
    // column already on the row being read would be waste on the hottest path.
    cookieValue.mockReturnValue(await signSessionToken(USER));
    getSessionAccountMock.mockResolvedValue({
      sessionsValidFrom: new Date(Date.now() - 3600_000),
      emailVerifiedAt: new Date(),
    });

    expect(await currentSession()).toEqual({ userId: USER, emailVerified: true });
    expect(getSessionAccountMock).toHaveBeenCalledTimes(1);
  });

  it("reports an unverified account as a perfectly good session", async () => {
    // Verification gates recovery and nothing else (ADR-0013) — an unverified
    // user is logged in like anyone else.
    cookieValue.mockReturnValue(await signSessionToken(USER));

    expect(await currentSession()).toEqual({ userId: USER, emailVerified: false });
  });

  it("is null for a revoked session", async () => {
    cookieValue.mockReturnValue(await tokenIssuedAt(-600));
    getSessionAccountMock.mockResolvedValue(epochAt(-300));

    expect(await currentSession()).toBeNull();
  });
});

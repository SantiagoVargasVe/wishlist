import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { signSessionToken, verifySessionToken } from "./jwt";

const SECRET = "x".repeat(48);

beforeAll(() => {
  // jwt.ts reads config lazily, so setting these before first use is enough.
  process.env.AUTH_SECRET = SECRET;
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  process.env.APP_URL = "http://localhost:3000";
});

const key = () => new TextEncoder().encode(SECRET);

describe("session tokens", () => {
  it("round-trips a user id and its issue time", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signSessionToken("user-123");
    const claims = await verifySessionToken(token);

    expect(claims?.userId).toBe("user-123");
    // `iat` is what makes a session revocable (T104): session resolution
    // compares it against users.sessions_valid_from.
    expect(claims?.issuedAt).toBeGreaterThanOrEqual(before);
    expect(claims?.issuedAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it("rejects a token whose payload was edited", async () => {
    // The actual attack: keep a valid signature, swap the subject for someone
    // else's id. If this ever passed, any logged-in user could become any other.
    const token = await signSessionToken("user-123");
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        sub: "victim-456",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");

    expect(
      await verifySessionToken(`${header}.${forgedPayload}.${signature}`),
    ).toBeNull();
  });

  it("rejects a corrupted signature", async () => {
    const token = await signSessionToken("user-123");
    const [header, payload, signature] = token.split(".");

    // Flip a character mid-signature, not the last one: HS256 signatures are 43
    // base64url characters encoding 32 bytes, so the final character carries
    // only 4 meaningful bits and changing it can decode to the same bytes.
    const mid = Math.floor(signature.length / 2);
    const corrupted =
      signature.slice(0, mid) +
      (signature[mid] === "A" ? "B" : "A") +
      signature.slice(mid + 1);

    expect(
      await verifySessionToken(`${header}.${payload}.${corrupted}`),
    ).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("attacker")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("y".repeat(48)));

    expect(await verifySessionToken(foreign)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key());

    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("rejects a token with no issued-at claim", async () => {
    // Without `iat` there is no way to tell whether the token predates a
    // revocation, and "can't tell" has to read as "not a session" (T104).
    const noIat = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setExpirationTime("1h")
      .sign(key());

    expect(await verifySessionToken(noIat)).toBeNull();
  });

  it("rejects a token with no subject", async () => {
    const noSub = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(key());

    expect(await verifySessionToken(noSub)).toBeNull();
  });

  it("rejects an unsigned `alg: none` token", async () => {
    // The classic JWT downgrade. jwtVerify is pinned to HS256 so this can never
    // be accepted, but the assertion documents the guarantee.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }))
      .toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "attacker", exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");

    expect(await verifySessionToken(`${header}.${payload}.`)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifySessionToken("not-a-token")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });
});

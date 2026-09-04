import "server-only";

import { SignJWT, jwtVerify } from "jose";

import { getConfig } from "../config";

/**
 * Session tokens.
 *
 * HS256 with AUTH_SECRET — symmetric is right here because the same service
 * both signs and verifies. Asymmetric would only matter if a separate party
 * needed to verify without being able to mint.
 */

const ALGORITHM = "HS256";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getConfig().AUTH_SECRET);
}

export type SessionClaims = {
  userId: string;
  /**
   * Seconds since the epoch, as `iat` is defined. Session resolution compares
   * it against `users.sessions_valid_from` so a reset can revoke tokens minted
   * before it (ADR-0012) — which is the only reason it is surfaced at all.
   */
  issuedAt: number;
};

export async function signSessionToken(userId: string): Promise<string> {
  const ttlDays = getConfig().AUTH_TOKEN_TTL_DAYS;

  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlDays}d`)
    .sign(secretKey());
}

/**
 * Verify and decode a session token.
 *
 * Returns null rather than throwing for *any* invalid token — expired,
 * tampered, malformed, wrong algorithm, or missing a claim we need. Callers
 * treat null as "not logged in".
 *
 * `jwtVerify` is given an explicit algorithm list so a token claiming
 * `alg: none` (or any other algorithm) can't be accepted.
 */
export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALGORITHM],
    });

    // No `iat` means no way to tell whether the token predates a revocation,
    // and "can't tell" has to read as "not a session". Every token this app
    // mints has one — `setIssuedAt()` in `signSessionToken`.
    if (!payload.sub || typeof payload.iat !== "number") return null;
    return { userId: payload.sub, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

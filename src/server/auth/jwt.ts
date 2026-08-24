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
 * tampered, malformed, wrong algorithm. Callers treat null as "not logged in".
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

    if (!payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

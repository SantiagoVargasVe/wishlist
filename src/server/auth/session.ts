import "server-only";

import { cookies } from "next/headers";

import { UnauthorizedError } from "../errors";
import { getSessionsValidFrom } from "../services/auth";
import { sessionCookieName } from "./cookie";
import { verifySessionToken } from "./jwt";

/**
 * Read the signed session from the request cookie.
 *
 * Returns null for absent, expired, tampered, malformed, and **revoked** tokens
 * alike — an invalid token means "not logged in", never "logged in anyway".
 *
 * Revocation is the part ADR-0003 originally left out, and ADR-0012 needed: a
 * password reset bumps `users.sessions_valid_from`, and a token issued before
 * that stops resolving. Someone resetting because another person knows their
 * password is not helped by a flow that leaves the other person's 30-day cookie
 * working.
 *
 * **The cost is a database read on every authenticated request.** That is
 * accepted deliberately and stated plainly in ADR-0012: a session table would
 * be the same read plus a lifecycle to maintain, the row is in Postgres next to
 * everything else the request needs, and it is the same trade the app makes
 * everywhere else — nothing is cached in a claim, precisely so a change takes
 * effect immediately. Do not add a cache here; a cache reintroduces exactly the
 * staleness this removes.
 */
export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  // Exactly one read, and the only one: `requireUserId` delegates here rather
  // than repeating it.
  const validFrom = await getSessionsValidFrom(claims.userId);
  // No row means the user was deleted. Nothing to compare against, and "the
  // account is gone" has to read as "not logged in", not as an exception.
  if (!validFrom) return null;

  return isIssuedAfter(claims.issuedAt, validFrom) ? claims.userId : null;
}

/**
 * Whether a token minted at `issuedAt` (seconds, as `iat` is defined) survives
 * an epoch of `validFrom` (a timestamptz, with sub-second precision).
 *
 * The two have different resolutions, and the direction of that mismatch is the
 * whole subtlety. A token minted at 10:00:00.200 carries `iat` = 10:00:00, so
 * comparing it against an epoch of 10:00:00.900 naively would make it look
 * *older* than a bump that actually happened after it — or, worse the other
 * way, let a token refreshed in the same second as the reset survive it.
 *
 * So the column is floored to seconds and the comparison is strict: the token
 * must have been issued in a **later** second than the epoch. Same-second is
 * treated as revoked. That costs a legitimate user nothing — the reset flow
 * does not log them in (T103), so their next token is minted whenever they
 * log in — and getting it backwards leaves a one-second window in which an
 * attacker's freshly refreshed session survives the reset meant to kill it.
 */
function isIssuedAfter(issuedAt: number, validFrom: Date): boolean {
  return issuedAt > Math.floor(validFrom.getTime() / 1000);
}

/**
 * Same as `currentUserId`, but for the routes that require a session rather
 * than merely reading one — every "A" (authenticated) or "O" (owner-only)
 * endpoint in api-contract.md calls this first.
 */
export async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

import "server-only";

import { cookies } from "next/headers";

import { UnauthorizedError } from "../errors";
import { sessionCookieName } from "./cookie";
import { verifySessionToken } from "./jwt";

/**
 * Read the signed session from the request cookie.
 *
 * Returns null for absent, expired, tampered, or malformed tokens alike — an
 * invalid token means "not logged in", never "logged in anyway".
 */
export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  return claims?.userId ?? null;
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

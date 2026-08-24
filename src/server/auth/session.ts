import "server-only";

import { cookies } from "next/headers";

import { sessionCookieName } from "./cookie";
import { verifySessionToken } from "./jwt";

/**
 * Read the signed session from the request cookie.
 *
 * Returns null for absent, expired, tampered, or malformed tokens alike — an
 * invalid token means "not logged in", never "logged in anyway".
 *
 * T013 builds the general guards (requireUser, ownership checks) on top of this.
 */
export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  return claims?.userId ?? null;
}

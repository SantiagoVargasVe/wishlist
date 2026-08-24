import { NextResponse } from "next/server";

import {
  clearedSessionCookieOptions,
  sessionCookieName,
} from "@/server/auth/cookie";

import { handle } from "../../_lib/respond";

/**
 * POST /api/auth/logout
 *
 * Idempotent: clearing an absent cookie is a no-op, so calling this while
 * logged out succeeds rather than erroring.
 */
export const POST = handle(async () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName(), "", clearedSessionCookieOptions());
  return response;
});

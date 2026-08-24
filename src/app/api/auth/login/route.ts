import { NextResponse } from "next/server";

import { loginSchema } from "@/lib/schemas/auth";
import { sessionCookieName, sessionCookieOptions } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/jwt";
import { loginUser } from "@/server/services/auth";

import { handle } from "../../_lib/respond";

/**
 * POST /api/auth/login
 *
 * On success sets the session cookie. Every failure — unknown email, wrong
 * password — returns the same 401, so login can't be used to discover which
 * addresses are registered.
 */
export const POST = handle(async (request) => {
  const input = loginSchema.parse(await request.json());
  const user = await loginUser(input);

  const response = NextResponse.json({ user }, { status: 200 });
  response.cookies.set(
    sessionCookieName(),
    await signSessionToken(user.id),
    sessionCookieOptions(),
  );

  return response;
});

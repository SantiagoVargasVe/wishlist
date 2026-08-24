import { NextResponse } from "next/server";

import { registerSchema } from "@/lib/schemas/auth";
import { clientIp } from "@/server/rate-limit/client-ip";
import { enforce } from "@/server/rate-limit";
import { policies } from "@/server/rate-limit/policies";
import { sessionCookieName, sessionCookieOptions } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/jwt";
import { registerUser } from "@/server/services/auth";

import { handle } from "../../_lib/respond";

/**
 * POST /api/auth/register
 *
 * Thin by design: parse, delegate, serialise. Any domain rule that looks like
 * an `if` belongs in the service.
 *
 * Sets the session cookie on success, same as login — there's no reason to
 * make someone log in a second time immediately after creating their account.
 * The response includes the default wishlist so the client can redirect
 * straight to `/w/{slug}` without a second round trip.
 */
export const POST = handle(async (request) => {
  await enforce(policies.register, `register:${clientIp(request)}`);

  const input = registerSchema.parse(await request.json());
  const { user, wishlist } = await registerUser(input);

  const response = NextResponse.json({ user, wishlist }, { status: 201 });
  response.cookies.set(
    sessionCookieName(),
    await signSessionToken(user.id),
    sessionCookieOptions(),
  );

  return response;
});

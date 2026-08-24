import "server-only";

import { getConfig } from "../config";

/**
 * Session cookie shape.
 *
 * httpOnly is the point (ADR-0003): this app renders user-supplied content and
 * scraped third-party metadata on public pages, so a script-readable token is a
 * bad fit. httpOnly means no JavaScript can read it at all.
 */

export function sessionCookieName(): string {
  return getConfig().AUTH_COOKIE_NAME;
}

type CookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge?: number;
};

export function sessionCookieOptions(): CookieOptions {
  const config = getConfig();

  return {
    httpOnly: true,
    // SameSite=Lax is the CSRF control. Frontend and API are same-origin, so no
    // separate token is needed. If a cross-origin client ever appears, add one
    // rather than weakening this.
    sameSite: "lax",
    // Secure only in production: browsers silently drop Secure cookies over
    // plain-HTTP localhost, which would make dev login fail with no error.
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: config.AUTH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  };
}

/** Same attributes, zero lifetime — what actually removes a cookie. */
export function clearedSessionCookieOptions(): CookieOptions {
  return { ...sessionCookieOptions(), maxAge: 0 };
}

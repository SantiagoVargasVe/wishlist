# ADR-0003 — JWT in an httpOnly cookie, not localStorage

**Status:** Accepted · 2026-08-23 · the last consequence below is **superseded** by
[ADR-0012](0012-password-reset-via-single-use-token.md)

## Context

The requirement was "basic JSON web token" auth. JWTs are commonly stored in `localStorage` and
sent as an `Authorization: Bearer` header — the default in most tutorials.

## Decision

Sign a JWT and deliver it in an **httpOnly, Secure, SameSite=Lax** cookie. 30-day expiry, signed
with `AUTH_SECRET`.

## Why

`localStorage` is readable by any JavaScript on the page, so a single XSS hands over the token.
This app renders **user-supplied content on public pages** — item titles, notes, and scraped OG
metadata from hostile third-party sites. That's a broader XSS surface than a typical dashboard,
which makes a script-readable token a poor fit.

`httpOnly` means script can't read it at all.

The usual argument for `localStorage` is that cookies bring CSRF. That's mostly a problem for
cross-origin setups — here the frontend and API are the same origin, so `SameSite=Lax` blocks
cross-site state-changing requests without extra machinery.

This still satisfies "basic JWT": same token, same signing, different transport.

## Consequences

- No refresh-token rotation in v1. A 30-day cookie is proportionate for a family wishlist.
- If a cross-origin client ever appears (mobile app), add a `Bearer` path *alongside* the cookie
  rather than loosening `SameSite`.
- Logout clears the cookie. Tokens aren't revocable server-side before expiry — accepted; add a
  session table if that ever matters.

  **Superseded (T104).** It mattered:
  [ADR-0012](0012-password-reset-via-single-use-token.md) needed a password reset to actually end
  the sessions of whoever prompted it. The answer was not a session table but a single column,
  `users.sessions_valid_from`, compared against the JWT's `iat` in `currentUserId()` — the same
  revocation with no session lifecycle to maintain. The cost, stated plainly there, is that
  session resolution is now a database read rather than pure crypto.

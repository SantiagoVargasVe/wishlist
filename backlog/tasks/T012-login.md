---
id: T012
title: Login, logout, and JWT session cookie
epic: E2-auth
status: done
depends_on: [T011]
size: M
---

## Context

`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

The token is a JWT in an **httpOnly cookie**, not `localStorage`
([ADR-0003](../../docs/adr/0003-jwt-in-httponly-cookie.md)). This app renders user-supplied
content — item titles, notes, scraped OG metadata from hostile third-party sites — on public
pages, which is a broader XSS surface than a typical dashboard. A script-readable token is a poor
fit for that.

`/api/auth/me` is included so the cookie can be proven to round-trip; the general session helper
and ownership guards are T013.

Read [security.md](../../docs/context/security.md) § *Authentication* and
[api-contract.md](../../docs/context/api-contract.md).

## Acceptance criteria

- [ ] JWT signed HS256 with `AUTH_SECRET`, subject = user id, expiry from `AUTH_TOKEN_TTL_DAYS`
- [ ] Cookie is `httpOnly`, `SameSite=Lax`, `path=/`, and `Secure` **in production only** —
      a `Secure` cookie is silently dropped over plain-HTTP localhost, which breaks dev login
- [ ] `SameSite=Lax` is the CSRF control. Frontend and API are same-origin, so no token is needed;
      if a cross-origin client ever appears, add one rather than loosening this.
- [ ] Login failures are **generic** — never distinguish "no such user" from "wrong password"
- [ ] **Constant-ish time on unknown email.** Skipping the hash verification when no user exists
      returns visibly faster and leaks which addresses are registered. Verify against a dummy
      hash instead.
- [ ] Email lookup is case-insensitive (citext handles this) so login matches registration
- [ ] Logout clears the cookie, and is safe to call when not logged in
- [ ] `GET /api/auth/me` returns the current user or `401`, and **never** the password hash
- [ ] An expired or tampered token is rejected, not treated as anonymous-but-fine
- [ ] Tests: correct credentials; wrong password; unknown email; case-variant email; token
      round-trip; expired token rejected; tampered signature rejected; timing gap between unknown
      email and wrong password stays small
- [ ] `npm run test:ci` passes

## Out of scope

Rate limiting on login (T042) — noted in the contract as 10 per 15 min per IP. The reusable
session helper and ownership guards (T013). Login UI (T014).

## Files likely touched

```
src/server/auth/jwt.ts
src/server/auth/cookie.ts
src/server/services/auth.ts
src/app/api/auth/{login,logout,me}/route.ts
```

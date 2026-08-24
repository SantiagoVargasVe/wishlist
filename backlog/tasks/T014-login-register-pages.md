---
id: T014
title: /login and /register pages
epic: E2-auth
status: done
depends_on: [T011, T012, T050]
size: M
---

## Context

The only two auth endpoints (`POST /api/auth/login`, `POST /api/auth/register`) exist but have no
UI. This wires them up: two forms, sharing the app shell from T050.

`src/lib/schemas/auth.ts` (`registerSchema`, `loginSchema`) already exists specifically to be
shared between the API route and this task's forms — see its own header comment. Read
[design-system.md](../../docs/frontend/design-system.md) § *Forms* before starting: the same Zod
schema drives both `zodResolver` client-side and the route's `.parse()`, so client and server can
never disagree about what's valid.

Read [api-contract.md](../../docs/context/api-contract.md) § *Auth* for the exact request/response
shapes and error codes, and [frontend/CLAUDE.md](../../docs/frontend/CLAUDE.md) for the i18n rule.

## Acceptance criteria

- [ ] `/login` — email + password, submits to `POST /api/auth/login`, redirects to `/` on success
- [ ] `/register` — displayName + email + password + inviteCode, submits to
      `POST /api/auth/register`, redirects to `/` on success
- [ ] Both forms use `react-hook-form` + `zodResolver(loginSchema | registerSchema)` — the same
      schemas the routes already `.parse()` against
- [ ] `src/lib/schemas/auth.ts`'s Zod messages are **Spanish**. They render directly in the form
      via `zodResolver`, and the app is Spanish-first — English validation text leaking into a
      family member's browser is a bug, not a detail.
- [ ] The server's `DomainError.message` is **never shown to the user** — those strings are
      English/dev-oriented (see `src/server/errors.ts`). Instead the form maps known error codes
      to their own Spanish copy: `INVALID_CREDENTIALS`, `EMAIL_TAKEN`, `INVITE_ALREADY_USED`, the
      invite-code `VALIDATION_FAILED` case (`details.field === "inviteCode"`), `RATE_LIMITED`
      (interpolating `details.retryAfterSeconds`), and a generic fallback for anything else
- [ ] `INVALID_CREDENTIALS` renders as a form-level message, never attached to the email or
      password field specifically — attaching it to one would leak which field was wrong,
      defeating the point of the generic 401 (see T012)
- [ ] A link between the two pages (`/login` → register, `/register` → login)
- [ ] Submit button disables and shows a pending label while the request is in flight
- [ ] Every primitive comes from `src/app/_ui/` (`Field`, `Input`, `Button`); every string routes
      through `t()`
- [ ] Tests (RTL, network mocked — never a live server per
      [testing.md](../../docs/context/testing.md)): a client-side validation error renders without
      any network call; a mapped error code (e.g. `EMAIL_TAKEN`) renders its Spanish message on
      the right field; success calls `router.push("/")`

## Out of scope

`/` redirecting logged-in users to their default list — that destination (`/w/[slug]`) doesn't
exist until T051, so both forms redirect to the current placeholder `/` for now. Revisit the
redirect target when T051 lands. Session-aware header/nav (still T051/T052). Password reset
(deferred per [product.md](../../docs/context/product.md)).

## Files likely touched

```
src/lib/schemas/auth.ts
src/lib/i18n/es.ts
src/app/(auth)/layout.tsx
src/app/(auth)/login/page.tsx
src/app/(auth)/login/login-form.tsx
src/app/(auth)/login/login-form.test.tsx
src/app/(auth)/register/page.tsx
src/app/(auth)/register/register-form.tsx
src/app/(auth)/register/register-form.test.tsx
```

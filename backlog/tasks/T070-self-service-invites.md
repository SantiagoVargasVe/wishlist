---
id: T070
title: Self-service invite minting
epic: E8-invites
status: todo
depends_on: [T010, T012]
size: M
---

## Context

[ADR-0002](../../docs/adr/0002-invite-only-registration.md) anticipated this exact gap: "Needs a
way to mint codes. `npm run seed:invite` for bootstrap; an owner-facing UI is a later
nice-to-have." Today that's the *only* way to mint one, and it requires direct database access —
which doesn't work against the deployed instance at all: the host only ever pulls a prebuilt
image (no source, no `npm`, per [ADR-0007](../../docs/adr/0007-deploy-via-ghcr-and-pull-timer.md)),
and Postgres isn't reachable outside the app's own Docker network
(`infra/docker-compose.prod.yml` publishes no port for it). Right now, inviting a real family
member to the deployed site means `docker compose exec db psql` and a hand-typed `INSERT`.

This task lets any logged-in user mint their own invite code from within the app. Read
[api-contract.md](../../docs/context/api-contract.md) for the existing error envelope and rate
limit table conventions before adding the new route.

## Design decisions (no prior spec existed)

**Self-minted codes expire in 7 days; the bootstrap script's codes still never expire.**
`invite_codes.expires_at` is already nullable and already validated on consumption
(`registerUser` in `auth.ts` already throws `InviteErrors.expired()` for a stale code — see the
`expiresAt <= now()` check and the `isNull(expiresAt) OR expiresAt > now()` query filter, both
already shipped, both untouched by this task). Minting was previously gated to a trusted operator
running a CLI script by hand; opening it to every account means a forgotten or accidentally-shared
code should die on its own rather than stay valid forever. Only the *minting* path changes —
nothing about consumption does.

**Rate limited per user**, a new `invites` policy in `src/server/rate-limit/policies.ts` alongside
`login`/`register`/`preview`/`claim`. Suggested starting point: 5 per day — minting is a
deliberate, low-frequency action (inviting a handful of relatives), not something a legitimate
user ever needs to do in bulk.

**Lives in `AppShell`, not a specific wishlist page.** Inviting someone isn't scoped to any one
list — it's an account-level action, same category as a (currently nonexistent) logout button.
This is the first thing that makes `AppShell` session-aware; today it's a plain Server Component
with no auth check at all. It becomes `async`, calls `currentUserId()` once, and renders the
invite entry point only when a session exists — a visitor or logged-out user sees nothing new.

**Mint-and-display, not a history or management page.** The dialog mints a code and shows it once
with a copy-to-clipboard affordance (plain copy, not `ShareButton`'s native-share pattern — a
10-character code typed or pasted into a chat isn't a URL, so there's nothing for
`navigator.share` to attach to meaningfully). Listing every code a user has minted, or revoking an
unused one, is real additional scope — out of scope here, worth its own task if it turns out to
matter.

## Acceptance criteria

- [ ] `POST /api/invites` — authenticated (`requireUserId`), no request body → `201 { code,
      expiresAt }`. Rate limited via the new `policies.invites`, keyed per user.
- [ ] The created row carries `createdBy` (the minting user's id) and `expiresAt` = now + 7 days
- [ ] `AppShell` shows an "Invitar" entry point only when a session exists
- [ ] Opening it mints a code (either immediately on open, or behind an explicit confirm — pick
      one and note why) and displays the code plus a human-readable expiry, with a working
      copy-to-clipboard button
- [ ] A rate-limited attempt shows a friendly error, mirroring how `login`/`register` already
      surface `RATE_LIMITED` (`error.details.retryAfterSeconds`) rather than a raw failure
- [ ] Tests: the service function stores the right `createdBy`/`expiresAt`; the route enforces
      auth and the rate limit; the `AppShell` entry point is present/absent based on session;
      the mint + copy flow and the rate-limit error path

## Out of scope

Any listing or history of codes a user has minted. Revoking a code before it's used or expired.
Anything about how a code is *consumed* at registration — that logic already exists, is already
tested, and needs no changes here. Changing the bootstrap script's own never-expiring codes.

## Files likely touched

```
src/server/services/auth.ts
src/server/services/auth.test.ts
src/app/api/invites/route.ts
src/server/rate-limit/policies.ts
src/app/_shell/app-shell.tsx
src/app/_shell/invite-button.tsx
src/lib/i18n/es.ts
```

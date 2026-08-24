---
id: T011
title: Registration endpoint with transactional invite consumption
epic: E2-auth
status: done
depends_on: [T010]
size: M
---

## Context

`POST /api/auth/register`. Consumes a single-use invite code and creates a user, both or neither.

**The default wishlist is not here.** The backlog index pairs it with this task, but `wishlists`
doesn't exist until T020, so T021 extends this transaction to include it. Registration is the
right place for it eventually — a user with no list is a broken state — but it can't be written yet.

This task also establishes two things every later endpoint depends on: **typed domain errors**
and the **error envelope mapper** described in
[api-contract.md](../../docs/context/api-contract.md).

Read [api-contract.md](../../docs/context/api-contract.md),
[security.md](../../docs/context/security.md) § *Authentication*, and
[ADR-0002](../../docs/adr/0002-invite-only-registration.md).

## Acceptance criteria

- [ ] `POST /api/auth/register` taking `{ email, password, displayName, inviteCode }`
- [ ] **Argon2id** for hashing, never bcrypt or SHA-anything
- [ ] Password has a **maximum** length as well as a minimum. Hashing is deliberately expensive,
      so an unbounded password is a cheap denial-of-service.
- [ ] Invite consumption is a **conditional UPDATE** (`WHERE code = ? AND used_at IS NULL`), not
      a read-then-write. Two people racing the same code must produce exactly one account.
- [ ] User creation and code consumption share **one transaction**. A failure must not burn the
      code — otherwise a typo'd email costs someone their invite.
- [ ] Expired codes rejected; `expires_at IS NULL` means no expiry
- [ ] Duplicate email returns a clean `409`, not a raw constraint error
- [ ] Zod schema lives in `src/lib/schemas/` and is imported by the route. Shared with the form
      in T014, so client and server cannot disagree about what's valid.
- [ ] Invite codes are **normalised before lookup** — uppercased, separators stripped. They're
      transcribed by hand, so `k7mq-2xpt9r` should work.
- [ ] Typed domain errors in `src/server/errors.ts`, mapped once to the
      `{ error: { code, message } }` envelope. No response building inside services.
- [ ] The response **never includes the password hash**
- [ ] Tests: happy path; code consumed exactly once under concurrency; failed registration leaves
      the code unused; duplicate email; expired code; already-used code; oversized password
- [ ] `npm run lint`, `typecheck`, `test`, `build` all pass, and the Docker image still builds —
      Argon2 is a native module and the runtime image is musl-based

## Out of scope

Login and JWT issuing (T012). Session helpers (T013). Any UI (T014). The default wishlist (T021).

## Files likely touched

```
src/lib/schemas/auth.ts
src/server/errors.ts
src/server/auth/password.ts
src/server/services/auth.ts
src/app/api/_lib/respond.ts
src/app/api/auth/register/route.ts
```

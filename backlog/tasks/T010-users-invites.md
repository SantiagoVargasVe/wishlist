---
id: T010
title: users and invite_codes schema, plus an invite seeding script
epic: E2-auth
status: done
depends_on: [T003]
size: M
---

## Context

The first domain tables. Registration is invite-gated ([ADR-0002](../../docs/adr/0002-invite-only-registration.md))
because the site sits on a public URL and the users are family — so `invite_codes` has to exist
before registration can (T011).

No password hashing here. This task is schema plus the ability to mint a code; consuming a code
and creating a user is T011.

Read [data-model.md](../../docs/context/data-model.md) § *users*, *invite_codes*.

## Acceptance criteria

- [ ] `users`: `id` uuid pk, `email` **citext** unique, `password_hash`, `display_name`,
      timestamps
- [ ] Email is `citext`, not `text`. Drizzle has no built-in citext, so define a `customType`.
      With plain text, `Santiago@x.com` and `santiago@x.com` are two accounts and a UNIQUE
      constraint won't stop it — the extension enabled in T003 exists for this.
- [ ] `invite_codes`: `code` pk, `created_by` → users (nullable, for bootstrap), `used_by` →
      users (nullable), `used_at`, `expires_at` (nullable), `created_at`
- [ ] Codes are **single-use**, enforced by `used_by`/`used_at`. Consumption logic is T011; this
      task only has to make the invalid states unrepresentable.
- [ ] `npm run seed:invite` mints a code and prints it. Runs outside Next, so it must not import
      anything marked `server-only` — it builds its own connection, like `drizzle.config.ts`.
- [ ] Codes use a **human-transcribable alphabet** — no `0/O/1/I/l`. These get read aloud or
      typed from a phone screen.
- [ ] Reusable test harness for real-Postgres tests, since T020/T040 need the same thing
- [ ] Tests: citext rejects a case-variant duplicate; a valid email round-trips; invite FKs hold;
      an unused code is distinguishable from a used one
- [ ] `npm run lint`, `typecheck`, `test`, `build` all pass

## Out of scope

Password hashing and registration (T011). Login and JWTs (T012). Any UI (T014). The default
wishlist created on registration (T021).

## Files likely touched

```
src/server/db/schema.ts
src/server/db/migrations/
src/server/db/test-support.ts
src/server/db/schema.test.ts
scripts/seed-invite.ts
package.json
```

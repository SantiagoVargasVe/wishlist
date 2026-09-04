---
id: T107
title: Schema — users.email_verified_at + token purpose column
epic: E12-account-recovery
status: done
depends_on: [T100]
size: S
---

## Context

The storage half of [ADR-0013](../../docs/adr/0013-email-verification-gates-recovery.md).
Verification tokens reuse T100's `password_reset_tokens` table via a discriminator rather than
getting a near-identical table of their own — the ADR's "Why one token table" explains the
trade, including when to split it later.

Read [ADR-0013](../../docs/adr/0013-email-verification-gates-recovery.md) and
[data-model.md](../../docs/context/data-model.md). Schema only.

## Acceptance criteria

- [ ] `users.email_verified_at` timestamptz, **nullable**. Null means unverified; there is no
      boolean — the timestamp answers "when", which the audit trail wants and a boolean can't
- [ ] `password_reset_tokens.purpose` text not null, constrained to `password_reset` |
      `email_verify`, enforced by a CHECK constraint rather than convention
- [ ] Existing token rows default to `password_reset` in the migration — there are no
      verification tokens yet, and an ambiguous default here would be a security bug rather than
      a cosmetic one
- [ ] **No backfill of `email_verified_at`.** Every existing row stays null. ADR-0013 § "Existing
      accounts are not backfilled" is the reasoning — a blanket backfill blesses exactly the
      mistyped addresses this closes. If a reviewer asks for one, point them there
- [ ] The `user_id` index from T100 stays useful for both purposes; add `purpose` to it if the
      query plan wants it, otherwise leave it alone
- [ ] Migration applies cleanly on a fresh volume and on top of the current production schema
- [ ] Schema test: the CHECK rejects an unknown purpose; cascade delete still removes both kinds

## Out of scope

Minting, sending, the verify endpoint, the resend path, and the `/forgot-password` gate
(T108, T103). Any change to login.

## Files likely touched

```
src/server/db/schema.ts
src/server/db/migrations/00NN_email_verification.sql
src/server/db/core-schema.test.ts
docs/context/data-model.md
```

---
id: T107
title: Verify email addresses at registration
epic: E12-account-recovery
status: todo
depends_on: [T100, T101]
size: M
---

## Context

Registration collects an email address and has never checked that the person registering controls
it. That was harmless while the address did nothing. Password reset makes it load-bearing:
[ADR-0012](../../docs/adr/0012-password-reset-via-single-use-token.md) § "The unverified-email
problem" spells out the failure — a mistyped address means the reset link goes to whoever owns
the typo, and since `/forgot-password` is public, they can request one whenever they like. That
is account takeover, not a lockout.

ADR-0012 accepts the gap for now on the basis that registration is invite-gated to a handful of
people whose addresses the operator can read directly out of the `users` table. **That
justification expires the moment the user list stops fitting on one screen.** This task is what
removes the dependency on it.

Read ADR-0012 and [ADR-0002](../../docs/adr/0002-invite-only-registration.md) — verification must
not turn into a second gate that makes invite codes redundant.

## Acceptance criteria

- [ ] `users.email_verified_at` timestamptz nullable; null means unverified
- [ ] Verification tokens reuse the T100 table via a `purpose` column
      (`password_reset` | `email_verify`) rather than a second near-identical table — if the
      shapes turn out to genuinely diverge, say so in the PR instead of forcing it
- [ ] Registration sends a verification email and creates the account as normal. Verification must
      **not** block login — an unverified user with a working password is not the problem this
      solves, and blocking would lock out every existing account on deploy
- [ ] `/forgot-password` refuses to send to an unverified address, returning the same 202 as
      always. This is the criterion that actually closes the takeover path; everything else here
      is scaffolding for it
- [ ] A resend path, rate limited, for users whose first email didn't arrive
- [ ] Existing rows: decide and document explicitly. Default recommendation is to backfill
      `email_verified_at = now()` for the current known-good accounts and record in the PR that
      it was an operator assertion, not a proof — a silent backfill that later reads as
      "verified" is worse than an honest note
- [ ] Unverified state is visible to the user somewhere in the UI, with a resend action. A gap the
      user can't see is a gap they can't fix
- [ ] Tests: unverified address gets no reset mail but still 202; verification consumes the token
      once; resend is rate limited

## Out of scope

Blocking login or any other feature on verification. Changing the invite flow. Email-change
flows for existing accounts — that is a separate task with its own confirm-both-addresses
problem.

## Files likely touched

```
src/server/db/schema.ts
src/server/db/migrations/00NN_email_verification.sql
src/server/services/auth.ts
src/server/services/email-verification.ts
src/app/api/auth/register/route.ts
src/app/api/auth/verify-email/route.ts
src/lib/i18n/*
```

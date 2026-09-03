---
id: T108
title: Verification service, registration send, and verify endpoint
epic: E12-account-recovery
status: done
depends_on: [T101, T107]
size: M
---

## Context

The working half of [ADR-0013](../../docs/adr/0013-email-verification-gates-recovery.md):
registration sends a verification mail, and a token exchange marks the address verified.

The rule that shapes this task and is easy to get wrong under review pressure: **verification
gates nothing but recovery.** Not login, not any endpoint, not the app shell. The ADR argues why
at length — blocking login would lock out every existing account on deploy and would make
outbound mail a hard dependency, contradicting
[ADR-0011](../../docs/adr/0011-outbound-email-via-smtp.md). If this task starts adding checks to
other routes, it has gone wrong.

Reuse T102's token machinery. If verification needs its own mint/consume implementation, either
T102 was scoped too narrowly or T107's shared-table decision was wrong — say which in the PR
rather than quietly writing a second one.

## Acceptance criteria

- [ ] `mintVerificationToken(userId)` / `consumeVerificationToken(token)` built on T102's
      primitives, with `purpose = 'email_verify'`. The atomic single-statement consume is not
      reimplemented
- [ ] Registration sends a verification email **after** the account transaction commits — a mail
      failure must never roll back a successful registration
- [ ] Registration succeeds normally when mail is unconfigured or the send fails. The user is
      registered, logged in, and unverified; the failure is logged, not surfaced as a
      registration error
- [ ] `POST /api/auth/verify-email` — Zod-validated `{ token }`, sets `email_verified_at = now()`,
      returns `204`. Invalid, expired, already-used and wrong-purpose tokens all return the same
      generic `400`
- [ ] A `password_reset` token presented to the verify endpoint is rejected, and a `email_verify`
      token presented to `/api/auth/reset-password` is rejected. **Add a test for each
      direction** — this is the failure mode the shared table introduces, and the only one that
      makes ADR-0013's table decision wrong if unhandled
- [ ] `POST /api/auth/resend-verification` — authenticated, rate limited, mints a fresh token and
      invalidates the user's outstanding verification tokens
- [ ] New rate-limit policies in `policies.ts` for verify and resend, commented with *why* in the
      existing style
- [ ] Verification expiry is longer than reset's 30 minutes (24h is reasonable) and defined as its
      own named constant — a verification mail sat in an inbox overnight is normal, a reset link
      sat overnight is not
- [ ] Email body Spanish-first via i18n keys, plain-text and HTML, no third-party links
- [ ] Integration tests against real Postgres: happy path; second use fails; expired fails;
      cross-purpose rejected both ways; resend invalidates the previous token

## Out of scope

The `/forgot-password` gate (T103 owns it — that's what makes reset unshippable without this).
All UI (T109). Blocking login or anything else on verification.

## Files likely touched

```
src/server/services/email-verification.ts
src/server/services/email-verification.test.ts
src/server/services/auth.ts
src/server/mail/templates/verify-email.ts
src/app/api/auth/verify-email/route.ts
src/app/api/auth/resend-verification/route.ts
src/server/rate-limit/policies.ts
src/lib/i18n/*
docs/context/api-contract.md
```

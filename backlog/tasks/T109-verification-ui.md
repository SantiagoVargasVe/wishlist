---
id: T109
title: Verification UI — prompt, resend, /verify-email/[token]
epic: E12-account-recovery
status: todo
depends_on: [T108]
size: M
---

## Context

Makes verification visible and actionable. Per
[ADR-0013](../../docs/adr/0013-email-verification-gates-recovery.md) an unverified user keeps
full use of the app — the only thing they lose is self-service password reset. So this UI is a
prompt, never a wall, and the copy has to explain what verifying actually buys without implying
the account is broken.

The prompt matters more than it looks: unverified state that a user can't see is a gap they can't
close, and the whole epic's safety story depends on people actually verifying.

**Mandatory:** [design-system.md](../../docs/frontend/design-system.md) before writing any
component, and mind the ≤100-line rule.

## Acceptance criteria

- [ ] `/verify-email/[token]` page: consumes the token on load, shows success or a clear failure
      with a resend action. Never a dead end
- [ ] A dismissible prompt for logged-in unverified users, with a resend button and inline
      success/error feedback. Dismissal persists for the session, not forever — it should come
      back
- [ ] The prompt does **not** block, overlay, or gate any part of the app. If it can't be
      dismissed and worked around, it's wrong
- [ ] Copy states the actual consequence — that password recovery needs a verified address —
      rather than a generic "please verify your email". The user should be able to make an
      informed decision to ignore it
- [ ] Resend is disabled while in flight and after success, so it can't be double-fired
- [ ] `/forgot-password` (T105) gains a line noting that recovery requires a verified address,
      since that page is where an unverified user hits the wall
- [ ] All copy via i18n keys, Spanish-first
- [ ] Component tests following the existing form-test pattern: success, expired token, resend
      success, resend failure, dismissal

## Out of scope

The endpoints (T108). Any change to login or registration flows beyond the prompt. An
admin/operator view of who is verified.

## Files likely touched

```
src/app/(auth)/verify-email/[token]/page.tsx
src/app/_shell/verify-email-prompt.tsx
src/app/_shell/verify-email-prompt.test.tsx
src/app/(auth)/forgot-password/forgot-password-form.tsx
src/lib/i18n/*
```

---
id: T105
title: /forgot-password and /reset-password/[token] pages
epic: E12-account-recovery
status: done
depends_on: [T103]
size: M
---

## Context

The user-facing half of recovery. Two pages in the existing `(auth)` route group, matching
`login` and `register` — same layout, same form patterns, same Base UI primitives.

The copy carries real weight here. Because the API can't confirm whether an address is
registered, the success message has to be honest about that without sounding broken to a
relative who is already locked out.

**Mandatory:** [design-system.md](../../docs/frontend/design-system.md) before writing any
component, and note the ≤100-line rule — these are two forms plus states, so plan on composition.

## Acceptance criteria

- [ ] `/forgot-password` — email field, submit, and a success state reading as "si esa dirección
      está registrada, te enviamos un enlace", never "revisa tu correo"
- [ ] `/reset-password/[token]` — new password + confirmation, validated client-side with the
      same Zod schema the API uses
- [ ] Invalid or expired token renders a clear recovery path (a link back to `/forgot-password`),
      not a dead end or a raw error
- [ ] On success, redirect to `/login` with a confirmation message — the user is not logged in
      automatically (T103)
- [ ] A "¿Olvidaste tu contraseña?" link on `/login`. Without it the flow is unreachable, which is
      the most likely way this whole epic ships and goes unused
- [ ] The reset page makes **no third-party requests** — no fonts, no analytics, no external
      images. The URL contains a live credential and must not reach a `Referer` header
- [ ] All copy via i18n keys, Spanish-first. No hardcoded user-facing strings
- [ ] Submit is disabled while in flight and after success, so a double-submit can't burn the token
- [ ] Component tests following the `login-form.test.tsx` pattern: validation errors, success
      state, expired-token state, in-flight disabling

## Out of scope

Endpoints (T103). Password-strength meters. "Remember me". Any change to the login or register
forms beyond adding the one link.

## Files likely touched

```
src/app/(auth)/forgot-password/page.tsx
src/app/(auth)/forgot-password/forgot-password-form.tsx
src/app/(auth)/reset-password/[token]/page.tsx
src/app/(auth)/reset-password/[token]/reset-password-form.tsx
src/app/(auth)/login/login-form.tsx
src/lib/i18n/*
```

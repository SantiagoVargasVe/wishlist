---
id: T103
title: POST /api/auth/forgot-password and /api/auth/reset-password
epic: E12-account-recovery
status: todo
depends_on: [T101, T102]
size: M
---

## Context

The HTTP surface of [ADR-0012](../../docs/adr/0012-password-reset-via-single-use-token.md), and
the reset email itself. T102 already owns the domain logic — this task is the route boundary,
the enumeration-safe response, and the message body.

The one rule that shapes everything: **`/forgot-password` returns the same 202 no matter what.**
Registered address, unknown address, mail send failure — identical status, identical body. Any
branch a client can observe is an account-enumeration oracle. Read the ADR's "Enumeration, and
where it actually leaks" for what this does and does not buy.

Read [api-contract.md](../../docs/context/api-contract.md) and
[security.md](../../docs/context/security.md) § Authentication.

## Acceptance criteria

- [ ] `POST /api/auth/forgot-password` — Zod-validated `{ email }`, always `202` with an identical
      body. Unknown address: no token minted, no mail, same response
- [ ] Mail send failure is caught, logged at error level, and **still returns 202** — a provider
      outage must not become an enumeration oracle. This is the one place where swallowing an
      error is correct, so say so in a comment
- [ ] When mail is unconfigured (`isMailConfigured()` false) the endpoint still returns 202 and
      logs that the token was minted but not delivered — naming `scripts/reset-link.ts` in the log
      line, since that is the supported path in that configuration
- [ ] `POST /api/auth/reset-password` — Zod-validated `{ token, password }`, password held to the
      same rules as registration (reuse the schema in `src/lib/schemas/auth.ts`, do not restate
      them), `204` on success
- [ ] Invalid/expired/used tokens all return the same `400` with one generic code
- [ ] Both endpoints are rate limited using T102's policies. `/forgot-password` consumes **two**
      buckets — per IP and per submitted email — and is refused if either is exhausted
- [ ] The reset link is built from `config.APP_URL` and points at `/reset-password/[token]`
- [ ] Email body is Spanish-first via the existing i18n keys, plain-text **and** HTML, and states
      the 30-minute expiry and that the link is single-use. It must not contain the user's
      password, any other account detail, or a third-party link
- [ ] Successful reset does **not** log the user in — it redirects to `/login`. A reset link
      arriving in a mailbox is not proof of session intent, and the user has just proven they can
      type the new password
- [ ] Route tests: 202 for known and unknown addresses are byte-identical; mail failure still
      202; rate limit returns 429; reset with a used token is 400; happy path sets the new hash

## Out of scope

The two pages (T105). The CLI script (T106). Enforcing `sessions_valid_from` on subsequent
requests (T104) — this task writes it via T102 and does not read it.

## Files likely touched

```
src/app/api/auth/forgot-password/route.ts
src/app/api/auth/reset-password/route.ts
src/app/api/auth/*/route.test.ts
src/server/mail/templates/password-reset.ts
src/lib/schemas/auth.ts
src/lib/i18n/*
docs/context/api-contract.md
```

---
id: T110
title: Wire MAIL_* into the production compose file, and treat an empty value as absent
epic: E12-account-recovery
status: done
depends_on: [T101]
size: S
---

## Context

[T101](T101-mail-transport.md) added five `MAIL_*` settings and
[ADR-0011](../../docs/adr/0011-outbound-email-via-smtp.md) says an operator picks their provider
with a `.env` edit. On the deployed stack that is **not currently true**:
`infra/docker-compose.prod.yml` enumerates the container's environment explicitly, so a variable
in the host's `.env` that isn't named there never reaches the app. Configure Resend today and
`/api/auth/forgot-password` still logs "outbound mail is not configured".

Wiring them in is one edit, and it has a trap in it that has to be handled at the same time.

**Compose's `${VAR:-}` sets the variable to an empty string, it does not omit it.** Measured, not
assumed — `docker compose run` with an unset variable puts `VAR=` in the container's environment.
Every optional key in `config.schema.ts` is `z.string().min(1).optional()`, and `""` is a string,
so it fails `min(1)` rather than reading as absent:

```
MELI unset (absent) ............................ OK
MELI empty (what compose actually sends) ....... THROW  MELI_CLIENT_ID: Too small
```

So this is already a latent boot failure for `MELI_CLIENT_ID` / `MELI_CLIENT_SECRET` (T036) — the
app only starts today because those happen to be set. Adding `MAIL_*` the same way would make
"no mail provider" a crash at startup, which is the exact opposite of what ADR-0011 promises, and
would take the whole app down rather than just disabling a feature.

Read [ADR-0011](../../docs/adr/0011-outbound-email-via-smtp.md) and the compose notes at the top
of `infra/docker-compose.prod.yml` (the service-key rule from T065 still applies — don't rename
anything).

## Acceptance criteria

- [ ] An `optionalEnv()` helper in `config.schema.ts` that maps `""` to `undefined` before the
      inner schema runs, applied to every optional key: the five `MAIL_*` and both `MELI_*`.
      Fixing MELI here is deliberate — it is the same defect, one character apart, and leaving it
      would mean shipping the helper next to the two fields that most obviously need it
- [ ] A genuinely absent key and an empty one behave identically, and a *whitespace-only* value
      does too — `MAIL_SMTP_PASS=" "` is a typo, not a password
- [ ] `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASS` and `MAIL_FROM` added
      to the `wishlist-app` service's `environment:` block, following the `${VAR:-}` shape the
      MELI keys already use, with a comment saying why the empty-vs-absent distinction matters
- [ ] T101's all-or-nothing refinement still fires on a partial mailer *after* the empty-string
      normalisation — five empty strings must read as "no mail", while four values and one empty
      must still fail at boot naming the missing key
- [ ] `MAIL_SMTP_PORT` is `z.coerce.number()`, which turns `""` into `0`; confirm the
      normalisation runs first, or a blank port becomes a positive-int failure rather than absent
- [ ] Config tests cover: all five empty → boots with mail disabled; four set and one empty →
      throws naming it; MELI empty → boots, matching the previous absent behaviour
- [ ] No change to any service key or container name (T065)

## Out of scope

Anything about *which* provider is used — that stays a `.env` edit. Adding new config keys.
Changing the dev compose file, which passes no app environment at all. Backfilling the same
treatment onto required keys: an empty `AUTH_SECRET` **should** fail loudly.

## Files likely touched

```
src/server/config.schema.ts
src/server/config.schema.test.ts
infra/docker-compose.prod.yml
```

---
id: T101
title: SMTP mail transport module, optional by config
epic: E12-account-recovery
status: todo
depends_on: []
size: S
---

## Context

Implements [ADR-0011](../../docs/adr/0011-outbound-email-via-smtp.md). One send function over
SMTP, provider selected entirely by env — the app must not know Resend exists.

The critical property is that email is **optional**: unset config means the app boots fine with
email disabled. Anything built on top has to degrade rather than break, because an operator
running this without a mail vendor is a supported configuration, not a broken one.

Read the ADR and the dependency policy in
[architecture.md](../../docs/context/architecture.md). Nothing in `src/app/` may import this.

## Acceptance criteria

- [ ] `nodemailer` added as a dependency, justified by ADR-0011 per the dependency policy
- [ ] `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, `MAIL_FROM` added
      to `config.schema.ts`, **all optional**, with `MAIL_FROM` validated as an email address and
      `MAIL_SMTP_PORT` coerced to a positive int
- [ ] Config is all-or-nothing: a partially-configured mailer (host but no password) fails at
      **boot** with a message naming what's missing, rather than at 3am on the one send that
      matters
- [ ] `src/server/mail/index.ts` exports `sendMail({ to, subject, text, html })` and
      `isMailConfigured(): boolean`
- [ ] `sendMail` throws a typed error when unconfigured — callers decide how to degrade; it must
      never resolve successfully having sent nothing
- [ ] The SMTP connection has an explicit timeout (~10s) so a hanging provider can't pin a request
- [ ] Send failures log at error level with the recipient **domain** but never the full address,
      the subject, or any token — per the logging rule in
      [security.md](../../docs/context/security.md)
- [ ] `.env.example` gains all five keys with dummy values and a comment naming Resend's SMTP
      host as the reference, without implying it is required
- [ ] Unit tests with the transport mocked: configured send calls through; unconfigured throws;
      partial config fails validation. No test may open a network connection

## Out of scope

Templates, HTML layout, i18n of message bodies (T103 owns the reset email's content), retries,
queueing, bounce handling. Do not add a second transport (API/HTTP) — the point of ADR-0011 is
that there is one.

## Files likely touched

```
src/server/mail/index.ts
src/server/mail/index.test.ts
src/server/config.schema.ts
.env.example
package.json
docs/context/architecture.md
```

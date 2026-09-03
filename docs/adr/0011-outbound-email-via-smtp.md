# ADR-0011 — Outbound email over SMTP, provider chosen by config

**Status:** Accepted · 2026-09-02

## Context

The app has never sent an email. [ADR-0012](0012-password-reset-via-single-use-token.md) needs a
way to deliver a reset link to someone who by definition cannot log in, and the same channel is
what email verification and any future notification would use. So the question isn't "how do we
mail a reset link" but "what does this app's outbound mail dependency look like".

Two constraints shape the answer. This is **self-hosted software** — whoever runs it picks their
own infrastructure, and baking in one vendor makes that choice ours instead of theirs. And it is
**family-scale**: a handful of messages a month, with long stretches of zero.

## Decision

One `src/server/mail/` module exposing `sendMail({ to, subject, text, html })`, implemented over
**SMTP** via `nodemailer`. The provider is entirely a matter of configuration:

```
MAIL_SMTP_HOST · MAIL_SMTP_PORT · MAIL_SMTP_USER · MAIL_SMTP_PASS · MAIL_FROM
```

All five are **optional** in `config.schema.ts`. Unset means the app boots normally with email
disabled — it does not fail at startup, and it does not pretend to send.

**Resend is the reference provider** — what the flow is developed and tested against, and what
`.env.example` documents. Nothing in the code knows that.

## Why SMTP rather than a vendor SDK

Every candidate provider speaks SMTP. Resend, Brevo, Mailgun, SES, Postmark, and a plain
company mail server are all reachable with the same five settings, so choosing SMTP makes the
provider a `.env` edit. Reaching for `@resend/node` instead would turn a config change into a
code change, a new dependency, and a rewrite of the send path — for an API surface we use exactly
one call of.

The vendor SDKs buy things at scale that don't apply here: batch sending, webhook helpers,
templating, typed event payloads. At a few messages a month, none of that is worth a lock-in.

## Why not self-host a mail server

Considered and rejected. Deliverability for a self-hosted MTA is a reputation problem, not a
configuration one: consumer ISP ranges are widely blocklisted, many block outbound port 25
entirely, and mail without established SPF/DKIM/DMARC history lands in spam. A password reset
that silently goes to spam is worse than no reset flow at all, because the user has no signal
that anything went wrong. Delivery is exactly the part worth outsourcing.

## Why Resend as the reference

Its free tier is roughly 3,000 messages a month, and — the part that matters — **SMTP relay is
included on it**, not gated behind a paid plan the way some competitors do it. It supports
DKIM/SPF/DMARC on a custom domain, so mail is properly authenticated rather than sent from a
personal mailbox. At this app's volume the free tier is over-provisioned by about two orders of
magnitude.

Its one sharp edge: the free tier enforces a hard **100 messages/day** cap that fails sends
rather than billing for overage. Irrelevant for password resets. It would matter for a one-shot
verification sweep of an existing user base, which should be trickled rather than blasted.

Brevo (300/day) was the main alternative and is a fine substitute — higher daily ceiling, heavier
product. Since the choice is one env var, this is not a decision worth agonizing over.

## Dependency

`nodemailer` joins the intended set in [architecture.md](../context/architecture.md)'s dependency
policy. It is the de-facto standard SMTP client for Node, has no native build step (unlike an
MTA binding), and is used only in `src/server/mail/`.

## Consequences

- **Email is optional, everywhere.** Any feature built on it must degrade rather than break when
  the config is absent. For password reset that means the operator script
  (`scripts/reset-link.ts`, T106) stays a first-class path, not a fallback for emergencies —
  an operator who wants no third-party mail vendor is a supported configuration.
- **Send failures are invisible to the caller by design.** `/api/auth/forgot-password` returns the
  same response whether or not mail went out, because telling them apart tells an attacker
  whether an address is registered. That makes server-side logging of send failures the *only*
  signal that a broken API key has silently disabled recovery. Log them loudly.
- **Mail is sent inside the request.** At this volume a queue would be ceremony. The send is
  awaited with a short timeout so a hanging SMTP connection can't pin the request; if outbound
  mail ever becomes high-volume or user-visible-latency-sensitive, that's the thing to revisit.
- `.env.example` gains the five keys with dummy values, per the secrets rule in
  [security.md](../context/security.md).
- Nothing in `src/app/` imports the mail module. It is a server-side concern behind a service,
  like the DB.

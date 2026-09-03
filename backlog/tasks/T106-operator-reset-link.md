---
id: T106
title: scripts/reset-link.ts — mint a reset link without email
epic: E12-account-recovery
status: done
depends_on: [T102]
size: S
---

## Context

What keeps [ADR-0011](../../docs/adr/0011-outbound-email-via-smtp.md)'s "email is optional" true
for the one feature that would otherwise force a mail vendor. The operator runs it, gets a URL,
and delivers it however they like.

Two audiences: an operator who deliberately runs no SMTP provider, and any operator whose provider
is failing at the moment someone needs to get in. Today the alternative is hand-editing a hash
into Postgres, which is worse in every respect.

Follow the shape of the existing `scripts/seed-invite.ts` — same argument handling, same output
style, same `npm run` wiring.

## Acceptance criteria

- [ ] `npm run reset-link -- <email>` prints a ready-to-use absolute URL built from
      `config.APP_URL`
- [ ] Uses T102's `mintResetToken` unchanged — same expiry, same single-use, same table. If this
      script needs its own token path, T102 was scoped wrong
- [ ] Unknown email exits non-zero with a clear message. This is an operator tool, not a public
      endpoint, so here it **should** say the address isn't registered
- [ ] Prints the expiry time explicitly, so an operator pasting it into a chat knows what they're
      promising
- [ ] Warns in its output that the link is a credential and single-use
- [ ] Does not require `MAIL_*` config to be set, and does not send anything
- [ ] Documented in README.md next to the invite-seeding script, framed as the supported
      no-email recovery path rather than an emergency hack

## Out of scope

Sending email (T103). Listing or revoking outstanding tokens. Any interactive prompt — it must
stay usable over a non-interactive SSH command.

## Files likely touched

```
scripts/reset-link.ts
package.json
README.md
```

# ADR-0012 — Password reset via single-use tokens, and revocable sessions

**Status:** Accepted · 2026-09-02 · reverses the deferral in
[product.md](../context/product.md) · supersedes [ADR-0003](0003-jwt-in-httponly-cookie.md)'s
"tokens aren't revocable server-side"

## Context

Password reset was deferred through v1 on the grounds that it needed SMTP the repo didn't own.
Recovery has therefore been an operator action — editing a hash into the database by hand.
[ADR-0011](0011-outbound-email-via-smtp.md) removes the transport objection, and the manual
procedure is both error-prone and something only the operator can perform.

## Decision

A `password_reset_tokens` table, and two endpoints:

```
POST /api/auth/forgot-password  { email }             → 202, always
POST /api/auth/reset-password   { token, password }   → 204
```

**Token.** 32 bytes from `crypto.randomBytes`, base64url-encoded, handed to the user in the link.
Only its **SHA-256** is stored, and lookup is by that hash. 30-minute expiry, single use.

```
password_reset_tokens(
  token_hash  text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
)
```

**Consumption is one statement** — `UPDATE ... WHERE used_at IS NULL AND expires_at > now()
RETURNING user_id` — for the same reason the rate limiter and the invite consumption are single
statements. A read-then-write lets two concurrent requests both observe an unused token.

**On success:** rehash the password with Argon2id, mark the token used, delete the user's other
outstanding tokens, and bump `users.sessions_valid_from` to now.

## Why SHA-256 for the token, when passwords get Argon2id

These look like the same problem and are not. Argon2id exists to make *low-entropy* secrets
expensive to guess — a human-chosen password has maybe 30 bits, so the defence has to be the cost
per attempt. A reset token has 256 bits from a CSPRNG. It is not guessable at any cost per
attempt, and a memory-hard hash would add ~100 ms and 19 MB to every lookup buying nothing.

Storing the hash rather than the token still matters: it means a leaked database backup, or an
accidental `SELECT *` in a log, doesn't hand over live reset links.

## Why not a JWT

Tempting, since `jose` is already a dependency and a signed token with an `exp` needs no table.
Rejected because a JWT cannot be **single-use**. Statelessness is the whole point of a JWT and
exactly the wrong property here: a reset link that stays valid for its full window after being
used is a link sitting in an inbox — or a mail provider's logs, or a forwarded message — that
still opens the account. One-shot requires server-side state, so the table isn't overhead we
avoided cleverly, it's the requirement.

## Why sessions must become revocable

[ADR-0003](0003-jwt-in-httponly-cookie.md) accepted that "tokens aren't revocable server-side
before expiry — add a session table if that ever matters." It now matters, and this is that
moment.

A meaningful share of password resets are someone reacting to a suspicion that another person has
their password. If the reset leaves that person's 30-day cookie working, the flow has done
nothing about the actual problem while strongly implying it has. That is worse than a missing
feature.

Rather than a session table, `users.sessions_valid_from timestamptz` is compared against the
JWT's `iat` in `currentUserId()`. Tokens minted before the reset stop verifying. This is the
smaller change — no session lifecycle, no cleanup job, one column — and it generalises to any
future "log out everywhere".

**The cost is real and stated plainly:** session resolution stops being pure crypto and becomes a
DB read on every authenticated request. Accepted because the alternative designs are worse
(a session table is the same read plus more machinery), because the value is already in Postgres
next to everything else the request needs, and because it is the same trade the app already makes
everywhere else — nothing is cached in a claim, precisely so changes take effect immediately.

## Enumeration, and where it actually leaks

`/api/auth/forgot-password` returns an identical 202 for a registered address and an unknown one,
and does the work — including the Argon2-free path — in a way that doesn't leak timing.

Worth being honest that this is not airtight: `POST /api/auth/register` returns
`EMAIL_ALREADY_REGISTERED` on a unique violation, which discloses the same fact. That path is
invite-gated, so probing it costs an unused invite code, and closing the reset endpoint's leak is
still worth doing rather than matching the weakest existing behaviour.

## The unverified-email problem

**Registration collects an email address and has never verified it.** That is a pre-existing gap
that this ADR makes consequential, so it is recorded here rather than left implicit.

If an address was mistyped at registration, the reset link goes to whoever actually owns the
typo'd address. Because the endpoint is public, that person doesn't have to wait for an accident
— once they know the account exists they can request a reset at will. The failure mode is
account takeover, not merely a locked-out user.

**This was initially accepted** on three grounds — registration is invite-gated to a known
handful of people, their addresses can be checked directly against the `users` table by the
operator, and verification was planned as a follow-up. That has since been reconsidered and
rejected: the grounds describe why the gap is *small*, not why it is *safe*, and shipping
recovery on top of unverified addresses builds the takeover path rather than inheriting it.

[ADR-0013](0013-email-verification-gates-recovery.md) closes it. Verification is a prerequisite
of self-service reset, not a follow-up to it — `/forgot-password` sends nothing to an unverified
address. Verification deliberately gates **only** recovery, never login, so no existing account
is locked out and outbound mail stays optional per
[ADR-0011](0011-outbound-email-via-smtp.md).

## Consequences

- Two rate-limit policies, not one. `passwordResetRequest` is keyed **per IP and per email
  address** — the IP bucket stops a spray across many accounts, the email bucket stops mailbombing
  one person, and neither substitutes for the other. `passwordResetConsume` is per IP; with a
  256-bit token it isn't stopping a guess, it's stopping CPU burn.
- The reset link contains a credential, so it goes in the path (`/reset-password/[token]`), which
  [security.md](../context/security.md) already flags for `claim_token`: it lands in logs and
  `Referer` headers. Accepted here because the alternative — a form the user pastes into — is
  materially worse UX for the least technical users, and the token is single-use and 30-minute.
  The reset page must not link out to third parties.
- Reset does not confirm to the user that the email exists, so the UI copy has to say "if that
  address is registered, we've sent a link" rather than "check your email". Spanish-first, keyed.
- Old tokens accumulate. A row per request, never cleaned. At this scale that is a rounding error;
  delete on consume plus the `ON DELETE CASCADE` covers the shape of it, and a sweep can join
  T034's weekly job if it ever matters.
- `scripts/reset-link.ts` (T106) mints the same token from the CLI without sending mail. This is
  what keeps [ADR-0011](0011-outbound-email-via-smtp.md)'s "email is optional" true for the one
  feature that would otherwise require it.

# ADR-0013 — Email verification gates recovery, not login

**Status:** Accepted · 2026-09-02 · closes the accepted risk in
[ADR-0012](0012-password-reset-via-single-use-token.md) § "The unverified-email problem"

## Context

[ADR-0012](0012-password-reset-via-single-use-token.md) recorded that registration has never
verified email addresses, and accepted the gap on the grounds that registration is invite-gated
to a handful of people whose addresses the operator can read straight out of `users`.

That was a defensible reading of a small user base and a bad reading of the feature. Password
reset turns an unverified address into a credential: a mistyped address means the reset link
goes to whoever owns the typo, and because `/forgot-password` is public they can request one
whenever they like. Shipping recovery on top of unverified addresses doesn't inherit a
pre-existing gap — it builds a takeover path and calls it a feature.

## Decision

`users.email_verified_at`, nullable. Registration sends a verification email and the account is
created and **immediately usable**. Verification gates exactly one thing:

**`/api/auth/forgot-password` sends nothing to an unverified address** — same 202, no token
minted, no mail.

It gates nothing else. Not login, not any endpoint, not any UI beyond a dismissible prompt to
verify. Verification tokens reuse `password_reset_tokens` via a `purpose` column
(`password_reset` | `email_verify`).

## Why verification does not block login

Blocking login is the reflex, and it is wrong here three times over.

**It would lock out every existing account on deploy.** Every current row is unverified by
definition. A gate on login turns a security improvement into an outage for exactly the people it
is meant to protect.

**It would make email a hard dependency of the application.**
[ADR-0011](0011-outbound-email-via-smtp.md) makes outbound mail optional on purpose — an operator
running this with no SMTP provider is a supported configuration. If login needs a verification
mail, that configuration stops booting a usable app, and ADR-0011 becomes a fiction.

**It doesn't match the threat.** An unverified user who knows their own password is not a
problem; they demonstrably are who they say they are, by the ordinary means. The dangerous object
is a *reset link* sent to a mailbox the account holder may not control. Gate that, and nothing
else. A control that blocks a safe action to prevent an unrelated dangerous one is just friction
with a security-sounding name.

[ADR-0002](0002-invite-only-registration.md) already answers "is this person allowed in" —
verification answers a different question, "does this person control this mailbox", and only
recovery depends on the answer.

## Why one token table with a `purpose` column

Both tokens are the same object: a high-entropy secret, stored hashed, bound to a user, expiring,
single-use. They share the atomic-consume statement that is the most security-sensitive and most
easily-got-wrong part of ADR-0012, and writing it twice means maintaining two chances to get it
wrong.

The honest counter-argument is that a `purpose` column is a discriminator on a table that might
later want different columns per purpose — a longer expiry for verification, say, or multi-use
semantics. If that day comes, split the table then. Splitting a two-purpose table later is a
mechanical migration; reconciling two subtly different consume implementations is not.

## Existing accounts are not backfilled

The tempting move is `UPDATE users SET email_verified_at = now()` and a note in the PR. Rejected:
a blanket backfill marks a possibly-mistyped address as verified, which is precisely the state
this ADR exists to prevent. It would close the hole in new accounts and cement it in old ones.

Existing rows stay null. **Nobody is locked out**, because verification doesn't gate login — the
only thing an unverified user cannot do is self-serve a password reset, and
`scripts/reset-link.ts` covers them until they verify. The operator may assert individual rows
where they have confirmed an address out of band; that is a per-row judgement with a name
attached to it, not a blanket claim.

## Consequences

- **Self-service recovery has a prerequisite for existing users**: verify first, once. Accepted —
  the alternative is a recovery flow that is quietly unsafe for exactly the accounts that predate
  it.
- **`scripts/reset-link.ts` deliberately ignores verification.** An operator minting a link has
  established identity out of band, which is a stronger signal than an email round-trip, and it
  is the escape hatch that keeps an unverified user recoverable.
- **`/forgot-password` now has two distinct silent no-send cases** — unknown address and
  unverified address — on top of send failure. All three return the same 202, so server-side
  logging is the *only* way to tell them apart. ADR-0011 already says to log send failures
  loudly; this widens that from a nicety to the sole diagnostic for the whole flow.
- Full self-service recovery now requires configured mail, where ADR-0012 alone did not. The app
  still runs, and is still recoverable, without it.
- The verify-email endpoint is unauthenticated and consumes a token, so it needs its own rate
  limit alongside the reset policies.

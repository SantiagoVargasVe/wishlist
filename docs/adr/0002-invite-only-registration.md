# ADR-0002 — Invite-only registration

**Status:** Accepted · 2026-08-23

## Context

The site sits on a publicly reachable URL. Open registration forms on public URLs
attract bot signups, which means email verification, captcha, and cleanup work — none of which
serves a tool whose users are family members.

## Decision

Registration requires a single-use invite code. Codes live in `invite_codes`, are consumed in the
same transaction that creates the user, and can carry an optional `expires_at`.

## Why not the alternatives

- **Open registration** — needs email verification plus aggressive rate limiting to stay clean.
  Real work for a benefit nobody asked for.
- **Manual account creation via CLI** — safest, but makes Santiago a bottleneck every time a
  relative joins, and there's no self-service path.

Invite codes keep a real signup page while making the abuse surface roughly zero.

## Consequences

- Needs a way to mint codes. `npm run seed:invite` for bootstrap; an owner-facing UI is a
  later nice-to-have.
- The first account is bootstrapped by a seed script.
- If the app ever opens up, dropping the gate is a one-line change plus adding verification.

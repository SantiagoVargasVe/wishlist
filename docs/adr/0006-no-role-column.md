# ADR-0006 — No role column

**Status:** Accepted · 2026-08-23

## Context

The original requirement said users "will be admin role by default so they can create the
wishlist."

## Decision

No `role` column. Authorization is ownership: you can modify a wishlist or item if `owner_id`
matches your user id.

## Why

If every user is an admin, the role carries no information — checking it would always pass. What
the requirement actually describes is "any authenticated user can create their own lists," which
is ownership, not a privilege tier.

A role column that's always the same value is worse than none: it looks like a real access
control, so future code writes checks against it that don't check anything.

## Consequences

- Three states, all derivable without a role: **owner** (session user owns the list),
  **authenticated visitor**, **anonymous visitor**. The last two get identical capabilities.
- Ownership is checked **inside services**, not in route handlers, so it can't be bypassed by a
  new caller.
- If a real superuser is ever needed — support tooling, moderation — add it then, as a genuine
  privilege tier with genuine checks. Adding a column later is easy; removing a fake access
  control that code depends on is not.

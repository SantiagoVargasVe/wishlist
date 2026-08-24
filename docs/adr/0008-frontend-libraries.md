# ADR-0008 — Base UI, react-hook-form, TanStack Query

**Status:** Accepted · 2026-08-23

## Context

The frontend needs accessible primitives, form handling, and server-state management. The design
tokens were generated with a shadcn theme tool, which invites the assumption that shadcn
components come with them.

## Decision

- **Base UI** (`@base-ui-components/react`) for component primitives — unstyled, we style with
  Tailwind using the tokens in `src/app/globals.css`.
- **react-hook-form** + `@hookform/resolvers/zod` for forms.
- **TanStack Query** for server state, over a single `apiFetch` base client.
- **Explicitly not shadcn/ui**, despite the theme's origin.

## Why

**Base UI over shadcn.** shadcn copies pre-built components into your repo on top of Radix. That's
a fine model, but it hands you files you didn't write and must now maintain, and it fights the
100-line component limit — shadcn components arrive at whatever size they arrive at. Base UI gives
primitives and nothing else, so every component in `src/app/` is one we wrote and one we can hold
to the rules.

The tokens transfer regardless. They're plain CSS custom properties with no dependency on Radix or
on shadcn's component conventions.

**A single `apiFetch` under TanStack Query.** Query and mutation hooks all build on one fetcher
that owns JSON parsing, error mapping to the `{ error: { code, message } }` envelope, and auth
failure handling. Without that choke point, error handling gets reimplemented per hook and drifts.

**Zod schemas shared between form and route.** The backend already validates at every route
boundary with Zod ([api-contract.md](../context/api-contract.md)). Putting those schemas in
`src/lib/schemas/` and importing them into `zodResolver` on the client means client and server
cannot disagree about what's valid. This is the main reason for choosing RHF's resolver approach
over a bespoke validation layer.

## Consequences

- **Never run `npx shadcn add`.** It installs Radix and duplicates primitives, leaving two
  component systems with different composition models in one codebase.
- Base UI is recent and its API still moves. Check current docs rather than writing components
  from memory, and pin the version.
- Sharing Zod schemas couples `src/lib/schemas/` to both sides. That's intentional, but it means
  those files are a boundary: keep them free of React and of anything server-only.
- Server-side validation remains mandatory. A shared schema is a convenience, not a trust
  boundary — the client can always be bypassed.

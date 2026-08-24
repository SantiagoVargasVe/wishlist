# Wishlist — Agent Context

Self-hosted wishlist app. Users save products by pasting a link; Open Graph metadata is
scraped server-side to build a card. Lists are shared via an unguessable slug, and anyone
holding that link — logged in or not — can mark an item as bought.

Runs on Santiago's home server (Debian 13, Docker) behind the existing Cloudflare Tunnel.

## Read before you start

Load the docs relevant to your task. Do **not** read all of them by default.

| Doc | Read it when |
|---|---|
| [docs/context/product.md](docs/context/product.md) | You need to know what a feature is *for* |
| [docs/context/architecture.md](docs/context/architecture.md) | Touching deployment, boundaries, or adding a dependency |
| [docs/context/data-model.md](docs/context/data-model.md) | Any DB or entity work |
| [docs/context/api-contract.md](docs/context/api-contract.md) | Adding or changing an endpoint |
| [docs/context/security.md](docs/context/security.md) | **Mandatory** for anything that fetches a URL, handles auth, or accepts anonymous writes |
| [docs/context/testing.md](docs/context/testing.md) | Writing tests, or wondering what needs them |
| [docs/frontend/design-system.md](docs/frontend/design-system.md) | **Mandatory** before writing any component |
| [docs/adr/](docs/adr/) | You're about to contradict a past decision |

`docs/frontend/CLAUDE.md` and `docs/backend/CLAUDE.md` load automatically when you work in
those areas. Don't read the other side's conventions unless you're crossing the boundary.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Base UI · TanStack Query ·
react-hook-form + Zod · Drizzle ORM · PostgreSQL 17 · Vitest · Docker

One container serves both the UI and the API. The internal boundary is enforced by directory,
not by network:

```
src/app/          routes + UI      → docs/frontend/
src/server/       domain + data    → docs/backend/
```

**`src/app/` must never import from `drizzle` or talk to the DB directly.** It calls into
`src/server/` services. This is the boundary that keeps FE and BE context separable.

## Non-negotiables

These come from decisions already made. Changing one means writing an ADR first.

1. **Never fetch a user-supplied URL without the SSRF guard** in `src/server/net/safe-fetch.ts`.
   This is self-hosted software sharing a LAN with private admin interfaces.
   See [docs/context/security.md](docs/context/security.md).
2. **The OG scrape may never block a save.** Title/image/price are prefill suggestions. Every
   field stays editable and the item saves with or without them.
3. **Claim state is hidden from the list owner by default** (`wishlists.hide_claims_from_owner`).
   Filtering happens server-side — never send claim data to the owner and hide it in the UI.
4. **Items soft-delete** (`deleted_at`). Claims must survive an accidental delete.
   Removing an item from a list is a different action from deleting it.
5. **No secrets in the repo.** `.env.example` is committed; `.env` is not.
6. **Components are ≤ 100 lines**, one per file, enforced by ESLint `max-lines`. The limit is a
   forcing function for composition — see [design-system.md](docs/frontend/design-system.md).
7. **Tests ship in the same commit as the code.** A task is done when CI is green, not when it
   works locally. See [testing.md](docs/context/testing.md).
8. **This repo is public.** No host-specific details — no private IPs, service inventories,
   domains, or server paths. It's generic self-hosted software; deployment specifics live in the
   operator's own notes.

## Commands

```bash
npm run dev          # Next dev server on :3000
npm run lint
npm run typecheck
npm test
npm run build
npm run test:ci      # all four exactly as CI runs them, coverage included

npm run db:up        # start Postgres (waits for healthy) · db:down · db:logs
npm run db:reset     # destroy the volume and re-run initdb
npm run db:generate  # generate a migration from schema changes
npm run db:migrate   # apply migrations
npm run db:studio    # Drizzle Studio
```

Use the `db:*` scripts, not raw `docker compose`. They pass `--project-directory .` so `.env`
resolves from the repo root — without it compose silently reads `infra/.env`.

**Never read `process.env` directly.** Import `config` from `src/server/config.ts`, which
validates everything once at boot and fails with a message naming what's wrong. Tooling that runs
outside Next (`drizzle.config.ts`) imports `config.schema.ts` instead, to avoid the `server-only`
guard.

**Integration tests need a database.** They run against `wishlist_test`, created by
`infra/postgres-init/` on a fresh volume, and are addressed by `DATABASE_URL_TEST`. They skip
locally when it's unset so unit tests still run without Docker — but fail in CI if it's missing,
because a silent skip there is indistinguishable from a pass.

## Working from the backlog

Tasks live in [backlog/tasks/](backlog/tasks/) as self-contained markdown files — each has
enough context to be picked up cold. See [backlog/README.md](backlog/README.md) for the
lifecycle and the task format.

**Never commit to `main`.** Branch as `<type>/<task-id>-<slug>`, open a PR, and let Santiago
review and merge. One task per branch.

When you finish a task, update its `status` frontmatter in the same commit as the code.

## Conventions

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`). Reference the task id: `feat(items): add soft delete [T023]`
- Zod validates every API input at the route boundary, before it reaches a service.
- Money is `numeric(14,2)` + an explicit ISO currency code. Never a float, never a bare number.
- UI copy is Spanish-first via i18n keys. Never hardcode user-facing strings — family members
  are the primary users.

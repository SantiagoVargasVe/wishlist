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
| [docs/adr/](docs/adr/) | You're about to contradict a past decision |

`docs/frontend/CLAUDE.md` and `docs/backend/CLAUDE.md` load automatically when you work in
those areas. Don't read the other side's conventions unless you're crossing the boundary.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Drizzle ORM · PostgreSQL 17 · Docker

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
   This box shares a LAN with the router admin UI, Nextcloud, Immich, and Minecraft RCON.
   See [docs/context/security.md](docs/context/security.md).
2. **The OG scrape may never block a save.** Title/image/price are prefill suggestions. Every
   field stays editable and the item saves with or without them.
3. **Claim state is hidden from the list owner by default** (`wishlists.hide_claims_from_owner`).
   Filtering happens server-side — never send claim data to the owner and hide it in the UI.
4. **Items soft-delete** (`deleted_at`). Claims must survive an accidental delete.
   Removing an item from a list is a different action from deleting it.
5. **No secrets in the repo.** `.env.example` is committed; `.env` is not.

## Commands

```bash
npm run dev          # Next dev server on :3000
npm run db:generate  # generate migration from schema changes
npm run db:migrate   # apply migrations
npm run db:studio    # Drizzle Studio
npm run lint
npm run typecheck
npm test
```

Local Postgres:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

## Working from the backlog

Tasks live in [backlog/tasks/](backlog/tasks/) as self-contained markdown files — each has
enough context to be picked up cold. See [backlog/README.md](backlog/README.md) for the
lifecycle and the task format.

When you finish a task, update its `status` frontmatter in the same commit as the code.

## Conventions

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`). Reference the task id: `feat(items): add soft delete [T023]`
- Zod validates every API input at the route boundary, before it reaches a service.
- Money is `numeric(14,2)` + an explicit ISO currency code. Never a float, never a bare number.
- UI copy is Spanish-first via i18n keys. Never hardcode user-facing strings — family members
  are the primary users.

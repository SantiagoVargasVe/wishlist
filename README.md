# Wishlist

Self-hosted wishlist app. Paste a product link, get a card built from its Open Graph tags,
organize items into lists, and share a list so friends and family can quietly mark things
as bought without spoiling the surprise.

Built to be self-hosted with Docker behind a Cloudflare Tunnel — no inbound ports required.

## Why this exists

Sharing a wishlist over WhatsApp usually means a wall of raw links and two people buying the
same thing. This gives you one link that renders properly, and a bought-marker anyone can use
without needing an account.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · [Base UI](https://base-ui.com) ·
TanStack Query · react-hook-form + Zod · Drizzle · PostgreSQL 17 · Vitest · Docker

## Getting started

```bash
cp .env.example .env      # fill in the values — AUTH_SECRET needs 32+ chars
npm install
npm run db:up             # Postgres 17 in Docker
npm run dev
```

Open http://localhost:3000. Registration needs an invite code — seed one with
`npm run seed:invite`.

## Operator scripts

```bash
npm run seed:invite                        # mint a registration code
npm run reset-link -- ana@example.com      # mint a password reset link
```

`reset-link` prints a ready-to-use URL and **sends nothing**. It is the supported way to recover
an account without a mail provider, not an emergency hack: outbound email is optional by design
([ADR-0011](docs/adr/0011-outbound-email-via-smtp.md)), so an operator who runs no SMTP provider
recovers accounts this way and everything else about the flow is identical — same 30-minute
expiry, same single-use token, same table as the self-service endpoint.

It is also the path that stays open when a mail provider is failing, and the one that works for
an account whose address isn't verified ([ADR-0013](docs/adr/0013-email-verification-gates-recovery.md)):
an operator minting a link has established identity out of band, which is a stronger signal than
an email round-trip.

The printed URL is a credential — single use, 30 minutes, and whoever holds it can take the
account. Deliver it over something you trust.

## Documentation

This repo is built to be worked on with AI agents, so the context is the primary artifact.

- **[CLAUDE.md](CLAUDE.md)** — start here. Guardrails and where to find everything.
- **[docs/context/](docs/context/)** — product, architecture, data model, API contract, security, testing
- **[docs/frontend/design-system.md](docs/frontend/design-system.md)** — Base UI, tokens, composition rules
- **[docs/adr/](docs/adr/)** — why things are the way they are
- **[backlog/](backlog/)** — the work, one file per task

## Status

Scaffold. No application code yet — see [backlog/README.md](backlog/README.md) for what's next.

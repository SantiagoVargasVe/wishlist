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

Next.js 15 (App Router) · TypeScript · Tailwind · Drizzle · PostgreSQL 17 · Docker

## Getting started

```bash
cp .env.example .env      # fill in the values
docker compose -f infra/docker-compose.dev.yml up -d
npm install
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Registration needs an invite code — seed one with
`npm run seed:invite`.

## Documentation

This repo is built to be worked on with AI agents, so the context is the primary artifact.

- **[CLAUDE.md](CLAUDE.md)** — start here. Guardrails and where to find everything.
- **[docs/context/](docs/context/)** — product, architecture, data model, API contract, security
- **[docs/adr/](docs/adr/)** — why things are the way they are
- **[backlog/](backlog/)** — the work, one file per task

## Status

Scaffold. No application code yet — see [backlog/README.md](backlog/README.md) for what's next.

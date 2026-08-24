# ADR-0001 — Next.js full-stack over a separate API

**Status:** Accepted · 2026-08-23

## Context

Three shapes were considered: Next.js full-stack, NestJS API + Next frontend, and FastAPI +
React SPA. The app is a solo, AI-assisted build deployed to a home server that already runs four
Docker stacks.

## Decision

Next.js 15 (App Router) serving both UI and API from one container. Postgres 17 via Drizzle.

The FE/BE separation the project wants is enforced by **directory boundary** — `src/app/` never
imports from `src/server/db/` — rather than by a network hop.

## Why

**Shared links must render as cards.** The product is sharing wishlists; a link pasted into
WhatsApp needs server-rendered OG tags on `/w/[slug]`. A client-only SPA can't do that without a
prerender hack, and building an app *about* OG cards that has none would be absurd.

One container is also one deploy, one image, and one set of logs on a self-hosted box that's
already running several other stacks.

## Trade-offs

The boundary is a convention, not a wall — a careless import can cross it. Mitigated by the rule
in `CLAUDE.md` and the scoped context docs; an ESLint `no-restricted-imports` rule can enforce it
if it slips.

If a mobile app or third-party API consumer ever appears, `src/server/services/` is already
framework-agnostic and can be lifted into a standalone API without a rewrite.

## Rejected

- **NestJS + Next** — real separation, but two containers and substantial boilerplate for a
  solo project with no second consumer.
- **FastAPI + React SPA** — viable if the backend were Python-first, but loses SSR OG cards,
  which is the one thing the product can't do without.

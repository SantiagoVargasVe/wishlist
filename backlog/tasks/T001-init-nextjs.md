---
id: T001
title: Initialize Next.js 15 app with TypeScript and Tailwind
epic: E1-foundation
status: todo
depends_on: []
size: S
---

## Context

First task. Creates the application skeleton the rest of the backlog builds on. The directory
layout matters more than the defaults — the `src/app` ↔ `src/server` split is what keeps the
frontend and backend contexts separable, so it gets set up correctly from commit one.

Read [architecture.md](../../docs/context/architecture.md) § *Internal boundary*.

## Acceptance criteria

- [ ] Next.js 15 App Router, TypeScript strict mode, Tailwind, ESLint
- [ ] Scaffolded **into the existing repo root** — don't create a nested project directory, and
      don't clobber `CLAUDE.md`, `README.md`, `.gitignore`, `docs/`, `backlog/`, or `infra/`
- [ ] Directory skeleton created with `.gitkeep` where empty:
      ```
      src/app/  src/server/{db,services,og,net,auth}/  src/lib/
      ```
- [ ] ESLint `no-restricted-imports` rule: nothing under `src/app/` may import from
      `src/server/db/` or `drizzle-orm`. This makes the boundary enforced rather than aspirational.
- [ ] Scripts wired: `dev`, `build`, `lint`, `typecheck`, `test` (Vitest)
- [ ] `npm run typecheck` and `npm run lint` both pass clean
- [ ] `.env.example` committed with names and dummy values; real `.env` stays gitignored

## Out of scope

Drizzle and database wiring (T002, T003). Any UI beyond the default page. Auth.

## Files likely touched

```
package.json
tsconfig.json
next.config.ts
eslint.config.mjs
tailwind.config.ts
src/app/layout.tsx
src/app/page.tsx
```

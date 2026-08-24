---
id: T001
title: Initialize Next.js 15 app with TypeScript and Tailwind
epic: E1-foundation
status: done
depends_on: []
size: S
---

## Context

First task. Creates the application skeleton the rest of the backlog builds on. The directory
layout matters more than the defaults — the `src/app` ↔ `src/server` split is what keeps the
frontend and backend contexts separable, so it gets set up correctly from commit one.

Read [architecture.md](../../docs/context/architecture.md) § *Internal boundary*.

## Acceptance criteria

- [ ] Next.js 15 App Router, TypeScript strict mode, Tailwind v4, ESLint
- [ ] Scaffolded **into the existing repo root** — don't create a nested project directory, and
      don't clobber `CLAUDE.md`, `README.md`, `.gitignore`, `docs/`, `backlog/`, `infra/`, or
      `.github/`
- [ ] **`src/app/globals.css` already exists and holds the design tokens — do not overwrite it.**
      `create-next-app` will try. Preserve it exactly; it is the source of truth for the theme.
- [ ] Directory skeleton created with `.gitkeep` where empty:
      ```
      src/app/  src/server/{db,services,og,net,auth}/  src/lib/{api,hooks,schemas}/
      ```
- [ ] ESLint `no-restricted-imports`: nothing under `src/app/` may import from `src/server/db/`
      or `drizzle-orm`. Makes the boundary enforced rather than aspirational.
- [ ] ESLint `max-lines`: 100 for `src/app/**/*.tsx`, excluding test files. See
      [design-system.md](../../docs/frontend/design-system.md).
- [ ] Vitest configured for both environments — `node` for `src/server/**`, `jsdom` +
      React Testing Library for `src/app/**` and `src/lib/**`
- [ ] Coverage thresholds in `vitest.config.ts`: `src/server/net/**` 90%,
      `src/server/services/**` 80%. No global gate.
- [ ] `src/lib/cn.ts` with `clsx` + `tailwind-merge`
- [ ] Geist loaded via `next/font`. **Do not load Lora or Fira Code** — nothing uses them, and
      each family is a round trip before text paints on mobile.
- [ ] Scripts wired: `dev`, `build`, `lint`, `typecheck`, `test`
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass clean
- [ ] **CI goes green.** `.github/workflows/ci.yml` skips itself until `package.json` exists;
      after this task it must actually run and pass.

## Out of scope

Drizzle and database wiring (T002, T003). Base UI components (T004). Any real UI. Auth.

## Files likely touched

```
package.json
tsconfig.json
next.config.ts
eslint.config.mjs
vitest.config.ts
src/lib/cn.ts
src/app/layout.tsx
src/app/page.tsx
```

Note: Tailwind v4 is configured in CSS (`@theme inline` in `globals.css`), so there's no
`tailwind.config.ts` to create.

---
id: T002
title: Local Postgres and validated environment config
epic: E1-foundation
status: done
depends_on: [T001]
size: S
---

## Context

Gets a database running locally and gives the app a single, validated view of its environment.

The config half matters more than it looks. Every module that reads `process.env` directly is a
place where a missing variable becomes `undefined` and surfaces three layers deeper as a
confusing runtime error. One validated module means the app refuses to boot with a message
naming exactly what's wrong.

Read [architecture.md](../../docs/context/architecture.md) § *Deployment* and the `.env.example`
at the repo root.

## Acceptance criteria

- [ ] `infra/docker-compose.dev.yml` starts Postgres 17 and passes its healthcheck
- [ ] npm scripts wrap the compose invocation — `db:up`, `db:down`, `db:logs` — so nobody has to
      remember flags
- [ ] **Compose resolves `.env` and volume paths from the repo root**, not from `infra/`.
      Compose defaults its project directory to the compose file's own directory, so
      `-f infra/...` alone silently reads `infra/.env` and writes `infra/data/`. Pin it.
- [ ] `src/server/config.schema.ts` — Zod schema plus a pure `parseConfig(env)`, no side effects,
      importable from tests
- [ ] `src/server/config.ts` — `import "server-only"`, parses `process.env` once at import
- [ ] Validation failure throws listing **every** missing or invalid variable at once, not just
      the first
- [ ] `AUTH_SECRET` is rejected below 32 characters — a short signing secret is worse than an
      absent one, because it looks configured
- [ ] Config is never importable from client code. `server-only` makes that a build error rather
      than a silent secret leak into the bundle.
- [ ] Tests: valid env parses; missing required var fails and names it; short `AUTH_SECRET`
      fails; defaults apply when optional vars are absent
- [ ] `.env` stays gitignored; `.env.example` documents every variable the schema requires
- [ ] `npm run lint`, `typecheck`, `test`, `build` all pass

## Out of scope

Drizzle, migrations, and any actual queries (T003). Auth logic (T012) — this task only validates
that `AUTH_SECRET` exists and is long enough, it doesn't use it.

## Files likely touched

```
infra/docker-compose.dev.yml
package.json
src/server/config.ts
src/server/config.schema.ts
src/server/config.schema.test.ts
.env.example
```

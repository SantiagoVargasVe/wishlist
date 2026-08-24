---
id: T003
title: Drizzle wiring, migration pipeline, and a real-Postgres test harness
epic: E1-foundation
status: done
depends_on: [T002]
size: M
---

## Context

Connects the app to Postgres and establishes how migrations are generated and applied. No domain
tables yet — `users` and `invite_codes` are T010, the core entities are T020. This task delivers
the machinery those depend on.

It also sets up **integration testing against a real Postgres**, which
[testing.md](../../docs/context/testing.md) commits to and every later service task needs. The
invariants that matter most in this schema — the partial unique index for one default list per
user, the unique constraint on `item_claims.item_id` — are enforced *by the database*. A mocked
Drizzle would happily let a double claim through, so the harness has to be real.

Read [architecture.md](../../docs/context/architecture.md) § *Internal boundary* and
[data-model.md](../../docs/context/data-model.md).

## Acceptance criteria

- [ ] `drizzle.config.ts` reuses `parseConfig` from `config.schema.ts` — it runs outside Next, so
      it must not pull in the `server-only` guard. This is the payoff of splitting the schema
      from the eager parse in T002.
- [ ] `src/server/db/index.ts` exports `db`, marked `server-only`, with the connection **cached
      across HMR reloads** in development — a fresh pool per reload exhausts Postgres connections
      within minutes of editing
- [ ] `src/server/db/schema.ts` exists and is deliberately empty, with a pointer to T010/T020
- [ ] Scripts: `db:generate`, `db:migrate`, `db:studio`
- [ ] First migration enables the **`citext`** extension — required by `users.email` in T010 so
      casing can never create a duplicate account. Real infrastructure, and it proves the
      generate → apply pipeline works before any table depends on it.
- [ ] A separate **`wishlist_test` database**, created by a Postgres init script so it exists
      from a fresh volume. Tests must never run against the development database.
- [ ] Integration test: migrations apply cleanly to an empty schema, and `citext` is present
      afterwards
- [ ] The integration test **skips** when no test database is configured, so unit tests still run
      without Docker — but **fails loudly in CI** if the variable is missing, so a skip can never
      masquerade as a pass
- [ ] CI gains a Postgres 17 service and runs the integration test against it
- [ ] `npm run lint`, `typecheck`, `test`, `build` all pass

## Out of scope

Any domain table (T010, T020). Query helpers, services, seed data.

## Files likely touched

```
drizzle.config.ts
src/server/db/{index,schema}.ts
src/server/db/migrations/
src/server/db/migrations.test.ts
infra/postgres-init/01-create-test-db.sql
infra/docker-compose.dev.yml
.github/workflows/ci.yml
vitest.config.ts
package.json
.env.example
```

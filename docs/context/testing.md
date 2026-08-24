# Testing

**Vitest everywhere. Unit and integration tests only — no end-to-end suite.**

That's a deliberate scope choice: E2E is the slowest, flakiest tier and needs a running database,
a browser, and seeded fixtures. For a project this size the same confidence comes cheaper from
service-level tests against real domain logic.

## What gets tested

Coverage percentage is a bad target — it rewards testing getters. These modules matter, ranked:

### Backend

| Priority | Module | Why |
|---|---|---|
| 1 | `src/server/net/safe-fetch.ts` | Highest-risk code in the repo. Exhaustive: every denied range, redirect-to-private, DNS rebinding, scheme rejection, oversize, timeout. See [security.md](security.md). |
| 2 | `src/server/services/claims.ts` | Concurrency. Two simultaneous claims → exactly one `201`, one `409`. Preventing a double purchase is why the app exists. |
| 3 | `src/server/services/items.ts` | Deletion semantics: last-list removal soft-deletes, claims survive soft delete, default list can't be deleted. |
| 4 | `src/server/og/parser.ts` | Fixture HTML per precedence path, plus a page with no metadata at all. |
| 5 | Money handling | Currency stays intact through write/read; USD snapshot computed from the configured rate; no float drift. |

### Frontend

| Priority | What | Why |
|---|---|---|
| 1 | Reusable hooks in `src/lib/hooks/` | Reused by definition — a bug multiplies. |
| 2 | Optimistic claim toggle | Rollback on failure is easy to get wrong and invisible when it breaks. |
| 3 | Form schemas | Shared with the backend, so a break is a two-sided break. |
| 4 | Money + date formatting | Locale-dependent, silently wrong, user-visible. COP and USD both. |
| 5 | Owner vs visitor rendering | Owner affordances must not render for a visitor. |

**Don't test Base UI itself.** Whether a dialog traps focus is the library's problem. Test *your*
logic.

## How

**Backend** — services take plain arguments and return plain objects, so they test without booting
Next. Test against a real Postgres (Testcontainers or a scratch database), not a mocked Drizzle:
the invariants that matter most here — the partial unique index, the claim constraint — are
*enforced by the database*, and a mock will happily let a double claim through.

**Frontend** — Vitest + React Testing Library. Query by role and label, not test ids or class
names. Test behavior a user can observe, not internal state.

**Never hit the network in tests.** Fixture the HTML for OG parsing; stub the resolver and socket
layer for `safe-fetch`. A test suite that needs the internet isn't a test suite.

## Thresholds

No global coverage gate. Two targeted ones, enforced in `vitest.config.ts`:

```
src/server/net/**        90%
src/server/services/**   80%
```

Everything else is reported and not gated. The tests listed above are required by their tasks'
acceptance criteria — that's the real gate, and it's more honest than a repo-wide percentage.

## CI

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on every push and pull request:

```
lint  →  typecheck  →  test  →  build
```

All four must pass before merge to `main`. On `main`, a green run is what gates the image build
in [ADR-0007](../adr/0007-deploy-via-ghcr-and-pull-timer.md).

The repo is public, so **the quality job must never need secrets** — that keeps it safe to run on
pull requests from forks. The image build is a separate job, `main`-only, and is the only one
holding a token.

## Writing tests as you go

Every backlog task that touches logic states its tests in the acceptance criteria. Tests land in
the **same commit** as the code, not a follow-up. A task isn't done because it works locally;
it's done when CI is green.

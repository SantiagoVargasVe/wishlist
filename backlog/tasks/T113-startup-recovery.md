---
id: T113
title: Recover automatically when PostgreSQL is delayed after a reboot
epic: E1-foundation
status: done
depends_on: []
size: S
---

## Context

On a host reboot Docker restarts existing containers independently of Compose
dependency ordering. An app can reach its instrumentation hook while PostgreSQL
is still recovering. Next can retain that startup rejection while keeping the
process alive and returning HTTP 500, so a container restart policy never fires.

Read:
- [Architecture](../../docs/context/architecture.md)
- [Testing](../../docs/context/testing.md)
- [Backend conventions](../../docs/backend/CLAUDE.md)
- [Deployment](../../infra/deploy/README.md)

## Acceptance criteria

- [x] Probe PostgreSQL with a bounded authenticated query before production migrations.
- [x] Retry temporary connection/recovery failures with a delay and fresh connections;
      stop after twelve attempts, each bounded to five seconds.
- [x] Fail promptly on permanent database errors; do not retry migration SQL in-process.
- [x] Exit nonzero on initialization failure so Docker can restart a fresh process.
- [x] Log diagnostic codes without connection strings, SQL parameters or credentials.
- [x] Ship an HTTP health check in the image and explain its limits.
- [x] Unit tests cover recovery, exhaustion, hanging probes, permanent failures,
      cleanup, startup ordering and nonzero exit.
- [x] Exercise a built production server with delayed PostgreSQL, including
      recovery after the first process exits, using disposable local data.
- [x] Run lint, typecheck, coverage with real PostgreSQL, build and PR CI.

## Out of scope

Power hardware, host reboot orchestration, production data changes, database repair,
migration/schema edits, ongoing database-outage restart loops and external monitoring.

## Files likely touched

- src/instrumentation.ts
- src/server/startup.ts and tests
- src/server/db/wait-for-database.ts and tests
- infra/Dockerfile
- infra/deploy/README.md

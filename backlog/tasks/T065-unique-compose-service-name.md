---
id: T065
title: Give the prod compose service a globally unique key
epic: E7-deploy
status: done
depends_on: [T063]
size: S
---

## Context

`infra/docker-compose.prod.yml` declared the app as `services: app:`. Compose gives every service
its **service key** as a network alias in addition to `container_name`, and that alias cannot be
suppressed — it is derived from the key.

Where one `cloudflared` container is attached to several stacks' networks at once, Docker's
embedded DNS resolves a name across **all** networks that container is attached to. Several stacks
each declaring `app` meant several containers answering to that one name. On 2026-08-30 an
unrelated service whose tunnel ingress pointed at the bare `app:80` resolved to a different stack's
container listening on 3000, and served a hard 502 until the service keys were renamed.

This repo's own routing was never broken: the tunnel points at `wishlist-app:3000`, the container
name, which is unique. But this file supplied one of the colliding aliases, and re-copying it to the
host reintroduces the fault. See [ADR-0007](../../docs/adr/0007-deploy-via-ghcr-and-pull-timer.md)
for the deploy chain and [architecture.md](../../docs/context/architecture.md) for the tunnel routing.

## Acceptance criteria

- [x] The prod compose service key is `wishlist-app`, matching `container_name`
- [x] A comment in the file states why the key must be globally unique, so the next person editing
      it doesn't reintroduce a generic name
- [x] `docker compose -f infra/docker-compose.prod.yml config` still validates
- [x] No other file in the repo refers to the old `app` service key (deploy units and docs already
      addressed the container by name)
- [x] The deployed copy of the compose file is already renamed, so this change makes the repo match
      the deployment rather than diverging from it

## Out of scope

- **The `db` service key**, which can collide the same way. It is harmless: nothing outside each
  stack's own network ever resolves it, and renaming it would require changing `DATABASE_URL` in the
  same commit for no benefit. If it is ever routed through the tunnel, revisit.
- Any change to the tunnel's ingress rules — those are Cloudflare dashboard state, not repo state.
- The identical fix in any other stack that declared a generic key; each is its own repo's change.

## Files likely touched

```
infra/docker-compose.prod.yml
backlog/tasks/T065-unique-compose-service-name.md
backlog/README.md
```

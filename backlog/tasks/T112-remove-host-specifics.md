---
id: T112
title: Remove host-specific details from the repo
epic: E7-deploy
status: done
depends_on: []
size: S
---

## Context

[CLAUDE.md](../../CLAUDE.md)'s eighth non-negotiable says this repo is public and carries no
host-specific details — no private IPs, service inventories, domains, or server paths — because
it is generic self-hosted software and deployment specifics belong in the operator's own notes.

Several files had drifted from that. The deploy unit carried an absolute home directory and an
account name. The deploy README documented one machine's directory layout as though it were the
layout. And a past incident write-up recorded which other services shared the host and the
hostname of the one that broke, because that was the most vivid way to explain it at the time.

None of it is dangerous on its own. Together it is a description of somebody's machine published
alongside software that has nothing to do with it — and the incident write-up in particular is a
service inventory for one host, which is the specific thing the rule names.

The mechanism in that write-up is worth keeping. Which services it happened to involve is not:
the failure reproduces from the mechanism alone, and the names add nothing a reader can act on.

## Acceptance criteria

- [ ] The deploy unit ships placeholders for the working directory and account, with a comment
      saying why they are placeholders, and the install step in the deploy README says to edit
      them **before** installing — a wrong path here fails immediately, which is the good case,
      but only if the reader was told to look
- [ ] The deploy README describes the layout with the `<deploy-dir>` placeholder already used in
      [architecture.md](../../docs/context/architecture.md), rather than one machine's paths
- [ ] Incident write-ups describe the **mechanism**, not the cast: the failure must still be
      reproducible from the description without naming which services or hostnames were involved
- [ ] No file names another service running alongside this one, or any hostname belonging to a
      deployment
- [ ] `docker compose -f infra/docker-compose.prod.yml config` still validates
- [ ] CLAUDE.md's rule gains the concrete cases that were missed, so the next edit doesn't
      reintroduce them — a rule that only states a principle is one everybody agrees with and
      nobody applies
- [ ] **Recorded plainly: this changes files, not history.** The values remain in the git log,
      and on a public repository a later commit does not retract them. Anyone deciding whether
      that matters should decide it knowingly rather than assume this task handled it

## Out of scope

Rewriting git history — disruptive, and a separate decision with different trade-offs. The
operator's own private notes, wherever those live. The denylisted ranges in
[security.md](../../docs/context/security.md), which are the RFC1918 and friends that the SSRF
guard blocks — documentation of the internet's reserved space, not anybody's network.

## Files likely touched

```
infra/deploy/wishlist-deploy.service
infra/deploy/README.md
infra/docker-compose.prod.yml
backlog/tasks/T065-unique-compose-service-name.md
backlog/README.md
docs/context/architecture.md
CLAUDE.md
```

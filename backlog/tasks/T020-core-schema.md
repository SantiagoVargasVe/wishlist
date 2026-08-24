---
id: T020
title: Schema for wishlists, items, and the join table
epic: E3-core-domain
status: todo
depends_on: [T003, T010]
size: M
---

## Context

The core domain tables. Most other tasks depend on this, so the invariants matter more than the
columns — several are enforced by the database rather than application code, deliberately.

Read [data-model.md](../../docs/context/data-model.md) in full before writing the schema.

## Acceptance criteria

- [ ] `wishlists`: `id`, `owner_id`, `title`, `slug` unique, `is_default`,
      `hide_claims_from_owner` **default true**, timestamps
- [ ] **Partial unique index** on `(owner_id) WHERE is_default` — one default list per user,
      enforced by Postgres, not by application code
- [ ] `slug` is a 10-char nanoid generated at insert. Not the UUID; the primary key stays out
      of URLs.
- [ ] `items`: `id`, `owner_id`, `url`, `title`, `notes`, `image_path`, `source_image_url`,
      `site_name`, `price_amount numeric(14,2)`, `price_currency char(3)`,
      `price_usd_snapshot numeric(14,2)`, `fx_rate_used numeric(14,6)`, `og_status`,
      `og_fetched_at`, `deleted_at`, timestamps
- [ ] `og_status` constrained to `pending | ok | failed | manual`
- [ ] Money columns are `numeric`, never float or int-cents
- [ ] `wishlist_items`: composite pk `(wishlist_id, item_id)`, `position`, `added_at`, both FKs
      `ON DELETE CASCADE`
- [ ] Index on `items(owner_id) WHERE deleted_at IS NULL` — every read filters on this
- [ ] A `liveItems` query helper that applies `deleted_at IS NULL`, so it can't be forgotten
- [ ] Migration generated via `npm run db:generate`, SQL reviewed, committed with the schema

## Out of scope

`item_claims` (T040), CRUD endpoints (T022–T024), the default-list-on-registration hook (T021).
Schema and migration only.

## Files likely touched

```
src/server/db/schema.ts
src/server/db/migrations/
src/server/db/helpers.ts
```

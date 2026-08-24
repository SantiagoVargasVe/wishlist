# ADR-0004 — Store product images instead of hotlinking

**Status:** Accepted · 2026-08-23

## Context

`og:image` gives us a URL on the retailer's CDN. We can keep the string and let browsers load it
directly, or download a copy.

A middle option was seriously considered: hotlink, plus a daily cron that re-scrapes product
pages and refreshes URLs that have gone stale.

## Decision

Download the image once, resize to max 800px webp (~30–60KB) via `sharp`, store at
`data/images/{item_id}.webp`. Keep `source_image_url` in the row so a manual refresh stays trivial.

## Why the cron-refresh alternative was rejected

It only repairs one of three failure modes:

| Failure | Cron fixes it? |
|---|---|
| CDN path rotated, listing still live | Yes |
| Listing delisted / 404 | **No** — nothing left to scrape |
| Retailer blocks hotlinking via `Referer` | **No** — can't even detect it |

The second is the *common* case for a wishlist, where items get bought or discontinued. That's
precisely when you most want the picture to survive.

The third is the subtle one: when a cron fetches the image server-side it doesn't send the site's
`Referer`, so the check passes and the URL looks healthy — while real users see a broken card.
The monitor is structurally blind to the failure it exists to catch.

There's also a cost specific to this deployment. Daily re-scrapes mean unattended outbound
requests to bot-hostile retailers, on a schedule, from a **residential ISP IP** — the same IP the
Minecraft DDNS points at. Getting it rate-limited is a real risk for a partial benefit.

And the complexity runs the wrong way: hotlink + cron + re-scrape + repair is *more* code than
downloading a file once.

## Consequences

- ~40KB per item. A thousand items is ~40MB, negligible against the host's ~210GB.
- `data/images/` is not backed up (see [architecture.md](../context/architecture.md) §
  *Operational notes*). If the volume is lost, images can be re-fetched from
  `source_image_url` for listings that are still live — which is part of why that column
  is kept.
- Orphaned files need a **weekly local sweep** — no outbound requests, not a scraper. This is the
  cron idea redirected to a job it can actually do.
- Stored images can drift out of date if a retailer changes the product photo. Accepted:
  hotlinks go stale by *breaking*, stored images by being *slightly outdated*. For a wishlist,
  outdated beats broken.
- Bonus: visitors' traffic and `Referer` no longer leak to retailers.

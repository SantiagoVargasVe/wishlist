---
id: T057
title: Share CTA
epic: E6-frontend
status: done
depends_on: [T051]
size: S
---

## Context

The one button that makes the product's whole reason for existing usable: getting `{APP_URL}/w/
{slug}` in front of someone else. Read [product.md](../../docs/context/product.md) § *Core flows*
→ *Sharing*. No backend work — the slug is already public (`GET /api/w/:slug`, T040/T052), this is
purely a client-side "get the current URL in front of someone" action.

## Design decisions (no prior spec existed)

**Every list is shareable, not just the default.** product.md's one sentence on this ("Owner hits
the share CTA on their default list") describes the flow using the only list that existed when
that doc was written — its own opening line, "**One link per list**," and T055/T056 (multiple
lists, each with a real slug and a fully working visitor view already) make a default-only
restriction both textually unsupported and structurally arbitrary. The CTA renders on whichever
list the owner is currently viewing and shares *that* list's link.

**Native share sheet first, clipboard as the fallback** — `navigator.share()` when the browser
exposes it (every mobile browser that matters here; most visitors arrive from a phone per
docs/frontend/CLAUDE.md § Responsive), so tapping the button hands off straight into "share to
WhatsApp" rather than "copy, then find WhatsApp, then paste." Desktop browsers without
`navigator.share` fall back to `navigator.clipboard.writeText` plus a confirmation toast.

**A success toast is used here**, breaking from `ClaimButton`'s "error-only, a successful action is
its own feedback via the UI" convention (design-system.md § Data) — deliberately, because copying
to the clipboard has no visible state change of its own to serve as that feedback. Without a toast,
there'd be no way to tell a successful copy from a silently-swallowed failure.

**A cancelled native share sheet (`AbortError`) is not an error.** The user closing the OS share
sheet without picking an app is a normal outcome, not a failure — it's excluded from the
error-toast path specifically, rather than lumped in with a genuine `clipboard.writeText` or
`share()` failure.

## Acceptance criteria

- [x] A "Compartir" action on the owner view shares the *current* list's `{origin}/w/{slug}`
- [x] Where the Web Share API is available, it's used (with the list's title); the URL is never
      mangled or missing a segment
- [x] Where it isn't, the link is copied to the clipboard and a confirmation toast appears
- [x] Cancelling the native share sheet shows no error
- [x] A genuine clipboard or share failure shows an error toast
- [x] Tests: both branches (share-capable vs. clipboard-fallback), the cancelled-share no-op, and
      the failure-toast path for each

## Out of scope

The OG tags that make the shared link render as a rich card in WhatsApp itself (T058) — this task
only gets the link in front of someone; what happens when they open it is the next task.

## Files likely touched

```
src/app/w/[slug]/share-button.tsx
src/app/w/[slug]/owner-view.tsx
src/lib/i18n/es.ts
```

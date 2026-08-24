---
id: T050
title: App shell, layout, i18n scaffolding (Spanish-first)
epic: E6-frontend
status: done
depends_on: [T004]
size: M
---

## Context

Every real page from here on (`/login`, `/register` in T014; `/w/[slug]` in T051/T052) needs a
consistent shell — header, content container, dark-mode toggle already wired in T004 — instead of
each page reinventing it. This task also lays the i18n groundwork: [frontend/CLAUDE.md](../../docs/frontend/CLAUDE.md)
requires every user-facing string go through an i18n key from day one, even with a single locale,
because retrofitting it later is miserable.

Read [design-system.md](../../docs/frontend/design-system.md) (component rules, tokens) and
[frontend/CLAUDE.md](../../docs/frontend/CLAUDE.md) (i18n, responsive, accessibility) before
writing anything.

## Acceptance criteria

- [ ] `src/lib/i18n/es.ts` — the Spanish dictionary, a plain nested `const … as const` object
- [ ] `src/lib/i18n/t.ts` — `t(key, vars?)` resolves a dot-path key (e.g. `"theme.switchToDark"`)
      to a string and interpolates `{name}` placeholders from `vars`
- [ ] Keys are typed: passing a key that doesn't exist in the dictionary is a **TypeScript**
      error, not a runtime surprise. An unresolvable key at runtime throws (defense in depth, not
      the primary safety net)
- [ ] `AppShell` (`src/app/_shell/app-shell.tsx`) renders a persistent header — app name (links
      to `/`) + the existing `ThemeToggle` — and a content area wrapping `children`
- [ ] Root layout (`src/app/layout.tsx`) renders every route through `AppShell`
- [ ] `metadata.title` / `metadata.description` in `layout.tsx` and `ThemeToggle`'s aria-label
      go through `t()` instead of literal strings
- [ ] Header touch target (theme toggle) is ≥44px; layout holds up at 375px, 768px, 1280px
      (mobile-first per [frontend/CLAUDE.md](../../docs/frontend/CLAUDE.md))
- [ ] Tests for `t()`: nested key resolution, `{var}` interpolation (including the same var
      appearing twice), and an unresolvable key throwing
- [ ] `/` (the token/button demo page) still renders correctly nested inside the new shell
- [ ] Favicon (`src/app/icon.svg`) in the `primary`/`primary-foreground` tokens' colors, picked up
      automatically by Next's file-based metadata convention

## Out of scope

Multi-locale switching UI or routing (`next-intl`, `/en/...` paths) — one locale exists, this
only stops future ones from requiring a rewrite. Session-aware nav / logout (no session to read
yet — that lands with the pages in T014, T051, T052). Migrating `page.tsx`'s own placeholder demo
copy to i18n keys — that file is deleted once T014/T051 land, so it's not worth the churn.

## Files likely touched

```
src/lib/i18n/es.ts
src/lib/i18n/t.ts
src/lib/i18n/index.ts
src/lib/i18n/t.test.ts
src/app/_shell/app-shell.tsx
src/app/layout.tsx
src/app/_ui/theme-toggle.tsx
src/app/page.tsx
src/app/icon.svg
```

---
id: T095
title: "Guest view — log in / register entry in the header"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T014, T050]
size: S
---

## Context

Reported from real usage: a logged-out visitor on a shared list has no way to tell the site has
accounts at all. `AppShell` (`src/app/_shell/app-shell.tsx`) shows the `InviteButton` only when
`userId` is set; for an anonymous visitor the header is just the app name and the theme toggle.
`AppShell` already `await`s `currentUserId()`, so the branch point exists.

## Acceptance criteria

- [ ] When there is no session, the header shows an "Iniciar sesión" control — a `<Link href="/login">`
      rendered as a `secondary` `size="sm"` `Button` (matching `InviteButton`'s footprint),
      placed next to the theme toggle
- [ ] When there **is** a session, the header is unchanged — invite button + theme toggle, no
      login link
- [ ] All new copy goes through i18n (`src/lib/i18n/es.ts`) — e.g. a `nav.login` key — no
      hardcoded strings. One "Iniciar sesión" entry is enough; `/login` already links onward to
      `/register`, so a separate register link is optional, not required
- [ ] The control is keyboard-reachable and shows a pointer cursor (an `<a href>` already does;
      this rides on [T093](T093-pointer-cursor-on-buttons.md) for the `Button`-styled case)
- [ ] Test: the login link renders for an anonymous request and does not render for a logged-in
      user. If `AppShell` has no test yet, add a minimal render test

## Out of scope

A full account menu or a logout button for logged-in users. Any change to `/login` or
`/register` themselves. A post-login "return to the list you were viewing" redirect — `/login`
has no `next` param today and adding one is a separate task.

## Files likely touched

```
src/app/_shell/app-shell.tsx
src/app/_shell/login-link.tsx        (only if AppShell would cross the 100-line limit)
src/lib/i18n/es.ts
src/app/_shell/app-shell.test.tsx    (new, if not present)
```

---
id: T004
title: Base UI setup and shared component primitives
epic: E1-foundation
status: done
depends_on: [T001]
size: M
---

## Context

Installs Base UI and builds the small set of wrapped primitives every feature will compose from.
Doing this once, correctly, is what keeps feature components under 100 lines later — they should
be assembling primitives, not restyling raw elements.

**Read [design-system.md](../../docs/frontend/design-system.md) fully before starting**, plus
[ADR-0008](../../docs/adr/0008-frontend-libraries.md) for why Base UI and not shadcn.

## Acceptance criteria

- [ ] `@base-ui-components/react` installed and **pinned** — the API still moves between releases
- [ ] Dark mode wired: `.dark` class on `<html>`, respecting `prefers-color-scheme`, with a
      manual toggle that persists. No flash of wrong theme on load.
- [ ] Wrapped primitives in `src/app/_ui/`, each ≤ 100 lines, each accepting and merging
      `className` via `cn()`:
      - `Button` — variants primary / secondary / ghost / destructive, sizes sm / md
      - `Dialog` — full-screen sheet under 768px, centered dialog above (per the responsive rules)
      - `Field` — label + control + error message, wired for react-hook-form
      - `Input`, `Select`, `Checkbox`
- [ ] Every primitive styles state via Base UI's **data attributes** (`data-[open]:`,
      `data-[disabled]:`), not React state toggling classes
- [ ] **No hardcoded colors, radii, or shadows** — tokens only, so dark mode works for free
- [ ] Both themes verified at 375px and 1280px. Remember shadows barely read on the dark canvas;
      use `card`/`border` contrast for elevation there.
- [ ] TanStack Query wired: `QueryClientProvider`, shared defaults on the client,
      `src/lib/api/client.ts` (`apiFetch`) and `src/lib/api/keys.ts` (key factory) in place
- [ ] `apiFetch` maps non-2xx to typed errors matching the
      `{ error: { code, message } }` envelope in
      [api-contract.md](../../docs/context/api-contract.md)
- [ ] Tests: `Button` renders variants and forwards `className`; `Field` surfaces a validation
      error; `apiFetch` maps an error envelope to the right typed error

## Out of scope

Any feature UI — item cards, modals with real content, the list page. Auth pages (T014). This
task delivers primitives and the data layer's foundation, nothing product-specific.

Don't build primitives nothing needs yet. If no screen uses a `Tooltip`, don't write one.

## Files likely touched

```
src/app/_ui/{button,dialog,field,input,select,checkbox}.tsx
src/app/providers.tsx
src/lib/api/{client,keys}.ts
src/lib/cn.ts
src/app/layout.tsx
```

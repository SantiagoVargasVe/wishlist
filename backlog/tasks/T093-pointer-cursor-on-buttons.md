---
id: T093
title: "Pointer cursor on interactive controls (Tailwind v4 Preflight regression)"
epic: E11-post-deploy-ui-polish
status: done
depends_on: [T004]
size: S
---

## Context

Reported from real usage: the cursor doesn't change to a pointer over buttons — the "Añadir"
button, the modal close "✕", "and more other places". This is a Tailwind v4 change: its Preflight
no longer forces `cursor: pointer` on `<button>`, so native buttons fall back to the browser
default (`cursor: default`). The repo is on `tailwindcss@^4` (`package.json`).

Nothing in the codebase puts the cursor back. `src/app/_ui/button.tsx` sets no cursor; the raw
`<button>`s (`ImageDropZone`, the "Quitar imagen" link in `ItemImagePicker`, Base UI's
`Select.Trigger`, combobox chips, `ThemeToggle`) don't either.

## Approach

Lowest-footprint fix is one base rule in `src/app/globals.css`:

```css
@layer base {
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
}
```

`:not(:disabled)` so a disabled Save doesn't read as clickable. Base UI's `Select.Trigger` /
`Combobox` parts render real `<button>` elements, so the rule reaches them. `<a href>` (the
wishlist filter chips, auth links) already shows a pointer natively — no change needed there,
but confirm while testing.

If a component-level `cursor-pointer` on the `Button` primitive is preferred over a global base
rule, that's an acceptable alternative — but then it must also be added to the handful of raw
`<button>`s listed above. Pick one approach; don't do both.

## Acceptance criteria

- [ ] Hovering any enabled button shows a pointer cursor — spot-check: "Añadir", the dialog "✕"
      close, "Guardar", "Crear", "Compartir", the theme toggle, the visitor claim button, the
      image drop zone, the "Quitar imagen" link
- [ ] A `disabled` button shows the default cursor, not a pointer
- [ ] `cursor-pointer` is not sprinkled onto individual components that the chosen rule already
      covers; it's added only to clickable non-button elements the selector can't reach, if any
- [ ] Nothing regresses visually in light or dark mode (the cursor isn't themed; this is just a
      "did the base layer change break anything else" check)

## Out of scope

Hover/active color states, focus-ring styling, disabled opacity. Touch-target sizing of the
claim button (that's [T096](T096-claim-button-vertical-padding.md)). Any Base UI version bump.

## Files likely touched

```
src/app/globals.css
src/app/_ui/button.tsx        (only if the component-level approach is chosen instead)
```

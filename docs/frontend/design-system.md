# Design System

## Component library: Base UI

[Base UI](https://base-ui.com) (`@base-ui-components/react`) — unstyled, accessible primitives.
We supply all styling with Tailwind.

**The theme tokens came from a shadcn generator, but we do not use shadcn components.** shadcn
ships pre-built components on top of Radix; the tokens are plain CSS custom properties and are
library-agnostic, so they dress Base UI perfectly well. Don't `npx shadcn add` anything — it will
pull in Radix and duplicate primitives we already have.

Base UI composes as **parts**, not monolithic components with prop soup:

```tsx
import { Dialog } from "@base-ui-components/react/dialog";

<Dialog.Root>
  <Dialog.Trigger render={<Button variant="primary">Añadir artículo</Button>} />
  <Dialog.Portal>
    <Dialog.Backdrop className="fixed inset-0 bg-foreground/20" />
    <Dialog.Popup className="rounded-lg bg-popover text-popover-foreground shadow-lg">
      <Dialog.Title />
      <Dialog.Close />
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>
```

Two patterns worth internalizing:

- **`render` prop for polymorphism.** Base UI uses `render` where Radix uses `asChild`. It's how
  you swap the underlying element without wrapping it.
- **State lives in data attributes.** Style with `data-[open]:`, `data-[disabled]:` variants
  rather than tracking state in React just to toggle a class.

Base UI is pre-1.0-recent and its API still moves. Check the current docs for a component's parts
before writing it from memory.

## Tokens

Defined in [src/app/globals.css](../../src/app/globals.css). **Never hardcode a color, radius,
or shadow.** `bg-primary`, `text-muted-foreground`, `rounded-lg`, `shadow-md` — always the token.

A hex value or an arbitrary `bg-[#...]` in a component is a bug: it won't respond to dark mode.

| Token pair | Use for |
|---|---|
| `background` / `foreground` | Page canvas |
| `card` / `card-foreground` | Item cards, raised surfaces |
| `popover` / `popover-foreground` | Dialogs, dropdowns, sheets |
| `primary` / `primary-foreground` | Main CTAs — add item, save, share |
| `secondary` / `secondary-foreground` | Secondary buttons |
| `muted` / `muted-foreground` | Disabled states, timestamps, helper text |
| `accent` / `accent-foreground` | The pink highlight — claimed/reserved state |
| `destructive` / `destructive-foreground` | Delete confirmations only |
| `border` / `input` / `ring` | Borders, field backgrounds, focus rings |

### What I changed from the pasted theme

- **Removed `--chart-1..5` and all `--sidebar-*`.** This app has no charts and no sidebar. Dead
  tokens invite misuse — an agent sees `sidebar-accent` and reaches for it. Regenerate from the
  shadcn theme generator if either ever becomes real.
- **Removed the duplicated fonts, radius, and shadows from `.dark`.** They were byte-identical to
  `:root`, so they inherit. Redeclaring identical values is how the two themes drift apart later.
- **Removed `--spacing` and `--tracking-normal`.** Both matched Tailwind's defaults and neither
  was wired into `@theme inline`, so they had no effect.

Colors are untouched.

### Two things to watch

**Shadows barely read in dark mode.** `--shadow-color` is black in both themes, which is nearly
invisible on a dark canvas. For dark-mode elevation, lean on the `card` vs `background` contrast
and `border` rather than expecting `shadow-md` to do the work.

**Verify contrast before shipping.** Run the palette through a checker — `primary` on
`primary-foreground` and `muted-foreground` on `background` are the pairs most likely to land
marginal for small text.

## Fonts

`--font-sans` is Geist and is the only family actually loaded, via `next/font`. `--font-serif`
(Lora) and `--font-mono` (Fira Code) are declared for completeness but **not loaded** — nothing
uses them yet.

Don't add a webfont request without a reason. Most traffic arrives on mobile from a WhatsApp
link, and each family is a round trip before text paints.

## Component rules

### Maximum 100 lines per file

Enforced by ESLint `max-lines` on `src/app/**/*.tsx`. One component per file, so the file limit
and the component limit are the same thing.

The limit is a forcing function for composition, not a golf score. When you're pushing against it:

1. **Extract a subcomponent** — any JSX block with its own conditional logic is already a component
2. **Move data fetching into a hook** — `useWishlist()` instead of inline query code
3. **Move formatting into `src/lib/`** — money, dates, i18n never live in a component
4. **Count your props.** More than about five usually means you want composition, not more props.

Don't game it by deleting blank lines or collapsing JSX. If a component genuinely needs 120 lines
of markup with no logic, say so in review — but that's rare, and it's usually two components.

### Composability over configuration

Prop explosion is the failure mode:

```tsx
// Don't — every new variation adds a boolean
<ItemCard item={item} showPrice showImage isCompact hideActions
          onEdit={...} onDelete={...} onClaim={...} />

// Do — the caller composes what it needs
<ItemCard item={item}>
  <ItemCard.Image />
  <ItemCard.Title />
  <ItemCard.Price />
  <ItemCard.Actions>
    <EditItemButton itemId={item.id} />
    <DeleteItemButton itemId={item.id} />
  </ItemCard.Actions>
</ItemCard>
```

This matters concretely here: the owner view and the visitor view render the *same* item card with
different affordances. With booleans that's `isOwner` threaded through every layer. With
composition, each view composes the parts it wants and neither knows about the other.

Rules of thumb:

- Boolean props that gate whole JSX blocks → make it a slot
- Every component accepts `className` and merges it via `cn()` — never overwrite the caller's
- Never take a prop just to pass it two levels down. Compose, or use context for genuinely
  ambient state.

### `cn()`

`clsx` + `tailwind-merge`, in `src/lib/cn.ts`. Every component that accepts `className` runs it
through `cn()` so caller classes win conflicts instead of losing to specificity roulette.

## Hooks

Reusable by default. One concern per hook.

```
src/lib/hooks/          generic, feature-agnostic (useMediaQuery, useLocalStorage)
src/app/**/hooks/       feature-specific (useClaimToggle, useItemForm)
```

- Return an object once there's more than two values — positional tuples stop being readable fast
- No component may contain business logic a hook could own. If a component has a `useEffect` with
  real logic in it, that's a hook trying to exist.
- Extract on the **second** use, not in anticipation of one

## Forms — react-hook-form + Zod

`react-hook-form` with `@hookform/resolvers/zod`.

The DRY win worth protecting: **the same Zod schema validates the form and the API route.**
The backend already validates every route boundary with Zod, so schemas live in
`src/lib/schemas/` and both sides import them.

```
src/lib/schemas/item.ts   →  createItemSchema
     ├── FE: useForm({ resolver: zodResolver(createItemSchema) })
     └── BE: createItemSchema.parse(await req.json())
```

Client and server can't disagree about what's valid, and adding a field is one edit. Server-side
validation stays mandatory regardless — the client is not a trust boundary.

**Use the `Field` primitive (`src/app/_ui/field.tsx`), not Base UI's `Field.Error` directly.**
`Field.Error`'s own source computes its displayed text from native `ValidityState` or Base UI's
own `Form` component's error map — it **ignores whatever JSX children you hand it**. It's built
around Base UI's own validation system, not an external library like RHF, so
`<Field.Error>{rhfMessage}</Field.Error>` silently renders nothing. `Field.Root`'s `invalid` prop
is the part that's real and worth using — it correctly drives `data-invalid`/`aria-invalid` on the
label and control. Our `Field` wrapper renders the error text as a plain element instead; pass
`fieldState.error?.message` into its `error` prop and don't reach for `Field.Error` yourself.

## Data — TanStack Query

One base fetcher, everything built on it. No bare `fetch()` in a component, ever.

```
src/lib/api/client.ts    apiFetch — base URL, JSON, error → typed domain errors
src/lib/api/keys.ts      query key factory
src/lib/api/queries.ts   typed hooks built on the two above
```

**`apiFetch` is the single choke point.** It owns JSON parsing, non-2xx → typed error mapping
(matching the `{ error: { code, message } }` envelope in
[api-contract.md](../context/api-contract.md)), and auth failure handling. Adding a header or
changing error handling is then one edit rather than thirty.

**Query keys come from a factory**, never inline arrays:

```ts
export const queryKeys = {
  me: () => ["me"] as const,
  wishlist: (slug: string) => ["wishlist", slug] as const,
};
```

Inline keys are how cache invalidation silently stops working — one typo and the mutation
invalidates nothing.

**Defaults live on the QueryClient**, not repeated per hook. Set `staleTime`, retry behavior, and
refetch policy once.

Auth is a same-origin httpOnly cookie, so it rides along automatically — no `Authorization`
header, no token handling in the client. That's the point of
[ADR-0003](../adr/0003-jwt-in-httponly-cookie.md).

Claim toggles are optimistic: `onMutate` flips the cache, `onError` rolls back, `onSettled`
invalidates. A visitor tapping *bought* on a phone shouldn't wait on a round trip.

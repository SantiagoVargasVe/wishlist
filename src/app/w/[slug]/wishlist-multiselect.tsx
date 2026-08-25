"use client";

import { Combobox } from "@base-ui-components/react/combobox";
import { Controller, type Control } from "react-hook-form";

import { t } from "@/lib/i18n";
import type { CreateItemInput } from "@/lib/schemas/item";
import type { PublicWishlist } from "@/server/services/wishlists";

/**
 * Replaces T053's checkbox list (T084) — a searchable multi-select combobox,
 * matching Base UI's own multiple-select pattern
 * (https://base-ui.com/react/components/combobox#multiple-select).
 *
 * `Value` is the wishlist **id** (`string`), not the `PublicWishlist` object
 * itself — that keeps this wired to `wishlistIds: string[]` with zero
 * mapping at the call site, exactly like the checkbox list it replaces.
 * `itemToStringLabel` closes over `wishlists` to turn an id into its title
 * for both display and the combobox's own built-in search filtering.
 *
 * Chip removal is positional, not value-keyed — `Combobox.ChipRemove` acts
 * on whichever chip it's nested inside, by index within `Combobox.Chips`'
 * children. Rendering `field.value.map(...)` in order (never reordered) is
 * what keeps that correct.
 */
export function WishlistMultiSelect({
  wishlists,
  control,
  error,
  disabled,
}: {
  wishlists: PublicWishlist[];
  control: Control<CreateItemInput>;
  error?: string;
  disabled?: boolean;
}) {
  const titleOf = (id: string) => wishlists.find((w) => w.id === id)?.title ?? id;

  return (
    <Controller
      name="wishlistIds"
      control={control}
      render={({ field }) => (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground" id="wishlist-multiselect-label">
            {t("wishlist.addItemModal.lists")}
          </span>
          <Combobox.Root
            items={wishlists.map((w) => w.id)}
            multiple
            value={field.value}
            onValueChange={field.onChange}
            itemToStringLabel={titleOf}
            disabled={disabled}
          >
            <Combobox.Chips className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
              {field.value.map((id) => (
                <Combobox.Chip
                  key={id}
                  className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                >
                  {titleOf(id)}
                  <Combobox.ChipRemove
                    aria-label={`${t("wishlist.addItemModal.removeList")} ${titleOf(id)}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </Combobox.ChipRemove>
                </Combobox.Chip>
              ))}
              <Combobox.Input
                aria-labelledby="wishlist-multiselect-label"
                placeholder={field.value.length === 0 ? t("wishlist.addItemModal.lists") : undefined}
                className="min-w-24 flex-1 bg-transparent text-sm outline-none"
              />
            </Combobox.Chips>
            <Combobox.Portal>
              <Combobox.Positioner className="z-50" sideOffset={4}>
                <Combobox.Popup className="max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg">
                  <Combobox.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
                    {t("wishlist.addItemModal.noListsFound")}
                  </Combobox.Empty>
                  <Combobox.List>
                    {(id: string) => (
                      <Combobox.Item
                        key={id}
                        value={id}
                        className="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                      >
                        {titleOf(id)}
                      </Combobox.Item>
                    )}
                  </Combobox.List>
                </Combobox.Popup>
              </Combobox.Positioner>
            </Combobox.Portal>
          </Combobox.Root>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    />
  );
}

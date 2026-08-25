"use client";

import { Controller, type Control } from "react-hook-form";

import { Checkbox } from "@/app/_ui/checkbox";
import { t } from "@/lib/i18n";
import type { CreateItemInput } from "@/lib/schemas/item";
import type { PublicWishlist } from "@/server/services/wishlists";

/**
 * Controlled via RHF's `Controller`, not `register()` — `Checkbox` is a
 * `span`-based Base UI control with no native `onChange`, and there are N of
 * them collapsing into one array field rather than N independent fields.
 */
export function WishlistCheckboxList({
  wishlists,
  control,
  error,
}: {
  wishlists: PublicWishlist[];
  control: Control<CreateItemInput>;
  error?: string;
}) {
  return (
    <Controller
      name="wishlistIds"
      control={control}
      render={({ field }) => (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t("wishlist.addItemModal.lists")}
          </span>
          <div className="flex flex-col gap-2">
            {wishlists.map((wishlist) => (
              <label key={wishlist.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  // Explicit label, not implicit wrapping-<label> association:
                  // Checkbox's own hidden native input (the real labelable
                  // target) is `aria-hidden`, so the visible `role="checkbox"`
                  // span never picks up the wrapping label's text otherwise.
                  aria-label={wishlist.title}
                  checked={field.value.includes(wishlist.id)}
                  onCheckedChange={(checked) =>
                    field.onChange(
                      checked
                        ? [...field.value, wishlist.id]
                        : field.value.filter((id) => id !== wishlist.id),
                    )
                  }
                />
                {wishlist.title}
              </label>
            ))}
          </div>
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

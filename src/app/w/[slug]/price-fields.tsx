import { Controller, useWatch, type Control, type FieldErrors, type Path } from "react-hook-form";

import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { Select, SelectContent, SelectTrigger } from "@/app/_ui/select";
import { t } from "@/lib/i18n";
import { formatAmountInput, parseAmountInput } from "@/lib/money";

type PriceFieldValues = { priceAmount?: string; priceCurrency?: "COP" | "USD" };

/**
 * Generic over any form shape that has these two fields — `createItemSchema`
 * and `updateItemSchema` (T053, T054) give them the identical type, so one
 * component serves both forms and the type parameter is inferred from
 * whatever `control`/`errors` the caller already has; no call site needs to
 * name it.
 */
export function PriceFields<T extends PriceFieldValues>({
  control,
  errors,
}: {
  control: Control<T>;
  errors: FieldErrors<T>;
}) {
  // Masking needs the *other* field's live value — the display format
  // (period vs. comma thousands) depends on whichever currency is currently
  // selected, so switching it reformats an already-typed amount to match.
  const currency = useWatch({ control, name: "priceCurrency" as Path<T> }) as
    | "COP"
    | "USD"
    | undefined;

  return (
    <div className="flex gap-3">
      <Field
        label={t("wishlist.addItemModal.price")}
        error={errors.priceAmount?.message as string | undefined}
        className="flex-1"
      >
        <Controller
          name={"priceAmount" as Path<T>}
          control={control}
          render={({ field }) => {
            const raw = (field.value as string | undefined) ?? "";
            return (
              <Input
                inputMode="decimal"
                value={currency ? formatAmountInput(raw, currency) : raw}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "") {
                    field.onChange(undefined);
                    return;
                  }
                  field.onChange(currency ? parseAmountInput(value, currency) : value);
                }}
                onBlur={field.onBlur}
              />
            );
          }}
        />
      </Field>
      <Field label={t("wishlist.addItemModal.currency")} className="w-28">
        <Controller
          name={"priceCurrency" as Path<T>}
          control={control}
          render={({ field }) => (
            <Select.Root value={(field.value as string | null | undefined) ?? null} onValueChange={field.onChange}>
              <SelectTrigger placeholder={t("wishlist.addItemModal.currency")} />
              <SelectContent>
                <Select.Item value="COP">COP</Select.Item>
                <Select.Item value="USD">USD</Select.Item>
              </SelectContent>
            </Select.Root>
          )}
        />
      </Field>
    </div>
  );
}

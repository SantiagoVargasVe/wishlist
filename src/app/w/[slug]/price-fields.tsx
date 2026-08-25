import { Controller, type Control, type FieldErrors, type Path, type UseFormRegister } from "react-hook-form";

import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { Select, SelectContent, SelectTrigger } from "@/app/_ui/select";
import { t } from "@/lib/i18n";

/** "" → undefined: an untouched/cleared native input reads back as an empty
 * string, but the schema's `priceAmount` is optional and only meaningful
 * paired with a currency — an empty field must validate as "not provided",
 * never "invalid amount". */
const emptyToUndefined = (v: string) => (v === "" ? undefined : v);

type PriceFieldValues = { priceAmount?: string; priceCurrency?: "COP" | "USD" };

/**
 * Generic over any form shape that has these two fields — `createItemSchema`
 * and `updateItemSchema` (T053, T054) give them the identical type, so one
 * component serves both forms and the type parameter is inferred from
 * whatever `register`/`control`/`errors` the caller already has; no call site
 * needs to name it.
 */
export function PriceFields<T extends PriceFieldValues>({
  register,
  control,
  errors,
}: {
  register: UseFormRegister<T>;
  control: Control<T>;
  errors: FieldErrors<T>;
}) {
  return (
    <div className="flex gap-3">
      <Field
        label={t("wishlist.addItemModal.price")}
        error={errors.priceAmount?.message as string | undefined}
        className="flex-1"
      >
        <Input
          inputMode="decimal"
          {...register("priceAmount" as Path<T>, { setValueAs: emptyToUndefined })}
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

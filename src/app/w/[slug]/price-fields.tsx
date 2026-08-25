import { Controller, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";

import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { Select, SelectContent, SelectTrigger } from "@/app/_ui/select";
import { t } from "@/lib/i18n";
import type { CreateItemInput } from "@/lib/schemas/item";

/** "" → undefined: an untouched/cleared native input reads back as an empty
 * string, but the schema's `priceAmount` is optional and only meaningful
 * paired with a currency — an empty field must validate as "not provided",
 * never "invalid amount". */
const emptyToUndefined = (v: string) => (v === "" ? undefined : v);

export function PriceFields({
  register,
  control,
  errors,
}: {
  register: UseFormRegister<CreateItemInput>;
  control: Control<CreateItemInput>;
  errors: FieldErrors<CreateItemInput>;
}) {
  return (
    <div className="flex gap-3">
      <Field label={t("wishlist.addItemModal.price")} error={errors.priceAmount?.message} className="flex-1">
        <Input inputMode="decimal" {...register("priceAmount", { setValueAs: emptyToUndefined })} />
      </Field>
      <Field label={t("wishlist.addItemModal.currency")} className="w-28">
        <Controller
          name="priceCurrency"
          control={control}
          render={({ field }) => (
            <Select.Root value={field.value ?? null} onValueChange={field.onChange}>
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

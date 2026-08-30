import type { UseFormRegister } from "react-hook-form";

import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { t } from "@/lib/i18n";
import type { CreateItemInput } from "@/lib/schemas/item";

/**
 * Just the URL field now. It used to also render a bordered card with the
 * scraped thumbnail + site name as a "yes, this is the right product"
 * signal (T053), but T086's `ItemImagePicker` already shows the scraped
 * image (and lets the user swap it), so that card was duplicate UI and it
 * pushed the modal into a vertical scroll on smaller viewports — dropped in
 * T091. The site name was the only thing unique to it.
 */
export function ItemPreviewField({
  register,
  error,
}: {
  register: UseFormRegister<CreateItemInput>;
  error?: string;
}) {
  return (
    <Field label={t("wishlist.addItemModal.url")} error={error}>
      <Input
        type="url"
        autoComplete="off"
        placeholder={t("wishlist.addItemModal.urlPlaceholder")}
        {...register("url")}
      />
    </Field>
  );
}

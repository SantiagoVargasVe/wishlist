import Image from "next/image";
import type { UseFormRegister } from "react-hook-form";

import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { t } from "@/lib/i18n";
import type { CreateItemInput } from "@/lib/schemas/item";
import type { usePreviewQuery } from "@/lib/api/queries";

/**
 * The url field plus whatever the live scrape found so far. The image and
 * site name are shown here purely as a "yes, this is the right product"
 * signal — neither is part of `createItemSchema`, so neither is ever
 * submitted (see T053's task file § Design decisions).
 */
export function ItemPreviewField({
  register,
  error,
  preview,
}: {
  register: UseFormRegister<CreateItemInput>;
  error?: string;
  preview: ReturnType<typeof usePreviewQuery>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Field label={t("wishlist.addItemModal.url")} error={error}>
        <Input
          type="url"
          autoComplete="off"
          placeholder={t("wishlist.addItemModal.urlPlaceholder")}
          {...register("url")}
        />
      </Field>
      {preview.isFetching && (
        <div className="h-16 animate-pulse rounded-md bg-muted" aria-hidden="true" />
      )}
      {preview.data?.ogStatus === "ok" && (preview.data.imageUrl || preview.data.siteName) && (
        <div className="flex items-center gap-3 rounded-md border border-border p-2">
          {preview.data.imageUrl && (
            <Image
              src={preview.data.imageUrl}
              alt=""
              width={48}
              height={48}
              unoptimized
              className="size-12 shrink-0 rounded object-cover"
            />
          )}
          {preview.data.siteName && (
            <span className="text-sm text-muted-foreground">{preview.data.siteName}</span>
          )}
        </div>
      )}
    </div>
  );
}

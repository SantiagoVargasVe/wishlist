"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { Button } from "@/app/_ui/button";
import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { useUpdateItemMutation } from "@/lib/api/queries";
import { t } from "@/lib/i18n";
import { updateItemSchema, type UpdateItemInput } from "@/lib/schemas/item";
import type { PublicItem } from "@/server/services/items";

import { useItemImage } from "./hooks/use-item-image";
import { ItemImagePicker } from "./item-image-picker";
import { PriceFields } from "./price-fields";

export function EditItemForm({ item, onSuccess }: { item: PublicItem; onSuccess: () => void }) {
  const router = useRouter();
  const update = useUpdateItemMutation();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm<UpdateItemInput>({
    resolver: zodResolver(updateItemSchema),
    defaultValues: {
      url: item.url,
      title: item.title,
      notes: item.notes ?? "",
      priceAmount: item.priceAmount ?? undefined,
      priceCurrency: item.priceCurrency === null ? undefined : (item.priceCurrency as "COP" | "USD"),
    },
    mode: "onTouched",
  });

  const image = useItemImage();

  const onSubmit = handleSubmit(async (input) => {
    try {
      const imageUrl = image.imageUrlFor(undefined);
      await update.mutateAsync({ id: item.id, input: { ...input, imageUrl } });
      // Never throws — a failed upload toasts and leaves the edit saved.
      await image.uploadTo(item.id);
      onSuccess();
      router.refresh();
      // Both paths write image_path outside the request the form awaited: a
      // URL is downloaded unawaited server-side, and an upload lands after
      // this refresh was issued. Same catch-up as the add form (T081).
      if (image.picked) {
        window.setTimeout(() => router.refresh(), 1500);
        window.setTimeout(() => router.refresh(), 3500);
      }
    } catch {
      setError("root", { message: t("wishlist.editItemModal.errors.generic") });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label={t("wishlist.addItemModal.url")} error={errors.url?.message}>
        <Input type="url" {...register("url")} />
      </Field>
      <Field label={t("wishlist.addItemModal.itemTitle")} error={errors.title?.message}>
        <Input {...register("title")} />
      </Field>
      <Field label={t("wishlist.addItemModal.notes")} error={errors.notes?.message}>
        {/* Unlike the add form's "" → undefined, notes here is nullable —
            blanking a field the user can see already has a value means
            "clear it," not "leave it alone." */}
        <Input {...register("notes", { setValueAs: (v: string) => (v === "" ? null : v) })} />
      </Field>
      <ItemImagePicker
        picked={image.picked}
        scrapedUrl={item.imagePath ? `/media/${item.imagePath}` : null}
        error={image.error}
        onPickBlob={image.pickBlob}
        onPickUrl={image.pickUrl}
        onClear={image.clear}
      />
      <PriceFields control={control} errors={errors} />
      <p className="text-xs text-muted-foreground">{t("wishlist.editItemModal.priceHint")}</p>
      {errors.root?.message && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" disabled={!isValid || isSubmitting}>
        {isSubmitting ? t("wishlist.editItemModal.submitting") : t("wishlist.editItemModal.submit")}
      </Button>
    </form>
  );
}

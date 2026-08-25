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

import { PriceFields } from "./price-fields";

export function EditItemForm({ item, onSuccess }: { item: PublicItem; onSuccess: () => void }) {
  const router = useRouter();
  const update = useUpdateItemMutation();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateItemInput>({
    resolver: zodResolver(updateItemSchema),
    defaultValues: {
      url: item.url,
      title: item.title,
      notes: item.notes ?? "",
      priceAmount: item.priceAmount ?? undefined,
      priceCurrency: item.priceCurrency === null ? undefined : (item.priceCurrency as "COP" | "USD"),
    },
  });

  const onSubmit = handleSubmit(async (input) => {
    try {
      await update.mutateAsync({ id: item.id, input });
      onSuccess();
      router.refresh();
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
      <PriceFields control={control} errors={errors} />
      <p className="text-xs text-muted-foreground">{t("wishlist.editItemModal.priceHint")}</p>
      {errors.root?.message && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("wishlist.editItemModal.submitting") : t("wishlist.editItemModal.submit")}
      </Button>
    </form>
  );
}

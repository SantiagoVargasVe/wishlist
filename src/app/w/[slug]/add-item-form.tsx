"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { Button } from "@/app/_ui/button";
import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { useCreateItemMutation } from "@/lib/api/queries";
import { t } from "@/lib/i18n";
import { createItemSchema, type CreateItemInput } from "@/lib/schemas/item";
import type { PublicWishlist } from "@/server/services/wishlists";

import { useItemPreview } from "./hooks/use-item-preview";
import { ItemPreviewField } from "./item-preview-field";
import { PriceFields } from "./price-fields";
import { WishlistMultiSelect } from "./wishlist-multiselect";

export function AddItemForm({
  wishlists,
  currentWishlistId,
  onSuccess,
}: {
  wishlists: PublicWishlist[];
  currentWishlistId: string;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const create = useCreateItemMutation();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateItemInput>({
    resolver: zodResolver(createItemSchema),
    defaultValues: { url: "", title: "", notes: "", wishlistIds: [currentWishlistId] },
  });

  const preview = useItemPreview(watch("url"), setValue);

  const onSubmit = handleSubmit(async (input) => {
    try {
      await create.mutateAsync(input);
      onSuccess();
      router.refresh();
    } catch {
      setError("root", { message: t("wishlist.addItemModal.errors.generic") });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <ItemPreviewField register={register} error={errors.url?.message} preview={preview} />
      <Field label={t("wishlist.addItemModal.itemTitle")} error={errors.title?.message}>
        <Input {...register("title")} />
      </Field>
      <Field label={t("wishlist.addItemModal.notes")} error={errors.notes?.message}>
        {/* Same "" → undefined reasoning as priceAmount below: an
            untouched/cleared field must submit as "no notes", not a stored
            empty string. */}
        <Input {...register("notes", { setValueAs: (v: string) => (v === "" ? undefined : v) })} />
      </Field>
      <PriceFields control={control} errors={errors} />
      <WishlistMultiSelect
        wishlists={wishlists}
        control={control}
        error={errors.wishlistIds?.message}
      />
      {errors.root?.message && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("wishlist.addItemModal.submitting") : t("wishlist.addItemModal.submit")}
      </Button>
    </form>
  );
}

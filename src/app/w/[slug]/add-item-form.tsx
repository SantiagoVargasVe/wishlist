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

import { useItemImage } from "./hooks/use-item-image";
import { useItemPreview } from "./hooks/use-item-preview";
import { ItemImagePicker } from "./item-image-picker";
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
    formState: { errors, isSubmitting, isValid },
  } = useForm<CreateItemInput>({
    resolver: zodResolver(createItemSchema),
    defaultValues: { url: "", title: "", notes: "", wishlistIds: [currentWishlistId] },
    // "onTouched" rather than "onChange": still gives an accurate, live
    // `isValid` for the Save button (accessing `formState.isValid` makes RHF
    // validate once on mount and keep it current), but doesn't flash a
    // validation error on the url field the instant the user types a first
    // character — only once they've blurred it at least once.
    mode: "onTouched",
  });

  const preview = useItemPreview(watch("url"), setValue);
  const image = useItemImage();
  const fieldsDisabled = !preview.fieldsEnabled;

  const onSubmit = handleSubmit(async (input) => {
    try {
      const imageUrl = image.imageUrlFor(input.imageUrl);
      const { item } = await create.mutateAsync({ ...input, imageUrl });
      // After the item exists, so it has an id to attach bytes to. Never
      // throws — a failed upload toasts and leaves the item saved.
      await image.uploadTo(item.id);
      onSuccess();
      router.refresh();
      // POST /api/items (T033) fires the image download unawaited — a slow
      // retailer CDN must never delay the save itself (non-negotiable #2),
      // but that means *this* refresh can genuinely land before the
      // download has written image_path, showing the new item with no
      // image until something re-fetches. Rather than making the save wait
      // (reopening T033's own explicit "never delay the save" criterion),
      // a couple of delayed catch-up refreshes give the — typically
      // sub-second — download a real chance to land without the user
      // reloading manually. Skipped entirely when there was never an image
      // to download in the first place.
      if (image.hasPendingImage(input.imageUrl)) {
        window.setTimeout(() => router.refresh(), 1500);
        window.setTimeout(() => router.refresh(), 3500);
      }
    } catch {
      setError("root", { message: t("wishlist.addItemModal.errors.generic") });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <ItemPreviewField register={register} error={errors.url?.message} preview={preview} />
      <Field label={t("wishlist.addItemModal.itemTitle")} error={errors.title?.message}>
        <Input {...register("title")} disabled={fieldsDisabled} />
      </Field>
      <Field label={t("wishlist.addItemModal.notes")} error={errors.notes?.message}>
        {/* Same "" → undefined reasoning as priceAmount below: an
            untouched/cleared field must submit as "no notes", not a stored
            empty string. */}
        <Input
          {...register("notes", { setValueAs: (v: string) => (v === "" ? undefined : v) })}
          disabled={fieldsDisabled}
        />
      </Field>
      <ItemImagePicker
        picked={image.picked}
        scrapedUrl={preview.data?.imageUrl}
        error={image.error}
        disabled={fieldsDisabled}
        onPickBlob={image.pickBlob}
        onPickUrl={image.pickUrl}
        onClear={image.clear}
      />
      <PriceFields control={control} errors={errors} disabled={fieldsDisabled} />
      <WishlistMultiSelect
        wishlists={wishlists}
        control={control}
        error={errors.wishlistIds?.message}
        disabled={fieldsDisabled}
      />
      {errors.root?.message && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" disabled={!isValid || isSubmitting}>
        {isSubmitting ? t("wishlist.addItemModal.submitting") : t("wishlist.addItemModal.submit")}
      </Button>
    </form>
  );
}

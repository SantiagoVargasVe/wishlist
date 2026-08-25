"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/app/_ui/button";
import { Dialog, DialogContent } from "@/app/_ui/dialog";
import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { useUpdateWishlistMutation } from "@/lib/api/queries";
import { t } from "@/lib/i18n";
import { createWishlistSchema, type CreateWishlistInput } from "@/lib/schemas/wishlist";
import type { PublicWishlist } from "@/server/services/wishlists";

/**
 * Reuses `createWishlistSchema` for validation rather than
 * `updateWishlistSchema` — both validate `title` identically, and the
 * update schema's optionality + "at least one field" refine exist for
 * `hideClaimsFromOwner`-only updates, which this form never does.
 */
export function RenameWishlistModal({ wishlist }: { wishlist: PublicWishlist }) {
  const router = useRouter();
  const update = useUpdateWishlistMutation();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateWishlistInput>({
    resolver: zodResolver(createWishlistSchema),
    defaultValues: { title: wishlist.title },
  });

  const onSubmit = handleSubmit(async (input) => {
    try {
      await update.mutateAsync({ id: wishlist.id, input });
      setOpen(false);
      router.refresh();
    } catch {
      setError("root", { message: t("wishlist.renameWishlistModal.errors.generic") });
    }
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button variant="secondary" size="sm">
            {t("wishlist.renameWishlist")}
          </Button>
        }
      />
      <DialogContent>
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold">
            {t("wishlist.renameWishlistModal.title")}
          </Dialog.Title>
          <Dialog.Close
            render={
              <Button variant="ghost" size="sm" aria-label={t("common.dismiss")}>
                ✕
              </Button>
            }
          />
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label={t("wishlist.createWishlistModal.titleLabel")} error={errors.title?.message}>
            <Input {...register("title")} />
          </Field>
          {errors.root?.message && (
            <p className="text-sm text-destructive" role="alert">
              {errors.root.message}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? t("wishlist.renameWishlistModal.submitting")
              : t("wishlist.renameWishlistModal.submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog.Root>
  );
}

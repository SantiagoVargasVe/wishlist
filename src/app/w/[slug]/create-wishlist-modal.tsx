"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/app/_ui/button";
import { Dialog, DialogContent } from "@/app/_ui/dialog";
import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { useCreateWishlistMutation } from "@/lib/api/queries";
import { t } from "@/lib/i18n";
import { createWishlistSchema, type CreateWishlistInput } from "@/lib/schemas/wishlist";

export function CreateWishlistModal() {
  const router = useRouter();
  const create = useCreateWishlistMutation();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateWishlistInput>({ resolver: zodResolver(createWishlistSchema) });

  const onSubmit = handleSubmit(async (input) => {
    try {
      const { wishlist } = await create.mutateAsync(input);
      setOpen(false);
      reset();
      router.push(`/w/${wishlist.slug}`);
    } catch {
      setError("root", { message: t("wishlist.createWishlistModal.errors.generic") });
    }
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button variant="secondary" size="sm">
            {t("wishlist.createWishlist")}
          </Button>
        }
      />
      <DialogContent>
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold">
            {t("wishlist.createWishlistModal.title")}
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
              ? t("wishlist.createWishlistModal.submitting")
              : t("wishlist.createWishlistModal.submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog.Root>
  );
}

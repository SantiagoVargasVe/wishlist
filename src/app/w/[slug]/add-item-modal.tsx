"use client";

import { useState } from "react";

import { Button } from "@/app/_ui/button";
import { Dialog, DialogContent } from "@/app/_ui/dialog";
import { t } from "@/lib/i18n";
import type { PublicWishlist } from "@/server/services/wishlists";

import { AddItemForm } from "./add-item-form";

/**
 * Owns the open/close state so a successful submit can close itself
 * (`AddItemForm`'s `onSuccess`) — Base UI unmounts `DialogContent` on close,
 * so reopening always mounts a fresh, empty `AddItemForm` for free.
 */
export function AddItemModal({
  wishlists,
  currentWishlistId,
}: {
  wishlists: PublicWishlist[];
  currentWishlistId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={<Button>{t("wishlist.addItem")}</Button>} />
      <DialogContent>
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold">
            {t("wishlist.addItemModal.title")}
          </Dialog.Title>
          <Dialog.Close
            render={
              <Button variant="ghost" size="sm" aria-label={t("common.dismiss")}>
                ✕
              </Button>
            }
          />
        </div>
        <AddItemForm
          wishlists={wishlists}
          currentWishlistId={currentWishlistId}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog.Root>
  );
}

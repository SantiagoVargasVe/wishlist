"use client";

import { useState } from "react";

import { Button } from "@/app/_ui/button";
import { Dialog, DialogContent } from "@/app/_ui/dialog";
import { t } from "@/lib/i18n";
import type { PublicItem } from "@/server/services/items";

import { EditItemForm } from "./edit-item-form";

export function EditItemModal({ item }: { item: PublicItem }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button variant="secondary" size="sm">
            {t("wishlist.editItem")}
          </Button>
        }
      />
      <DialogContent>
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold">
            {t("wishlist.editItemModal.title")}
          </Dialog.Title>
          <Dialog.Close
            render={
              <Button variant="ghost" size="sm" aria-label={t("common.dismiss")}>
                ✕
              </Button>
            }
          />
        </div>
        <EditItemForm item={item} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog.Root>
  );
}

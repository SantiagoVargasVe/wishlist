"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/app/_ui/button";
import { ConfirmDialog } from "@/app/_ui/confirm-dialog";
import { Toast } from "@/app/_ui/toast";
import { useDeleteItemMutation } from "@/lib/api/queries";
import { t } from "@/lib/i18n";
import type { PublicItem } from "@/server/services/items";

/** Always confirms — deleting removes the item from every list it's in, with no non-destructive path. */
export function DeleteItemButton({ item }: { item: PublicItem }) {
  const router = useRouter();
  const toastManager = Toast.useToastManager();
  const deleteItem = useDeleteItemMutation();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" size="sm">
          {t("wishlist.deleteItem")}
        </Button>
      }
      title={t("wishlist.deleteItemDialog.title")}
      description={t("wishlist.deleteItemDialog.description", { title: item.title })}
      confirmLabel={t("wishlist.deleteItemDialog.confirm")}
      destructive
      onConfirm={async () => {
        try {
          await deleteItem.mutateAsync(item.id);
          router.refresh();
        } catch {
          toastManager.add({ type: "error", title: t("wishlist.deleteItemDialog.errors.generic") });
        }
      }}
    />
  );
}

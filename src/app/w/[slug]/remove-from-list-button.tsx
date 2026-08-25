"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/app/_ui/button";
import { ConfirmDialog } from "@/app/_ui/confirm-dialog";
import { Toast } from "@/app/_ui/toast";
import { useRemoveItemFromWishlistMutation } from "@/lib/api/queries";
import { t } from "@/lib/i18n";
import type { PublicItem } from "@/server/services/items";

/**
 * Only warns when `isLastList` — removing from any other list is a normal,
 * low-stakes filing action (the item still exists elsewhere), but removing
 * the last membership silently soft-deletes the item server-side with no
 * confirmation of its own (docs/frontend/CLAUDE.md § Delete vs. remove).
 */
export function RemoveFromListButton({
  item,
  wishlistId,
  isLastList,
}: {
  item: PublicItem;
  wishlistId: string;
  isLastList: boolean;
}) {
  const router = useRouter();
  const toastManager = Toast.useToastManager();
  const remove = useRemoveItemFromWishlistMutation();

  const handleRemove = async () => {
    try {
      await remove.mutateAsync({ itemId: item.id, wishlistId });
      router.refresh();
    } catch {
      toastManager.add({ type: "error", title: t("wishlist.removeErrors.generic") });
    }
  };

  if (!isLastList) {
    return (
      <Button variant="secondary" size="sm" onClick={handleRemove}>
        {t("wishlist.removeItem")}
      </Button>
    );
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="secondary" size="sm">
          {t("wishlist.removeItem")}
        </Button>
      }
      title={t("wishlist.removeLastListDialog.title")}
      description={t("wishlist.removeLastListDialog.description")}
      confirmLabel={t("wishlist.removeLastListDialog.confirm")}
      destructive
      onConfirm={handleRemove}
    />
  );
}

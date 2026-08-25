"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/app/_ui/button";
import { Dialog, DialogContent } from "@/app/_ui/dialog";
import { Toast } from "@/app/_ui/toast";
import { isApiError } from "@/lib/api/errors";
import { useDeleteWishlistMutation } from "@/lib/api/queries";
import { t } from "@/lib/i18n";
import type { PublicWishlist } from "@/server/services/wishlists";

type OrphanItem = { id: string; title: string };

/**
 * Bespoke rather than `ConfirmDialog` (T054): the orphan-item prompt isn't
 * known until the first plain `DELETE` responds, and confirming it means
 * showing *those specific items* and re-attempting with `?deleteOrphans=true`
 * — a second round trip `ConfirmDialog`'s single static description/onConfirm
 * contract has no room for. See T055's task file § Design decisions.
 */
export function DeleteWishlistButton({
  wishlist,
  redirectSlug,
}: {
  wishlist: PublicWishlist;
  redirectSlug: string;
}) {
  const router = useRouter();
  const toastManager = Toast.useToastManager();
  const deleteWishlist = useDeleteWishlistMutation();
  const [open, setOpen] = useState(false);
  const [orphans, setOrphans] = useState<OrphanItem[] | null>(null);
  const [isPending, setIsPending] = useState(false);

  const attemptDelete = async () => {
    setIsPending(true);
    try {
      await deleteWishlist.mutateAsync({ id: wishlist.id, deleteOrphans: orphans !== null });
      setOpen(false);
      router.push(`/w/${redirectSlug}`);
      router.refresh();
    } catch (error) {
      if (isApiError(error, "CONFIRM_DELETE_ORPHANS")) {
        setOrphans((error.details?.orphanItems as OrphanItem[] | undefined) ?? []);
      } else {
        setOpen(false);
        toastManager.add({ type: "error", title: t("wishlist.deleteWishlistDialog.errors.generic") });
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setOrphans(null);
      }}
    >
      <Dialog.Trigger
        render={
          <Button variant="destructive" size="sm">
            {t("wishlist.deleteWishlist")}
          </Button>
        }
      />
      <DialogContent className="md:max-w-sm">
        <Dialog.Title className="text-lg font-semibold">
          {t("wishlist.deleteWishlistDialog.title")}
        </Dialog.Title>
        {orphans ? (
          <>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {t("wishlist.deleteWishlistDialog.orphansWarning")}
            </Dialog.Description>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {orphans.map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ul>
          </>
        ) : (
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {t("wishlist.deleteWishlistDialog.description", { title: wishlist.title })}
          </Dialog.Description>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close
            render={
              <Button variant="secondary" size="sm">
                {t("common.cancel")}
              </Button>
            }
          />
          <Button variant="destructive" size="sm" disabled={isPending} onClick={attemptDelete}>
            {orphans
              ? t("wishlist.deleteWishlistDialog.confirmOrphans")
              : t("wishlist.deleteWishlistDialog.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}

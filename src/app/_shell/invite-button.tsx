"use client";

import { useState } from "react";

import { Button } from "@/app/_ui/button";
import { Dialog, DialogContent } from "@/app/_ui/dialog";
import { Toast } from "@/app/_ui/toast";
import { isApiError } from "@/lib/api/errors";
import { useMintInviteMutation } from "@/lib/api/queries";
import { t } from "@/lib/i18n";

type Invite = { code: string; expiresAt: string };

/**
 * Minting requires an explicit button press inside the dialog, not
 * on-open — it's rate limited and spends a real (if generous) quota, so an
 * accidental open shouldn't burn one the way an always-on-open mint would.
 */
export function InviteButton() {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const toastManager = Toast.useToastManager();
  const mint = useMintInviteMutation();

  const handleGenerate = async () => {
    try {
      setInvite(await mint.mutateAsync());
    } catch (error) {
      const seconds = isApiError(error, "RATE_LIMITED") ? error.details?.retryAfterSeconds : undefined;
      toastManager.add({
        type: "error",
        title:
          typeof seconds === "number"
            ? t("errors.rateLimited", { seconds })
            : t("errors.generic"),
      });
    }
  };

  const handleCopy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      toastManager.add({ title: t("invite.copied") });
    } catch {
      toastManager.add({ type: "error", title: t("invite.copyFailed") });
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInvite(null);
      }}
    >
      <Dialog.Trigger
        render={
          <Button variant="secondary" size="sm">
            {t("invite.trigger")}
          </Button>
        }
      />
      <DialogContent className="md:max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold">{t("invite.title")}</Dialog.Title>
          <Dialog.Close
            render={
              <Button variant="ghost" size="sm" aria-label={t("common.dismiss")}>
                ✕
              </Button>
            }
          />
        </div>
        {invite ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-center font-mono text-lg tracking-widest">
              {invite.code}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("invite.expiresOn", {
                date: new Date(invite.expiresAt).toLocaleDateString("es-CO"),
              })}
            </p>
            <Button onClick={handleCopy}>{t("invite.copy")}</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("invite.description")}</p>
            <Button onClick={handleGenerate} disabled={mint.isPending}>
              {mint.isPending ? t("invite.generating") : t("invite.generate")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog.Root>
  );
}

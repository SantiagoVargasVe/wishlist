"use client";

import { useState, type ReactElement } from "react";

import { t } from "@/lib/i18n";

import { Button } from "./button";
import { Dialog, DialogContent } from "./dialog";

/**
 * Generic destructive/consequential-action confirmation, shared by the
 * delete-item and last-list-removal flows (T054) — two call sites, past
 * design-system.md's "extract on the second use" bar.
 *
 * Owns its own open state and closes itself once `onConfirm` resolves.
 * `onConfirm` is expected to catch its own errors (toast them, same pattern
 * `ClaimButton` already uses) rather than reject — a rejection here would
 * leave the dialog stuck open with no way to surface why.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive,
}: {
  trigger: ReactElement<Record<string, unknown>>;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    await onConfirm();
    setIsConfirming(false);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={trigger} />
      <DialogContent className="md:max-w-sm">
        <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-muted-foreground">
          {description}
        </Dialog.Description>
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close
            render={
              <Button variant="secondary" size="sm">
                {t("common.cancel")}
              </Button>
            }
          />
          <Button
            variant={destructive ? "destructive" : "primary"}
            size="sm"
            disabled={isConfirming}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}

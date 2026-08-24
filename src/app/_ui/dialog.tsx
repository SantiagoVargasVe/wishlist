"use client";

import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Wraps Base UI's Dialog parts, per design-system.md. `Content` bundles
 * Portal + Backdrop + Popup — every real usage needs all three together, so
 * the primitive layer is exactly where that repetition should collapse.
 *
 * Full-screen sheet under 768px (`md:`), centered dialog above — the
 * responsive rule from design-system.md § Responsive.
 */
export const Dialog = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Close: BaseDialog.Close,
  Title: BaseDialog.Title,
  Description: BaseDialog.Description,
};

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-foreground/20" />
      <BaseDialog.Popup
        className={cn(
          "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-popover p-6 text-popover-foreground",
          "md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:w-full md:max-w-md",
          "md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:border-border md:shadow-lg",
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

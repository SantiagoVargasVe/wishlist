"use client";

import { Toast } from "@base-ui-components/react/toast";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

export { Toast };

/**
 * Renders once, inside `<Toast.Provider>` (providers.tsx) — everywhere else
 * that wants a toast just calls `Toast.useToastManager().add(...)`. Error-only
 * in this app so far: a successful claim/unclaim is its own feedback via the
 * optimistic UI flip, per design-system.md § Data.
 */
export function Toaster() {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className={cn(
              "rounded-lg border border-border bg-popover p-3 text-sm shadow-lg text-popover-foreground",
              toast.type === "error" && "border-destructive",
            )}
          >
            <Toast.Title className="font-medium" />
            <Toast.Description className="text-muted-foreground" />
            <Toast.Close className="mt-2 text-xs underline text-muted-foreground">
              {t("common.dismiss")}
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

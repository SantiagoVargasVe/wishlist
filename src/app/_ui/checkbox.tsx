"use client";

import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Used controlled (via RHF's `Controller`, not `register()` — a `<span>`-based
 * control has no native `onChange` event to register against), so no ref
 * forwarding is needed the way `Input` needs it.
 */
export function Checkbox({ className, ...props }: ComponentProps<typeof BaseCheckbox.Root>) {
  return (
    <BaseCheckbox.Root
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded border border-input bg-background",
        "data-[checked]:border-primary data-[checked]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator className="flex items-center justify-center text-primary-foreground data-[unchecked]:hidden">
        ✓
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}

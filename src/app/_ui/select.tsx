"use client";

import { Select as BaseSelect } from "@base-ui-components/react/select";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Single-select only — nothing in this app needs multi-select yet (choosing
 * which lists an item belongs to reads better as a checkbox list than a
 * multi-select dropdown, when that screen gets built). Add `Group`/`Arrow`
 * parts if a real use for them shows up; don't build them speculatively.
 */
export const Select = {
  Root: BaseSelect.Root,
  Item: SelectItem,
};

export function SelectTrigger({
  className,
  placeholder,
  ...props
}: ComponentProps<typeof BaseSelect.Trigger> & { placeholder?: string }) {
  return (
    <BaseSelect.Trigger
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      {/* Value has no placeholder prop of its own — it shows the raw
          selected value via a render function. Fine while every item's
          value already equals its display text (currency codes); a
          value/label lookup would need a real prop here if that changes. */}
      <BaseSelect.Value>{(value: string | null) => value ?? placeholder}</BaseSelect.Value>
      <BaseSelect.Icon className="text-muted-foreground">▾</BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

export function SelectContent({ children }: { children: ReactNode }) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner className="z-50" sideOffset={4}>
        <BaseSelect.Popup className="max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {children}
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

function SelectItem({ className, children, ...props }: ComponentProps<typeof BaseSelect.Item>) {
  return (
    <BaseSelect.Item
      className={cn(
        "flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}

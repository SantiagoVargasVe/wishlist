"use client";

import { Input as BaseInput, type InputProps } from "@base-ui-components/react/input";
import { forwardRef } from "react";

import { cn } from "@/lib/cn";

/**
 * Base UI's `Input` is a plain `<input>` that already works with `Field` out
 * of the box — no manual id/aria wiring needed. Forwards its ref, which
 * react-hook-form's `register()` needs to attach to the real DOM node.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <BaseInput
    ref={ref}
    className={cn(
      "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground",
      "placeholder:text-muted-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";

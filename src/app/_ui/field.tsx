"use client";

import { Field as BaseField } from "@base-ui-components/react/field";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Label + control + error message, wired for react-hook-form — not for Base
 * UI's own validation. RHF owns validation; pass its
 * `fieldState.error?.message` in as `error`.
 *
 * `Field.Root`'s `invalid` prop is what's real here — it drives `data-invalid`
 * / `aria-invalid` on the label and control. `Field.Error` is deliberately
 * **not used**: its own source computes its children from native
 * `ValidityState` or Base UI's own `Form` context, ignoring whatever JSX
 * children you hand it — it isn't built for an external validation library
 * like RHF. The error text is a plain element instead.
 *
 * Known gap: this doesn't wire `aria-describedby` from the error text to the
 * control the way `Field.Error` would have — that needs the control's id,
 * which `children` doesn't expose generically. Revisit if a screen reader
 * pass through the real forms (T014/T053/T054) flags it as a problem.
 */
export function Field({ label, error, children, className }: FieldProps) {
  return (
    <BaseField.Root invalid={Boolean(error)} className={cn("flex flex-col gap-1.5", className)}>
      <BaseField.Label className="text-sm font-medium text-foreground">{label}</BaseField.Label>
      {children}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </BaseField.Root>
  );
}

"use client";

import { Field as BaseField } from "@base-ui-components/react/field";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { translateMessage } from "@/lib/i18n";

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
 *
 * `error` may be an i18n key (some Zod schemas store keys so they stay
 * English — T092); `translateMessage` resolves those and passes any other
 * string through unchanged.
 */
export function Field({ label, error, children, className }: FieldProps) {
  const message = translateMessage(error);
  return (
    <BaseField.Root invalid={Boolean(message)} className={cn("flex flex-col gap-1.5", className)}>
      <BaseField.Label className="text-sm font-medium text-foreground">{label}</BaseField.Label>
      {children}
      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
    </BaseField.Root>
  );
}

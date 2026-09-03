"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/app/_ui/button";
import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { apiFetch } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { t } from "@/lib/i18n";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/schemas/auth";

import { RequestSent } from "./request-sent";

/**
 * The copy carries real weight here. The API answers an identical 202 whether
 * or not the address is registered (ADR-0012), so this form cannot honestly say
 * "revisa tu correo" — it says "if that address is registered, we sent a link".
 * The success state has to be reassuring to a relative who is already locked
 * out without claiming something the server never confirmed.
 */
export function ForgotPasswordForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (input) => {
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(input),
      });
    } catch (error) {
      if (isApiError(error, "RATE_LIMITED")) {
        const seconds = error.details?.retryAfterSeconds;
        setError("root", {
          message: t("errors.rateLimited", {
            seconds: typeof seconds === "number" ? seconds : 0,
          }),
        });
      } else {
        setError("root", { message: t("errors.generic") });
      }
    }
  });

  if (isSubmitSuccessful) return <RequestSent />;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">{t("auth.forgotPassword.intro")}</p>
      <Field label={t("auth.forgotPassword.email")} error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} />
      </Field>
      {errors.root?.message && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      {/* Disabled in flight so a double-tap can't spend two of the three
          requests this address gets in an hour. */}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("auth.forgotPassword.submitting") : t("auth.forgotPassword.submit")}
      </Button>
    </form>
  );
}

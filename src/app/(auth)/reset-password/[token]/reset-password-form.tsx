"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/app/_ui/button";
import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { apiFetch } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { t } from "@/lib/i18n";
import {
  resetPasswordFormSchema,
  type ResetPasswordFormInput,
} from "@/lib/schemas/auth";

import { ExpiredLink } from "./expired-link";

/**
 * Success does **not** log the user in — the API sets no cookie (T103), so this
 * sends them to `/login` with a confirmation. A reset link arriving in a mailbox
 * is not proof of session intent, and they have just proven they can type the
 * new password.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [expired, setExpired] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<ResetPasswordFormInput>({ resolver: zodResolver(resetPasswordFormSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      router.push("/login?reset=1");
      router.refresh();
    } catch (error) {
      // Invalid, expired and already-used tokens arrive as one code. There is
      // nothing to tell apart and only one useful next step: get a new link.
      if (isApiError(error, "RESET_TOKEN_INVALID")) {
        setExpired(true);
      } else if (isApiError(error, "RATE_LIMITED")) {
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

  if (expired) return <ExpiredLink />;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label={t("auth.resetPassword.password")} error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...register("password")} />
      </Field>
      <Field
        label={t("auth.resetPassword.passwordConfirm")}
        error={errors.passwordConfirm?.message}
      >
        <Input type="password" autoComplete="new-password" {...register("passwordConfirm")} />
      </Field>
      {errors.root?.message && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      {/* Disabled while in flight *and* after success: the token is single-use,
          so a double-submit would burn it and land the user on the expired
          screen having just succeeded. */}
      <Button type="submit" disabled={isSubmitting || isSubmitSuccessful}>
        {isSubmitting
          ? t("auth.resetPassword.submitting")
          : t("auth.resetPassword.submit")}
      </Button>
    </form>
  );
}

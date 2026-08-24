"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, type UseFormSetError } from "react-hook-form";

import { Button } from "@/app/_ui/button";
import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { apiFetch } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { t } from "@/lib/i18n";
import { registerSchema, type RegisterInput } from "@/lib/schemas/auth";

function applyRegisterError(error: unknown, setError: UseFormSetError<RegisterInput>) {
  if (isApiError(error, "EMAIL_TAKEN")) {
    setError("email", { message: t("auth.register.errors.emailTaken") });
  } else if (isApiError(error, "INVITE_ALREADY_USED")) {
    setError("inviteCode", { message: t("auth.register.errors.inviteAlreadyUsed") });
  } else if (isApiError(error) && error.details?.field === "inviteCode") {
    // Covers both "invalid" and "expired" — the server uses the same
    // VALIDATION_FAILED code for both, so this can't tell them apart.
    setError("inviteCode", { message: t("auth.register.errors.invalidInviteCode") });
  } else if (isApiError(error, "RATE_LIMITED")) {
    const seconds = error.details?.retryAfterSeconds;
    setError("root", {
      message: t("errors.rateLimited", { seconds: typeof seconds === "number" ? seconds : 0 }),
    });
  } else {
    setError("root", { message: t("errors.generic") });
  }
}

export function RegisterForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (input) => {
    try {
      await apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
      router.push("/");
      router.refresh();
    } catch (error) {
      applyRegisterError(error, setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label={t("auth.register.displayName")} error={errors.displayName?.message}>
        <Input autoComplete="name" {...register("displayName")} />
      </Field>
      <Field label={t("auth.register.email")} error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} />
      </Field>
      <Field label={t("auth.register.password")} error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...register("password")} />
      </Field>
      <Field label={t("auth.register.inviteCode")} error={errors.inviteCode?.message}>
        <Input autoComplete="off" {...register("inviteCode")} />
      </Field>
      {errors.root?.message && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("auth.register.submitting") : t("auth.register.submit")}
      </Button>
    </form>
  );
}

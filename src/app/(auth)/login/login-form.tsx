"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { Button } from "@/app/_ui/button";
import { Field } from "@/app/_ui/field";
import { Input } from "@/app/_ui/input";
import { apiFetch } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { t } from "@/lib/i18n";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";

export function LoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (input) => {
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
      router.push("/");
      router.refresh();
    } catch (error) {
      // Deliberately form-level, never attached to email/password — pinning it
      // to one field would leak which one was wrong (see T012).
      if (isApiError(error, "INVALID_CREDENTIALS")) {
        setError("root", { message: t("auth.login.errors.invalidCredentials") });
      } else if (isApiError(error, "RATE_LIMITED")) {
        const seconds = error.details?.retryAfterSeconds;
        setError("root", {
          message: t("errors.rateLimited", { seconds: typeof seconds === "number" ? seconds : 0 }),
        });
      } else {
        setError("root", { message: t("errors.generic") });
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label={t("auth.login.email")} error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} />
      </Field>
      <Field label={t("auth.login.password")} error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...register("password")} />
      </Field>
      {errors.root?.message && (
        <p className="text-sm text-destructive" role="alert">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
      </Button>
    </form>
  );
}

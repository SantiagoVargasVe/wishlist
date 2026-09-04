import type { Metadata } from "next";

import { t } from "@/lib/i18n";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: t("auth.forgotPassword.title") };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("auth.forgotPassword.title")}</h1>
      <ForgotPasswordForm />
    </div>
  );
}

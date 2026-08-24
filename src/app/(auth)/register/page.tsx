import type { Metadata } from "next";
import Link from "next/link";

import { t } from "@/lib/i18n";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: t("auth.register.title") };

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("auth.register.title")}</h1>
      <RegisterForm />
      <p className="text-sm text-muted-foreground">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          {t("auth.register.loginLink")}
        </Link>
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { t } from "@/lib/i18n";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t("auth.login.title") };

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("auth.login.title")}</h1>
      <LoginForm />
      <p className="text-sm text-muted-foreground">
        {t("auth.login.noAccount")}{" "}
        <Link href="/register" className="text-primary underline-offset-4 hover:underline">
          {t("auth.login.registerLink")}
        </Link>
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { t } from "@/lib/i18n";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t("auth.login.title") };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  // Set by the reset flow, which deliberately does not log the user in (T103) —
  // without this they land on a plain login form with no sign anything worked.
  const { reset } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("auth.login.title")}</h1>
      {reset === "1" && (
        <p className="text-sm text-foreground" role="status">
          {t("auth.login.resetDone")}
        </p>
      )}
      <LoginForm />
      <p className="text-sm text-muted-foreground">
        {t("auth.login.noAccount")}{" "}
        <Link href="/register" className="text-primary underline-offset-4 hover:underline">
          {t("auth.login.registerLink")}
        </Link>
      </p>
      {/* Without this the whole recovery flow is unreachable, which is the most
          likely way E12 ships and goes unused. */}
      <p className="text-sm text-muted-foreground">
        <Link
          href="/forgot-password"
          className="text-primary underline-offset-4 hover:underline"
        >
          {t("auth.login.forgotLink")}
        </Link>
      </p>
    </div>
  );
}

import type { Metadata } from "next";

import { t } from "@/lib/i18n";

import { VerifyEmailStatus } from "./verify-email-status";

/**
 * `referrer: "no-referrer"` for the same reason as the reset page: the URL
 * carries a single-use token, and nothing on this page should ever hand it to
 * a third party in a `Referer` header.
 */
export const metadata: Metadata = {
  title: t("auth.verifyEmail.page.title"),
  referrer: "no-referrer",
};

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("auth.verifyEmail.page.title")}</h1>
      <VerifyEmailStatus token={token} />
    </div>
  );
}

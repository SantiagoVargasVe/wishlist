import type { Metadata } from "next";

import { t } from "@/lib/i18n";

import { ResetPasswordForm } from "./reset-password-form";

/**
 * `referrer: "no-referrer"` is the point of this metadata block, not the title.
 *
 * The URL contains a live credential (ADR-0012 accepts that, since a form to
 * paste a token into is materially worse for the least technical users). This
 * page deliberately makes **no third-party requests** — no fonts, no analytics,
 * no external images, no outbound links — so nothing should ever carry the
 * token in a `Referer` header. The policy is belt-and-braces for the day
 * someone adds an image without thinking about it.
 */
export const metadata: Metadata = {
  title: t("auth.resetPassword.title"),
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("auth.resetPassword.title")}</h1>
      {/* The token is never validated here, only when it is spent. A pre-flight
          check would be a second way to probe which tokens exist, and would let
          a link be marked used by merely opening it. */}
      <ResetPasswordForm token={token} />
    </div>
  );
}

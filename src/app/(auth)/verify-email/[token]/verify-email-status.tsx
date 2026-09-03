"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { t } from "@/lib/i18n";

import { VerifyEmailFailed } from "./verify-email-failed";

type Status = "verifying" | "ok" | "failed";

/**
 * Consumes the token on load.
 *
 * The token is spent here rather than on a button press: the user already
 * expressed intent by opening the link, and asking them to confirm a
 * confirmation is friction with no purpose. It costs nothing if they open the
 * link twice — the second attempt lands on the failure state, which offers a
 * resend rather than a dead end.
 */
export function VerifyEmailStatus({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("verifying");
  // React 18+ runs effects twice in development StrictMode. Without this the
  // second run spends a token the first one already consumed, and a perfectly
  // good link renders as expired.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    apiFetch("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => setStatus("ok"))
      .catch(() => setStatus("failed"));
  }, [token]);

  if (status === "verifying") {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("auth.verifyEmail.page.verifying")}
      </p>
    );
  }

  if (status === "failed") return <VerifyEmailFailed />;

  return (
    <div className="flex flex-col gap-3" role="status">
      <h2 className="text-base font-medium text-foreground">
        {t("auth.verifyEmail.page.successTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("auth.verifyEmail.page.successBody")}</p>
      <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
        {t("auth.verifyEmail.page.successCta")}
      </Link>
    </div>
  );
}

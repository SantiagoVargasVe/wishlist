"use client";

import { useState } from "react";

import { Button } from "@/app/_ui/button";
import { t } from "@/lib/i18n";

import { useResendVerification } from "./hooks/use-resend-verification";

const DISMISSED_KEY = "wishlist:verify-prompt-dismissed";

/**
 * A prompt, never a wall.
 *
 * An unverified user keeps full use of the app — the only thing they lose is
 * self-service password reset (ADR-0013) — so this sits in the normal document
 * flow above the page content. It does not overlay, block, or gate anything. If
 * it can't be dismissed and worked around, it's wrong.
 *
 * Dismissal is `sessionStorage`, deliberately: this **should** come back. An
 * unverified state the user can't see is a gap they can't close, and the whole
 * epic's safety story depends on people actually verifying. Forgetting it
 * forever would quietly turn "not now" into "never".
 */
export function VerifyEmailPrompt() {
  const [dismissed, setDismissed] = useState(() => {
    // Guarded: sessionStorage throws in a few privacy configurations, and a
    // header that can crash the whole shell is worse than a prompt that shows
    // once more than it needed to.
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const { state, resend, busy } = useResendVerification();

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Dismissed for this render either way; it just returns on the next load.
    }
  };

  if (dismissed) return null;

  return (
    <div className="border-b border-border bg-muted">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("auth.verifyEmail.prompt.message")}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={resend} disabled={busy}>
            {state === "sending"
              ? t("auth.verifyEmail.prompt.resending")
              : t("auth.verifyEmail.prompt.resend")}
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            {t("auth.verifyEmail.prompt.dismiss")}
          </Button>
        </div>
      </div>
      {(state === "sent" || state === "error" || state === "unauthenticated") && (
        <p
          className={`mx-auto max-w-3xl px-4 pb-3 text-sm ${
            state === "sent" ? "text-foreground" : "text-destructive"
          }`}
          role="status"
        >
          {state === "sent"
            ? t("auth.verifyEmail.prompt.sent")
            : t("auth.verifyEmail.prompt.error")}
        </p>
      )}
    </div>
  );
}

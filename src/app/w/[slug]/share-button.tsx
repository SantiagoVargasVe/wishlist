"use client";

import { Button } from "@/app/_ui/button";
import { Toast } from "@/app/_ui/toast";
import { t } from "@/lib/i18n";

/**
 * Native share sheet first (most visitors arrive from a phone), clipboard
 * as the fallback for desktop browsers without `navigator.share`. A success
 * toast is deliberate here — unlike a claim toggle, copying to the
 * clipboard has no visible state change of its own to serve as feedback.
 */
export function ShareButton({ slug, title }: { slug: string; title: string }) {
  const toastManager = Toast.useToastManager();

  const handleShare = async () => {
    const url = `${window.location.origin}/w/${slug}`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch (error) {
        // The user closing the native share sheet without picking an app is
        // a normal outcome, not a failure.
        if (error instanceof Error && error.name === "AbortError") return;
        toastManager.add({ type: "error", title: t("wishlist.shareErrors.generic") });
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      toastManager.add({ title: t("wishlist.shareCopied") });
    } catch {
      toastManager.add({ type: "error", title: t("wishlist.shareErrors.generic") });
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleShare}>
      {t("wishlist.share")}
    </Button>
  );
}

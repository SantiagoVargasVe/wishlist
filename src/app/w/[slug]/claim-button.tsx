"use client";

import { useEffect, useState } from "react";

import { Toast } from "@/app/_ui/toast";
import { Button } from "@/app/_ui/button";
import { useClaimMutation, useUnclaimMutation } from "@/lib/api/queries";
import { isApiError } from "@/lib/api/errors";
import { getClaimToken, removeClaimToken, setClaimToken } from "@/lib/claim-tokens";
import { t } from "@/lib/i18n";
import type { PublicVisitorItem } from "@/server/services/public-wishlist";

/**
 * The claim/undo control is the one thing a visitor taps on a phone, so it
 * gets a real ≥44px touch target (design-system.md § Responsive) with
 * vertical breathing room instead of `size="sm"`'s tight `h-9`. See T096.
 */
const CLAIM_BUTTON_CLASS = "h-auto min-h-11 py-2.5";

/**
 * Decides its own visibility from server truth (`item.claimed`) plus local
 * truth (do *we* hold the token): unclaimed → claim button; claimed and ours
 * → undo button; claimed and not ours → nothing, just the badge above.
 *
 * Starts assuming no token — correct before mount, corrected in an effect —
 * same one-frame-guess pattern `theme-toggle.tsx` uses for its own
 * localStorage read.
 */
export function ClaimButton({ slug, item }: { slug: string; item: PublicVisitorItem }) {
  const [token, setToken] = useState<string | null>(null);
  const toastManager = Toast.useToastManager();
  const claim = useClaimMutation(slug);
  const unclaim = useUnclaimMutation(slug);

  useEffect(() => {
    setToken(getClaimToken(item.id));
  }, [item.id]);

  if (item.claimed && !token) return null;

  if (item.claimed && token) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className={CLAIM_BUTTON_CLASS}
        disabled={unclaim.isPending}
        onClick={() => {
          unclaim.mutate(
            { itemId: item.id, claimToken: token },
            {
              onSuccess: () => {
                removeClaimToken(item.id);
                setToken(null);
              },
              onError: () => {
                toastManager.add({
                  type: "error",
                  title: t("wishlist.undoErrors.generic"),
                });
              },
            },
          );
        }}
      >
        {t("wishlist.undo")}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      className={CLAIM_BUTTON_CLASS}
      disabled={claim.isPending}
      onClick={() => {
        claim.mutate(item.id, {
          onSuccess: ({ claimToken }) => {
            setClaimToken(item.id, claimToken);
            setToken(claimToken);
          },
          onError: (error) => {
            toastManager.add({
              type: "error",
              title: isApiError(error, "ITEM_ALREADY_CLAIMED")
                ? t("wishlist.claimErrors.alreadyClaimed")
                : t("wishlist.claimErrors.generic"),
            });
          },
        });
      }}
    >
      {t("wishlist.markBought")}
    </Button>
  );
}

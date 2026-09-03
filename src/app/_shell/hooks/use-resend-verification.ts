"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";

/**
 * Ask for a fresh verification email.
 *
 * Shared by the shell prompt and the `/verify-email/[token]` failure state —
 * both need the same four outcomes and the same "don't fire twice" behaviour,
 * and design-system.md says to extract on the second use.
 *
 * `unauthenticated` is a distinct state, not an error: the endpoint requires a
 * session, and someone opening an expired link on a device they aren't logged
 * in on needs a way onward rather than "algo salió mal".
 */
export type ResendState = "idle" | "sending" | "sent" | "error" | "unauthenticated";

export function useResendVerification() {
  const [state, setState] = useState<ResendState>("idle");

  const resend = async () => {
    // Guards both re-entry while a request is in flight and a second press
    // after success — a resend invalidates the previous token (T108), so
    // firing twice would quietly kill the link the first one just mailed.
    if (state === "sending" || state === "sent") return;

    setState("sending");
    try {
      await apiFetch("/api/auth/resend-verification", { method: "POST" });
      setState("sent");
    } catch (error) {
      setState(isApiError(error, "UNAUTHORIZED") ? "unauthenticated" : "error");
    }
  };

  return { state, resend, busy: state === "sending" || state === "sent" };
}

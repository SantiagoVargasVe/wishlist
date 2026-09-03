import { t } from "@/lib/i18n";

import { escapeHtml, type MailBody } from "./html";

/**
 * The email verification message (ADR-0013).
 *
 * Spanish-first via i18n keys, plain-text **and** HTML — some clients show one,
 * some the other, and a text-only mail reads as spam to several providers.
 *
 * **No third-party anything.** No remote stylesheet, no tracking pixel, no
 * hosted image, no link that isn't this deployment's own. The URL in here is a
 * live credential, and every external request a mail client makes is one more
 * party that learns it exists.
 */

export function verifyEmailMessage(
  displayName: string,
  url: string,
  expiryHours: number,
): MailBody {
  const greeting = t("mail.verifyEmail.greeting", { name: displayName });
  const body = t("mail.verifyEmail.body");
  const expiry = t("mail.verifyEmail.expiry", { hours: expiryHours });
  const ignore = t("mail.verifyEmail.ignore");
  const fallback = t("mail.verifyEmail.linkFallback");

  const text = [greeting, "", body, "", url, "", expiry, "", ignore].join("\n");

  const html = [
    `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">`,
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(body)}</p>`,
    `<p><a href="${escapeHtml(url)}" style="color:#1a1a1a">${escapeHtml(t("mail.verifyEmail.cta"))}</a></p>`,
    `<p style="font-size:14px;color:#555">${escapeHtml(fallback)}<br>${escapeHtml(url)}</p>`,
    `<p style="font-size:14px;color:#555">${escapeHtml(expiry)}</p>`,
    `<p style="font-size:14px;color:#555">${escapeHtml(ignore)}</p>`,
    `</div>`,
  ].join("");

  return { subject: t("mail.verifyEmail.subject"), text, html };
}

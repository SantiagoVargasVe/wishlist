import { t } from "@/lib/i18n";

import { escapeHtml, type MailBody } from "./html";

/**
 * The password reset message (ADR-0012).
 *
 * Spanish-first via i18n keys, plain-text **and** HTML.
 *
 * It carries the reset URL and nothing else about the account: no password, no
 * display name beyond the greeting, no list of what the account contains. Mail
 * is unencrypted in transit at several hops and sits in a mailbox indefinitely,
 * so it should be worth as little as possible to whoever ends up reading it.
 *
 * **No third-party anything** — no remote stylesheet, no tracking pixel, no
 * hosted image, no link that isn't this deployment's own. The URL is a live
 * credential, and every external request a mail client makes is one more party
 * that learns it exists.
 */
export function passwordResetMessage(url: string, expiryMinutes: number): MailBody {
  const body = t("mail.passwordReset.body");
  const expiry = t("mail.passwordReset.expiry", { minutes: expiryMinutes });
  const ignore = t("mail.passwordReset.ignore");
  const fallback = t("mail.passwordReset.linkFallback");

  const text = [body, "", url, "", expiry, "", ignore].join("\n");

  const html = [
    `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">`,
    `<p>${escapeHtml(body)}</p>`,
    `<p><a href="${escapeHtml(url)}" style="color:#1a1a1a">${escapeHtml(t("mail.passwordReset.cta"))}</a></p>`,
    `<p style="font-size:14px;color:#555">${escapeHtml(fallback)}<br>${escapeHtml(url)}</p>`,
    `<p style="font-size:14px;color:#555">${escapeHtml(expiry)}</p>`,
    `<p style="font-size:14px;color:#555">${escapeHtml(ignore)}</p>`,
    `</div>`,
  ].join("");

  return { subject: t("mail.passwordReset.subject"), text, html };
}

/**
 * The little that the two mail templates share.
 *
 * Deliberately not a layout or a component system. Two messages do not justify
 * one, and an HTML email framework is exactly the kind of dependency ADR-0011
 * avoided by choosing SMTP over a vendor SDK.
 */

export type MailBody = { subject: string; text: string; html: string };

/**
 * Escape for interpolation into the HTML part. `displayName` is user-supplied,
 * and the URL contains base64url characters that are harmless but cheap to
 * treat the same way.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

import "server-only";

import { createTransport, type Transporter } from "nodemailer";

import { getConfig } from "../config";

/**
 * Outbound email (ADR-0011).
 *
 * One send function over SMTP. The provider is entirely a matter of the five
 * `MAIL_*` settings — Resend, Brevo, Mailgun, SES, Postmark and a plain company
 * mail server are all reachable with the same ones, which is the whole reason
 * this is SMTP rather than a vendor SDK. **Nothing here knows Resend exists.**
 *
 * The property everything else depends on: email is **optional**. Unset config
 * means the app boots fine with email disabled, so every caller has to degrade
 * rather than break. An operator running no mail vendor is a supported
 * configuration — `scripts/reset-link.ts` (T106) is their recovery path.
 *
 * Nothing in `src/app/` imports this. It's a server-side concern behind a
 * service, like the database.
 */

/**
 * Thrown when `sendMail` is called with no transport configured.
 *
 * A distinct type rather than a bare `Error` because callers branch on it:
 * `/api/auth/forgot-password` logs and still returns its 202, while an
 * operator script would rather fail loudly. What it must never do is resolve
 * successfully having sent nothing — a silent no-op is how a broken
 * configuration goes unnoticed until someone actually needs a reset link.
 */
export class MailNotConfiguredError extends Error {
  constructor() {
    super("Outbound email is not configured (MAIL_SMTP_* / MAIL_FROM are unset)");
    this.name = "MailNotConfiguredError";
  }
}

/**
 * A hanging SMTP connection must not pin a request. Mail is sent inline at
 * this volume (ADR-0011: a queue would be ceremony), so the timeout is what
 * bounds the blast radius of a provider having a bad day.
 */
const SMTP_TIMEOUT_MS = 10_000;

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Whether a transport is configured. The config schema enforces all-or-nothing,
 * so one key answers for all five.
 */
export function isMailConfigured(): boolean {
  return getConfig().MAIL_SMTP_HOST !== undefined;
}

function getTransporter(): Transporter {
  const config = getConfig();
  if (!config.MAIL_SMTP_HOST) throw new MailNotConfiguredError();

  // Built per send, not cached. Without `pool: true` a transport opens no
  // connection until `sendMail`, so a cache would save an object allocation
  // and cost a stale-config bug.
  return createTransport({
    host: config.MAIL_SMTP_HOST,
    port: config.MAIL_SMTP_PORT,
    // 465 is implicit TLS; 587 and 25 start plaintext and STARTTLS up. Deriving
    // it from the port rather than adding a sixth setting nobody would get
    // right — every provider's documented port already implies the answer.
    secure: config.MAIL_SMTP_PORT === 465,
    auth: { user: config.MAIL_SMTP_USER, pass: config.MAIL_SMTP_PASS },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
}

/** The part of an address that is safe to log. See the logging rule in security.md. */
function recipientDomain(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1) || "unknown";
}

/**
 * Send one message.
 *
 * Throws `MailNotConfiguredError` when there is no transport, and rethrows
 * whatever the transport failed with otherwise. It never resolves having sent
 * nothing.
 *
 * Failures are logged with the recipient's **domain** only — never the full
 * address, never the subject, never the body. A reset mail's subject and body
 * are the two places a token would leak into a log file, and an address in a
 * log is the account enumeration this flow works hard to avoid elsewhere.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const transport = getTransporter();

  try {
    await transport.sendMail({
      from: getConfig().MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
  } catch (error) {
    console.error(
      `Mail send failed for a recipient at ${recipientDomain(message.to)}:`,
      error instanceof Error ? error.message : error,
    );
    throw error;
  }
}

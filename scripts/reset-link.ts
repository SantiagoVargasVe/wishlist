import "dotenv/config";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseConfig } from "../src/server/config.schema";
import * as schema from "../src/server/db/schema";
import { users } from "../src/server/db/schema";
import {
  RESET_TOKEN_TTL_MS,
  mintResetToken,
} from "../src/server/services/password-reset";

/**
 * Mint a password reset link without sending any email.
 *
 *   npm run reset-link -- ana@example.com
 *
 * This is what keeps ADR-0011's "email is optional" true for the one feature
 * that would otherwise force a mail vendor. Two audiences: an operator who
 * deliberately runs no SMTP provider, and any operator whose provider is
 * failing at the moment someone needs to get in. The alternative it replaces is
 * hand-editing an Argon2 hash into Postgres, which is worse in every respect.
 *
 * It uses `mintResetToken` unchanged — same expiry, same single-use claim, same
 * table as `POST /api/auth/forgot-password`. A second token path here would be
 * a second chance to get the most security-sensitive code in the app wrong.
 *
 * It deliberately does **not** check whether the address is verified
 * (ADR-0013): an operator minting a link has established identity out of band,
 * which is a stronger signal than an email round-trip, and this is the escape
 * hatch that keeps an unverified user recoverable.
 *
 * Unlike the public endpoint, an unknown address is reported plainly. That
 * endpoint is deliberately vague to avoid telling an attacker which addresses
 * are registered; here the person running it already has a shell on the box and
 * can read the `users` table directly, so being coy would only waste their
 * time.
 *
 * Builds its own connection, the same as `seed-invite.ts`. The
 * `--conditions=react-server` in the npm script is what lets it import a
 * `server-only` module at all — outside Next that marker package throws on
 * import.
 */
async function main() {
  const email = process.argv[2]?.trim();

  if (!email) {
    console.error("\n  Usage:  npm run reset-link -- <email>\n");
    process.exit(1);
  }

  // No MAIL_* configuration is required, or read. This script sends nothing.
  const config = parseConfig(process.env);
  const sql = postgres(config.DATABASE_URL, { max: 1 });

  try {
    const db = drizzle(sql, { schema });

    // `users.email` is citext, so this matches however the address was typed.
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Thrown rather than `process.exit`ed so the `finally` below still closes
    // the connection. `main`'s catch prints it and exits non-zero.
    if (!user) throw new Error(`No account is registered with ${email}`);

    const { token, expiresAt } = await mintResetToken(user.id, db);
    const minutes = Math.round(RESET_TOKEN_TTL_MS / 60_000);

    console.log(`\n  Reset link for ${user.email}:\n`);
    console.log(`    ${config.APP_URL}/reset-password/${token}\n`);
    console.log(`  Valid until ${expiresAt.toISOString()} — ${minutes} minutes from now.`);
    console.log("  Single use: opening it and setting a password spends it, and doing so");
    console.log("  also invalidates this account's other outstanding links and logs out");
    console.log("  every existing session.\n");
    console.log("  This link IS a credential. Anyone holding it can take the account, so");
    console.log("  send it over something you trust and don't paste it into a shared");
    console.log("  channel, a ticket, or anywhere it will be logged.\n");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

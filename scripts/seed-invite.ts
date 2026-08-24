import "dotenv/config";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseConfig } from "../src/server/config.schema";
import { inviteCodes } from "../src/server/db/schema";
import { generateInviteCode } from "../src/lib/invite-code";

/**
 * Mint a registration code.
 *
 *   npm run seed:invite
 *
 * Builds its own connection rather than importing `src/server/db` — that module
 * is marked `server-only` and would throw outside Next. Same reason
 * drizzle.config.ts imports config.schema.ts instead of config.ts.
 */
async function main() {
  const { DATABASE_URL } = parseConfig(process.env);
  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    const code = generateInviteCode();
    await drizzle(sql).insert(inviteCodes).values({ code });

    console.log(`\n  Invite code:  ${code}\n`);
    console.log("  Single use. Hand it to whoever is registering.\n");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

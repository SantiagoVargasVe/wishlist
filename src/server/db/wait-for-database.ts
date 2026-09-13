import "server-only";
import postgres from "postgres";

const ATTEMPTS = 12;
const PROBE_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 5_000;
const TRANSIENT_CODES = new Set([
  "57P03", "53300", "08000", "08001", "08003", "08006",
  "ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
  "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED",
]);

async function probe(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1, connect_timeout: 5 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Bound the whole query, including DNS and a server that accepts TCP but
    // never answers. A connection timeout alone does not bound SELECT.
    await Promise.race([
      sql`SELECT 1`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(
          new Error("Database readiness probe timed out"), { code: "CONNECT_TIMEOUT" },
        )), PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    // A timed-out query must not keep a socket/pool alive between attempts.
    await sql.end({ timeout: 0 });
  }
}

/** Readiness only: never retry a migration or change database contents here. */
export async function waitForDatabase(connectionString: string): Promise<void> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await probe(connectionString);
      return;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code) : "";
      // Wrong credentials, a missing database, or a SQL error need attention.
      if (!TRANSIENT_CODES.has(code) || attempt === ATTEMPTS) throw error;
      console.warn(`[startup] Database unavailable (${code}); retrying (${attempt}/${ATTEMPTS}).`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

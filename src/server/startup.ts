import "server-only";

/** Next can retain a rejected instrumentation hook and keep serving HTTP 500.
 * Exit explicitly so the container's restart policy can retry a fresh boot.
 */
export async function runStartup(initialize: () => Promise<void>): Promise<void> {
  try {
    await initialize();
  } catch (error) {
    // Driver errors may contain connection strings, query parameters, or user
    // data. Log only a code (also unwrap Drizzle's cause), never the raw error.
    let cause: unknown = error;
    let code = "UNKNOWN";
    // Config validators format issues as FIELD: explanation. Preserve the
    // field names for operators without printing any environment values.
    if (error instanceof Error && error.message.startsWith("Invalid environment configuration:")) {
      const fields = [...error.message.matchAll(/^\s*-?\s*([A-Z][A-Z0-9_]*):/gm)]
        .map((match) => match[1]);
      code = "INVALID_CONFIGURATION";
      console.error(`[startup] Invalid configuration fields: ${[...new Set(fields)].join(", ")}.`);
    }
    for (let depth = 0; depth < 5 && cause && typeof cause === "object"; depth++) {
      if ("code" in cause && typeof cause.code === "string" && /^[A-Z0-9_]{3,32}$/.test(cause.code)) {
        code = cause.code;
        break;
      }
      cause = "cause" in cause ? cause.cause : undefined;
    }
    console.error(`[startup] Initialization failed (${code}); check configuration, database availability and migrations. Exiting for container restart.`);
    process.exit(1);
  }
}

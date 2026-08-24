import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { parseConfig } from "./src/server/config.schema";

// drizzle-kit runs outside Next, so it imports the *schema* module rather than
// src/server/config.ts — that one is marked `server-only` and would blow up here.
// This is why T002 split validation from the eager parse.
const { DATABASE_URL } = parseConfig(process.env);

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: DATABASE_URL },
  strict: true,
  verbose: true,
});

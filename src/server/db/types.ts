import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "./schema";

/**
 * The database handle, as a type only.
 *
 * Separate from `db/index.ts` so services can accept a `Db` without importing
 * that module, which is `server-only` and would throw under Vitest. Services
 * take the handle as a parameter — explicit, and testable against a real test
 * database rather than a mock.
 */
export type Db = PostgresJsDatabase<typeof schema>;

/** A transaction handle. Same surface as `Db` for our purposes. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

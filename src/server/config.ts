import "server-only";

import { parseConfig } from "./config.schema";

/**
 * The application's validated environment, parsed once at import.
 *
 * `server-only` makes importing this from a client component a build error
 * rather than a silent leak of AUTH_SECRET into the browser bundle.
 *
 * Never read `process.env` anywhere else — a missing variable should fail loudly
 * at boot, not surface as `undefined` three layers deep.
 */
export const config = parseConfig(process.env);

export type { Config } from "./config.schema";

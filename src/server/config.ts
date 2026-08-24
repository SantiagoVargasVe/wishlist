import "server-only";

import { createConfigAccessor, type Config } from "./config.schema";

/**
 * The application's validated environment.
 *
 * `server-only` makes importing this from a client component a build error
 * rather than a silent leak of AUTH_SECRET into the browser bundle.
 *
 * Validation is **lazy** — see `createConfigAccessor`. Importing this module
 * costs nothing, so `next build` can evaluate the module graph without real
 * secrets. `src/instrumentation.ts` forces validation at server startup, so a
 * bad environment still fails at boot with every problem listed.
 *
 * Never read `process.env` anywhere else.
 */
export const getConfig = createConfigAccessor(() => process.env);

/**
 * Property-access sugar over `getConfig()` — `config.DATABASE_URL` rather than
 * `getConfig().DATABASE_URL`. Reads resolve through the same memoized accessor.
 */
export const config = new Proxy({} as Config, {
  get: (_target, prop) => getConfig()[prop as keyof Config],
  has: (_target, prop) => prop in getConfig(),
  ownKeys: () => Reflect.ownKeys(getConfig()),
  getOwnPropertyDescriptor: (_target, prop) =>
    Reflect.getOwnPropertyDescriptor(getConfig(), prop),
});

export type { Config } from "./config.schema";

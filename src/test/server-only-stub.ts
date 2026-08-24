/**
 * Test stub for the `server-only` package.
 *
 * That package throws on import unless a bundler activates its `react-server`
 * condition — which is how it stops server code leaking into client bundles.
 * Under Vitest no bundler does that, so every service importing it would be
 * untestable. Vitest aliases the package to this file (see vitest.config.ts).
 *
 * The production guard is unaffected: `next build` still fails if a client
 * component imports a `server-only` module.
 */
export {};

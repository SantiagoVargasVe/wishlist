/**
 * Next runs `register()` once when the server starts.
 *
 * This is where environment validation belongs. Config itself is lazy so that
 * `next build` can evaluate modules without real secrets — but a running server
 * with a broken environment should die immediately and loudly, not serve
 * requests until something happens to read the missing variable.
 */
export async function register() {
  // Edge runtime has no process.env to validate, and the DB client is Node-only.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getConfig } = await import("./server/config");
  getConfig();
}

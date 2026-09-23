/**
 * Version of the stored images as a whole. `/media/:filename` is served
 * `immutable` for a year under a stable `{itemId}.webp` name, so rewriting
 * files in place is invisible to every browser — and to Next's image
 * optimizer — that has already fetched them. Changing the URL is the only way
 * to reach them.
 *
 * **Bump this whenever stored images are rewritten in place.** v1 is T114's
 * packshot backfill (src/server/og/packshot-backfill.ts).
 */
const MEDIA_VERSION = 1;

/** Root-relative URL of a stored item image — the only way to build one. */
export function mediaUrl(imagePath: string): string {
  return `/media/${imagePath}?v=${MEDIA_VERSION}`;
}

/**
 * Version of the stored images as a whole. `/media/:filename` is served
 * `immutable` for a year under a stable `{itemId}.webp` name, so rewriting
 * files in place is invisible to every browser — and to Next's image
 * optimizer — that has already fetched them. Changing the URL is the only way
 * to reach them.
 *
 * **Bump this whenever stored images are rewritten in place** by anything
 * other than `recordResult()` in src/server/og/image.ts — that one moves the
 * item's own version instead (below). v1 is T114's packshot backfill
 * (src/server/og/packshot-backfill.ts).
 */
const MEDIA_VERSION = 1;

/**
 * One item's image version: `items.og_fetched_at`, which `recordResult()`
 * sets on every upload and download (T115). A `Date` from the server; an ISO
 * string once it has crossed `Response.json()` — the visitor grid refetches
 * `/api/w/:slug` after every claim. Both must build the same URL, or every
 * claim would reload every image on the page.
 *
 * `null` for an item whose image hasn't been written since the column was
 * last cleared (before T115, a URL edit cleared it). Its URL then carries the
 * global version alone.
 */
export type ImageVersion = Date | string | null;

/**
 * Root-relative URL of a stored item image — the only way to build one.
 *
 * Two versions, because a stored file gets rewritten in place two ways: all
 * at once by a backfill (`MEDIA_VERSION`), or one item at a time when its
 * owner replaces the picture (`version`). Either changing changes the URL.
 * `version` is required so a new caller can't forget it and still typecheck.
 */
export function mediaUrl(imagePath: string, version: ImageVersion): string {
  const url = `/media/${imagePath}?v=${MEDIA_VERSION}`;
  return version === null ? url : `${url}&t=${new Date(version).getTime()}`;
}

import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";
import sharp from "sharp";

import { config } from "../config";
import { getDb } from "../db";
import { items } from "../db/schema";
import type { Db } from "../db/types";
import { safeFetch } from "../net/safe-fetch";

/** Exactly `{uuid}.webp` — items.id's own shape — checked before any filesystem access. */
const FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function isValidImageFilename(filename: string): boolean {
  return FILENAME_PATTERN.test(filename);
}

/**
 * Raster formats only, and an explicit list rather than "whatever sharp will
 * decode." **SVG is deliberately absent**: it is a document format, not a
 * bitmap — sharp renders it through librsvg, which parses XML and honours
 * external references, so an `<image xlink:href="http://…">` inside a
 * "picture" becomes another outbound fetch that never passed `safeFetch`.
 * A `Content-Type` check can't catch it either, since `image/svg+xml` matches
 * the `image/` prefix. This list is the check.
 */
const ALLOWED_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "gif", "avif", "heif", "tiff"]);

export class ImageRejectedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ImageRejectedError";
  }
}

/**
 * The one place bytes become a stored image, whether they arrived from a
 * retailer's CDN or straight off the user's device.
 *
 * `limitInputPixels` is the guard that matters and the one a byte cap can't
 * replace: a 12000x12000 single-colour PNG is ~436KB on the wire — comfortably
 * inside `OG_MAX_IMAGE_BYTES` — and decodes to roughly 430MB of bitmap.
 * sharp's own default only trips around 268 megapixels, which is far too
 * generous for a small self-hosted box. Measured, not assumed.
 *
 * `metadata()` decodes only the header, so the format check happens before
 * committing to a full decode.
 */
async function processImage(input: Buffer): Promise<Buffer> {
  const pipeline = sharp(input, { limitInputPixels: config.IMAGE_MAX_PIXELS });

  let format: string | undefined;
  try {
    ({ format } = await pipeline.metadata());
  } catch {
    // Not a decodable image at all. Deliberately generic: the caller never
    // learns which parser failed or why.
    throw new ImageRejectedError("unreadable image");
  }

  // Never trust a declared Content-Type or a file extension — this is what the
  // bytes actually decode as.
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new ImageRejectedError(`unsupported image format: ${format ?? "unknown"}`);
  }

  // No `.withMetadata()` call — sharp strips EXIF/ICC/etc. by default, which
  // is exactly what we want for a photo pulled from an arbitrary retailer, and
  // doubly so for one off a phone, where EXIF carries GPS coordinates.
  return pipeline
    .resize({ width: config.IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: config.IMAGE_WEBP_QUALITY })
    .toBuffer();
}

async function fetchAndProcess(sourceUrl: string): Promise<Buffer> {
  const { body } = await safeFetch(sourceUrl, {
    allowedContentTypePrefixes: ["image/"],
    maxBytes: config.OG_MAX_IMAGE_BYTES,
    timeoutMs: config.OG_FETCH_TIMEOUT_MS,
    userAgent: config.OG_USER_AGENT,
  });

  return processImage(body);
}

/** Temp file + rename: a concurrent `GET /media/:filename` never reads a half-written image. */
async function writeAtomic(filename: string, data: Buffer): Promise<void> {
  await mkdir(config.IMAGE_STORAGE_PATH, { recursive: true });

  const finalPath = path.join(config.IMAGE_STORAGE_PATH, filename);
  const tempPath = path.join(config.IMAGE_STORAGE_PATH, `.${randomUUID()}.tmp`);

  await writeFile(tempPath, data);
  await rename(tempPath, finalPath);
}

async function recordResult(
  itemId: string,
  db: Db,
  patch: { imagePath: string | null; ogStatus: "ok" | "failed" },
): Promise<void> {
  await db
    .update(items)
    .set({ ...patch, ogFetchedAt: new Date(), updatedAt: new Date() })
    .where(eq(items.id, itemId));
}

/**
 * Fetches `sourceUrl` (already known to be an image, per the OG scrape that
 * supplied it), resizes/re-encodes it, and stores it — see ADR-0004 for why
 * this downloads a copy instead of hotlinking.
 *
 * Never throws. Called unawaited right after item creation (root CLAUDE.md
 * non-negotiable #2: this is a prefill nicety, never a gate), so a slow or
 * blocking retailer CDN can't delay the save — and a failure here is a
 * normal outcome that just leaves `image_path` null for the UI's existing
 * placeholder, not something the caller needs to react to.
 */
export async function downloadItemImage(
  itemId: string,
  sourceUrl: string,
  db: Db = getDb(),
): Promise<void> {
  try {
    const webp = await fetchAndProcess(sourceUrl);
    const filename = `${itemId}.webp`;
    await writeAtomic(filename, webp);
    await recordResult(itemId, db, { imagePath: filename, ogStatus: "ok" });
  } catch (error) {
    console.error(`downloadItemImage failed for item ${itemId}:`, error);
    try {
      await recordResult(itemId, db, { imagePath: null, ogStatus: "failed" });
    } catch (dbError) {
      console.error(`downloadItemImage: failed to record failure for item ${itemId}:`, dbError);
    }
  }
}

/**
 * Stores bytes the user supplied directly — a picked file, a dragged file, or
 * an image pasted from the clipboard, which all arrive here as the same blob.
 *
 * Unlike `downloadItemImage` this **throws on rejection, deliberately**. That
 * function is a background nicety whose failure the user never asked about, so
 * it swallows everything; this one is a deliberate action taken in front of a
 * user who is waiting to see their picture appear, and silently storing
 * nothing would be indistinguishable from success. Non-negotiable #2 still
 * holds — the item is already saved by the time this runs, so a rejection
 * costs the picture, never the item.
 */
export async function storeUploadedItemImage(
  itemId: string,
  input: Buffer,
  db: Db = getDb(),
): Promise<void> {
  const webp = await processImage(input);
  const filename = `${itemId}.webp`;
  await writeAtomic(filename, webp);
  await recordResult(itemId, db, { imagePath: filename, ogStatus: "ok" });
}

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

async function fetchAndProcess(sourceUrl: string): Promise<Buffer> {
  const { body } = await safeFetch(sourceUrl, {
    allowedContentTypePrefixes: ["image/"],
    maxBytes: config.OG_MAX_IMAGE_BYTES,
    timeoutMs: config.OG_FETCH_TIMEOUT_MS,
    userAgent: config.OG_USER_AGENT,
  });

  // No `.withMetadata()` call — sharp strips EXIF/ICC/etc. by default, which
  // is exactly what we want for a photo pulled from an arbitrary retailer.
  return sharp(body)
    .resize({ width: config.IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: config.IMAGE_WEBP_QUALITY })
    .toBuffer();
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

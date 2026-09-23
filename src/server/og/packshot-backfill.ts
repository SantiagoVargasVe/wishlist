import "server-only";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config";
import { encodeStoredImage, isValidImageFilename, writeAtomic } from "./image";
import { framePackshot } from "./packshot";

/**
 * Present once every image stored before T114 has been through
 * `framePackshot`. Not `.webp`, so the orphan sweep never considers it.
 *
 * Rewriting stored images in place is only visible to clients because
 * `mediaUrl()` (src/lib/media.ts) carries a version, and `/media` is served
 * `immutable`. A future pass like this one needs a new marker **and** a
 * `MEDIA_VERSION` bump.
 */
const MARKER_FILENAME = ".packshots-v1";

async function isMarked(): Promise<boolean> {
  try {
    await readFile(path.join(config.IMAGE_STORAGE_PATH, MARKER_FILENAME));
    return true;
  } catch {
    return false;
  }
}

/**
 * Frames every stored packshot on white in place, once. Photos are left
 * byte-for-byte alone: `framePackshot` returns `null` for them, and for tiles
 * that are already framed, so nothing is ever re-encoded twice.
 *
 * **Never throws.** It runs inside startup, where a throw exits the process
 * (startup.ts). One file failing is logged and that file stays as it was. The
 * marker is written only after the pass completes, so a pass cut short, or a
 * directory that refused the marker, just runs again next boot.
 */
export async function backfillPackshots(): Promise<{ framed: string[] }> {
  const framed: string[] = [];
  try {
    if (await isMarked()) return { framed };

    let entries: string[];
    try {
      entries = await readdir(config.IMAGE_STORAGE_PATH);
    } catch {
      entries = []; // No image has ever been stored — nothing to do but mark it.
    }

    for (const filename of entries.filter(isValidImageFilename)) {
      try {
        const stored = await readFile(path.join(config.IMAGE_STORAGE_PATH, filename));
        const tile = await framePackshot(stored);
        if (!tile) continue;
        await writeAtomic(filename, await encodeStoredImage(tile));
        framed.push(filename);
      } catch (error) {
        console.error(`backfillPackshots: left ${filename} as it was:`, error);
      }
    }

    await mkdir(config.IMAGE_STORAGE_PATH, { recursive: true });
    await writeFile(path.join(config.IMAGE_STORAGE_PATH, MARKER_FILENAME), new Date().toISOString());
    console.log(`backfillPackshots: framed ${framed.length} stored image(s)`);
  } catch (error) {
    console.error("backfillPackshots: stopped early; it will run again next boot:", error);
  }
  return { framed };
}

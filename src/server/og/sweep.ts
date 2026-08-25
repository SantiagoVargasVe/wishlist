import "server-only";

import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, isNotNull } from "drizzle-orm";

import { config } from "../config";
import { getDb } from "../db";
import { liveItem } from "../db/helpers";
import { items } from "../db/schema";
import type { Db } from "../db/types";

const MARKER_FILENAME = ".last-sweep";
const SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes every `.webp` file in `config.IMAGE_STORAGE_PATH` that no live
 * item's `image_path` points at — see ADR-0004 and T034's task file. Only
 * `.webp` files are ever candidates, so the marker file this module writes
 * alongside them is never at risk.
 *
 * One file's `unlink` failing is logged and skipped, not fatal to the rest —
 * a locked or already-gone file shouldn't stop the sweep from cleaning up
 * everything else it found.
 */
export async function sweepOrphanImages(db: Db = getDb()): Promise<{ removed: string[] }> {
  // Nothing to sweep before the first image is ever downloaded — writeAtomic
  // (image.ts) is what actually creates this directory.
  let dirEntries: string[];
  try {
    dirEntries = await readdir(config.IMAGE_STORAGE_PATH);
  } catch {
    return { removed: [] };
  }

  const webpFiles = dirEntries.filter((name) => name.endsWith(".webp"));
  if (webpFiles.length === 0) return { removed: [] };

  const referenced = await db
    .select({ imagePath: items.imagePath })
    .from(items)
    .where(and(liveItem, isNotNull(items.imagePath)));

  const keep = new Set(referenced.map((row) => row.imagePath));

  const orphans = webpFiles.filter((filename) => !keep.has(filename));
  const removed: string[] = [];

  for (const filename of orphans) {
    try {
      await unlink(path.join(config.IMAGE_STORAGE_PATH, filename));
      removed.push(filename);
    } catch (error) {
      console.error(`sweepOrphanImages: failed to remove ${filename}:`, error);
    }
  }

  return { removed };
}

async function markerAge(): Promise<number | null> {
  try {
    const stats = await stat(path.join(config.IMAGE_STORAGE_PATH, MARKER_FILENAME));
    return Date.now() - stats.mtimeMs;
  } catch {
    return null;
  }
}

async function touchMarker(): Promise<void> {
  // The sweep itself may have found nothing and never created the directory
  // (e.g. no image has ever been downloaded yet) — this is the first write
  // that's guaranteed to happen every run, so it's the one that ensures the
  // directory exists.
  await mkdir(config.IMAGE_STORAGE_PATH, { recursive: true });
  await writeFile(path.join(config.IMAGE_STORAGE_PATH, MARKER_FILENAME), new Date().toISOString());
}

/**
 * Runs the sweep if the marker is missing or older than a week, then
 * touches it — wall-clock, not process uptime, so this is correct across
 * restarts (architecture.md § Operational notes: "uptime is best-effort").
 */
export async function maybeRunSweep(db: Db = getDb()): Promise<void> {
  const age = await markerAge();
  if (age !== null && age < SWEEP_INTERVAL_MS) return;

  await sweepOrphanImages(db);
  await touchMarker();
}

/** Called once from `instrumentation.ts`. Fire-and-forget: never delays server startup. */
export function scheduleWeeklySweep(): void {
  void maybeRunSweep();
  setInterval(() => void maybeRunSweep(), CHECK_INTERVAL_MS);
}

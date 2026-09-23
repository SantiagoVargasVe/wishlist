import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { backfillPackshots } from "./packshot-backfill";

const PACKSHOT = "11111111-1111-4111-8111-111111111111.webp";
const PHOTO = "22222222-2222-4222-8222-222222222222.webp";
const CORRUPT = "33333333-3333-4333-8333-333333333333.webp";

/** `config` is a cached singleton, so one directory serves the whole file (see image.test.ts). */
let imagesDir: string;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  process.env.AUTH_SECRET = "x".repeat(48);
  process.env.APP_URL = "http://localhost:3000";
  imagesDir = await mkdtemp(path.join(tmpdir(), "wishlist-backfill-test-"));
  process.env.IMAGE_STORAGE_PATH = imagesDir;
});

afterAll(async () => {
  await rm(imagesDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(imagesDir, { recursive: true, force: true });
  await mkdir(imagesDir, { recursive: true });
});

/** Stored the way pre-T114 images were: a 1.91:1 white canvas, product in the middle. */
async function storedPackshot(): Promise<Buffer> {
  const product = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 30, b: 40 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 800, height: 419, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: product, left: 300, top: 110 }])
    .webp({ quality: 80 })
    .toBuffer();
}

async function storedPhoto(): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 1026, channels: 3, background: { r: 124, g: 130, b: 131 } },
  })
    .webp({ quality: 80 })
    .toBuffer();
}

const file = (name: string) => path.join(imagesDir, name);

describe("backfillPackshots", () => {
  it("frames a stored packshot in place and leaves a photo byte-for-byte alone", async () => {
    await writeFile(file(PACKSHOT), await storedPackshot());
    const photo = await storedPhoto();
    await writeFile(file(PHOTO), photo);

    const { framed } = await backfillPackshots();

    expect(framed).toEqual([PACKSHOT]);
    const meta = await sharp(file(PACKSHOT)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(meta.height);
    expect((await readFile(file(PHOTO))).equals(photo)).toBe(true);
    expect(existsSync(file(".packshots-v1"))).toBe(true);
  });

  it("runs once: after the marker is written, nothing is touched", async () => {
    await backfillPackshots();
    const packshot = await storedPackshot();
    await writeFile(file(PACKSHOT), packshot);

    const { framed } = await backfillPackshots();

    expect(framed).toEqual([]);
    expect((await readFile(file(PACKSHOT))).equals(packshot)).toBe(true);
  });

  it("logs and skips an unreadable file without stopping the pass or throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await writeFile(file(CORRUPT), "not an image");
    await writeFile(file(PACKSHOT), await storedPackshot());

    const { framed } = await backfillPackshots();

    expect(framed).toEqual([PACKSHOT]);
    expect(await readFile(file(CORRUPT), "utf8")).toBe("not an image");
    expect(log).toHaveBeenCalledWith(expect.stringContaining(CORRUPT), expect.anything());
    expect(existsSync(file(".packshots-v1"))).toBe(true);
    log.mockRestore();
  });

  it("only considers stored image filenames — not the sweep's marker or a stray temp file", async () => {
    await writeFile(file(".last-sweep"), "2026-09-01T00:00:00.000Z");
    await writeFile(file(".abc.tmp"), await storedPackshot());

    const { framed } = await backfillPackshots();

    expect(framed).toEqual([]);
  });

  it("copes with an images directory that doesn't exist yet", async () => {
    await rm(imagesDir, { recursive: true, force: true });

    await expect(backfillPackshots()).resolves.toEqual({ framed: [] });
    expect(existsSync(file(".packshots-v1"))).toBe(true);
  });
});

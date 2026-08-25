import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../net/safe-fetch", () => ({ safeFetch: vi.fn() }));

import { items, users } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { safeFetch } from "../net/safe-fetch";
import { downloadItemImage, isValidImageFilename, storeUploadedItemImage } from "./image";

/** A real, in-memory-generated image — exercises sharp for real, not a mock of it. */
async function fixtureImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

/**
 * One directory shared by every describe in this file, set up before any of
 * them run. `config` is a cached singleton read on first access, so a second
 * `beforeAll` setting IMAGE_STORAGE_PATH would be ignored and its files would
 * land in whichever directory won the race — which passes in isolation and
 * fails in a full run.
 */
let imagesDir: string;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  process.env.AUTH_SECRET = "x".repeat(48);
  process.env.APP_URL = "http://localhost:3000";
  imagesDir = await mkdtemp(path.join(tmpdir(), "wishlist-images-test-"));
  process.env.IMAGE_STORAGE_PATH = imagesDir;
});

afterAll(async () => {
  await rm(imagesDir, { recursive: true, force: true });
});

describe("isValidImageFilename", () => {
  it("accepts a well-formed uuid.webp filename", () => {
    expect(isValidImageFilename("11550da7-a4b9-4af9-aa6d-e5c3758b592f.webp")).toBe(true);
  });

  it("rejects a path-traversal attempt", () => {
    expect(isValidImageFilename("../../etc/passwd")).toBe(false);
  });

  it("rejects a filename with an embedded path separator", () => {
    expect(isValidImageFilename("11550da7-a4b9-4af9-aa6d-e5c3758b592f/x.webp")).toBe(false);
  });

  it("rejects the wrong extension", () => {
    expect(isValidImageFilename("11550da7-a4b9-4af9-aa6d-e5c3758b592f.png")).toBe(false);
  });

  it("rejects a malformed uuid", () => {
    expect(isValidImageFilename("not-a-uuid.webp")).toBe(false);
  });
});

describe.skipIf(!hasTestDatabase)("downloadItemImage", () => {
  let ctx: TestDb;
  let ownerId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  afterEach(async () => {
    vi.mocked(safeFetch).mockReset();
    await ctx.sql`TRUNCATE items, users RESTART IDENTITY CASCADE`;
  });

  async function insertItem(): Promise<string> {
    const [user] = await ctx.db
      .insert(users)
      .values({ email: "owner@example.com", passwordHash: "x", displayName: "Owner" })
      .returning();
    ownerId = user.id;

    const [item] = await ctx.db
      .insert(items)
      .values({ ownerId, url: "https://example.com/p", title: "Widget" })
      .returning();
    return item.id;
  }

  it("downloads, resizes to the configured max width, converts to webp, and records ok", async () => {
    const itemId = await insertItem();
    const source = await fixtureImage(1600, 1200);
    vi.mocked(safeFetch).mockResolvedValue({
      body: source,
      contentType: "image/jpeg",
      finalUrl: "https://cdn.example/w.jpg",
    });

    await downloadItemImage(itemId, "https://cdn.example/w.jpg", ctx.db);

    const filePath = path.join(imagesDir, `${itemId}.webp`);
    expect(existsSync(filePath)).toBe(true);

    const metadata = await sharp(filePath).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(800);

    const [row] = await ctx.db.select().from(items).where(eq(items.id, itemId));
    expect(row.imagePath).toBe(`${itemId}.webp`);
    expect(row.ogStatus).toBe("ok");
    expect(row.ogFetchedAt).not.toBeNull();
  });

  it("does not upscale an image narrower than the configured max width", async () => {
    const itemId = await insertItem();
    const source = await fixtureImage(200, 150);
    vi.mocked(safeFetch).mockResolvedValue({
      body: source,
      contentType: "image/jpeg",
      finalUrl: "https://cdn.example/w.jpg",
    });

    await downloadItemImage(itemId, "https://cdn.example/w.jpg", ctx.db);

    const metadata = await sharp(path.join(imagesDir, `${itemId}.webp`)).metadata();
    expect(metadata.width).toBe(200);
  });

  it("strips EXIF metadata", async () => {
    const base = await fixtureImage(400, 300);
    const withExif = await sharp(base)
      .withMetadata({ exif: { IFD0: { Copyright: "Some Retailer" } } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const itemId = await insertItem();
    vi.mocked(safeFetch).mockResolvedValue({
      body: withExif,
      contentType: "image/jpeg",
      finalUrl: "https://cdn.example/w.jpg",
    });

    await downloadItemImage(itemId, "https://cdn.example/w.jpg", ctx.db);

    const metadata = await sharp(path.join(imagesDir, `${itemId}.webp`)).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  it("leaves no stray temp file behind after a successful write", async () => {
    const itemId = await insertItem();
    const source = await fixtureImage(400, 300);
    vi.mocked(safeFetch).mockResolvedValue({
      body: source,
      contentType: "image/jpeg",
      finalUrl: "https://cdn.example/w.jpg",
    });

    await downloadItemImage(itemId, "https://cdn.example/w.jpg", ctx.db);

    // The dir is shared across this describe block's tests, so other items'
    // .webp files may already be here — the atomicity claim is specifically
    // that no .tmp file ever survives a successful write, not that this is
    // the only file present.
    const files = await readdir(imagesDir);
    expect(files).toContain(`${itemId}.webp`);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("resolves to a failed status, without throwing, when safeFetch fails", async () => {
    const itemId = await insertItem();
    vi.mocked(safeFetch).mockRejectedValue(new Error("blocked"));

    await downloadItemImage(itemId, "https://cdn.example/w.jpg", ctx.db);

    const [row] = await ctx.db.select().from(items).where(eq(items.id, itemId));
    expect(row.imagePath).toBeNull();
    expect(row.ogStatus).toBe("failed");
  });

  it("resolves to a failed status when the response body isn't a real image", async () => {
    const itemId = await insertItem();
    // A response that lies about its content-type — safeFetch's own check is
    // mocked away here, so this exercises sharp's own rejection of garbage bytes.
    vi.mocked(safeFetch).mockResolvedValue({
      body: Buffer.from("not an image"),
      contentType: "image/jpeg",
      finalUrl: "https://cdn.example/w.jpg",
    });

    await downloadItemImage(itemId, "https://cdn.example/w.jpg", ctx.db);

    const filePath = path.join(imagesDir, `${itemId}.webp`);
    expect(existsSync(filePath)).toBe(false);

    const [row] = await ctx.db.select().from(items).where(eq(items.id, itemId));
    expect(row.imagePath).toBeNull();
    expect(row.ogStatus).toBe("failed");
  });
});

/**
 * T086. These are the guards, so they run against real sharp on real bytes —
 * mocking the decoder would test the mock, not the guard.
 */
describe.skipIf(!hasTestDatabase)("storeUploadedItemImage — guards", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  afterEach(async () => {
    await ctx.sql`TRUNCATE items, users RESTART IDENTITY CASCADE`;
  });

  async function newItem(): Promise<string> {
    const [user] = await ctx.db
      .insert(users)
      .values({ email: "up@example.com", passwordHash: "x", displayName: "Up" })
      .returning();
    const [item] = await ctx.db
      .insert(items)
      .values({ ownerId: user.id, url: "https://example.com/p", title: "Widget" })
      .returning();
    return item.id;
  }

  it("stores a real uploaded image as webp and records ok", async () => {
    const itemId = await newItem();
    await storeUploadedItemImage(itemId, await fixtureImage(1600, 1200), ctx.db);

    expect(existsSync(path.join(imagesDir, `${itemId}.webp`))).toBe(true);
    const [row] = await ctx.db.select().from(items).where(eq(items.id, itemId));
    expect(row.imagePath).toBe(`${itemId}.webp`);
    expect(row.ogStatus).toBe("ok");

    const meta = await sharp(path.join(imagesDir, `${itemId}.webp`)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(800);
  });

  it("rejects a file that isn't an image at all", async () => {
    const itemId = await newItem();
    await expect(
      storeUploadedItemImage(itemId, Buffer.from("#!/bin/sh\nrm -rf /\n"), ctx.db),
    ).rejects.toThrow();

    expect(existsSync(path.join(imagesDir, `${itemId}.webp`))).toBe(false);
  });

  // sharp will happily render SVG via librsvg, and `image/svg+xml` matches the
  // `image/` Content-Type prefix — so the format allowlist is the only thing
  // standing between a "picture" and an XML document that can reference
  // external resources.
  it("rejects an SVG even though sharp can decode it", async () => {
    const itemId = await newItem();
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>`,
    );

    await expect(storeUploadedItemImage(itemId, svg, ctx.db)).rejects.toThrow();
    expect(existsSync(path.join(imagesDir, `${itemId}.webp`))).toBe(false);
  });

  it("rejects an SVG carrying an external reference", async () => {
    const itemId = await newItem();
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80" height="80">` +
        `<image xlink:href="http://169.254.169.254/latest/meta-data/" width="80" height="80"/></svg>`,
    );

    await expect(storeUploadedItemImage(itemId, svg, ctx.db)).rejects.toThrow();
  });

  // The guard a byte cap cannot replace: this fixture is small on the wire and
  // enormous decoded, which is the whole point of a decompression bomb.
  it("rejects a decompression bomb that is well under the byte limit", async () => {
    const itemId = await newItem();
    const bomb = await sharp({
      create: { width: 9000, height: 9000, channels: 3, background: { r: 1, g: 2, b: 3 } },
      limitInputPixels: false,
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    // Comfortably inside OG_MAX_IMAGE_BYTES (10MB) and IMAGE_MAX_UPLOAD_BYTES
    // (8MB) — a size check alone would wave this straight through.
    expect(bomb.length).toBeLessThan(4 * 1024 * 1024);
    // 81 megapixels, over the 40MP IMAGE_MAX_PIXELS ceiling.
    await expect(storeUploadedItemImage(itemId, bomb, ctx.db)).rejects.toThrow();
    expect(existsSync(path.join(imagesDir, `${itemId}.webp`))).toBe(false);
  });

  it("accepts a large but legitimate photo below the pixel ceiling", async () => {
    const itemId = await newItem();
    // ~12MP, a normal phone photo.
    await storeUploadedItemImage(itemId, await fixtureImage(4000, 3000), ctx.db);
    expect(existsSync(path.join(imagesDir, `${itemId}.webp`))).toBe(true);
  });

  // A phone photo carries EXIF, which routinely includes GPS coordinates — so
  // this matters more for an upload than for a retailer's CDN image.
  it("strips EXIF rather than storing what the camera recorded", async () => {
    const itemId = await newItem();
    const withExif = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .withExif({ IFD0: { Copyright: "somebody", Make: "TestPhone" } })
      .jpeg()
      .toBuffer();

    await storeUploadedItemImage(itemId, withExif, ctx.db);

    const meta = await sharp(path.join(imagesDir, `${itemId}.webp`)).metadata();
    expect(meta.exif).toBeUndefined();
  });
});

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
import { downloadItemImage, isValidImageFilename } from "./image";

/** A real, in-memory-generated image — exercises sharp for real, not a mock of it. */
async function fixtureImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

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
  let imagesDir: string;
  let ownerId: string;

  beforeAll(async () => {
    // image.ts reads config lazily, same pattern jwt.test.ts/preview.test.ts
    // use — set the required vars before the first access.
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.AUTH_SECRET = "x".repeat(48);
    process.env.APP_URL = "http://localhost:3000";
    imagesDir = await mkdtemp(path.join(tmpdir(), "wishlist-images-test-"));
    process.env.IMAGE_STORAGE_PATH = imagesDir;

    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
    await rm(imagesDir, { recursive: true, force: true });
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

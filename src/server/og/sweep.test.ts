import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { items, users } from "../db/schema";
import { createTestDb, hasTestDatabase, type TestDb } from "../db/test-support";
import { maybeRunSweep, sweepOrphanImages } from "./sweep";

describe.skipIf(!hasTestDatabase)("sweepOrphanImages", () => {
  let ctx: TestDb;
  let imagesDir: string;
  let ownerId: string;

  beforeAll(async () => {
    // sweep.ts reads config lazily, same pattern image.test.ts uses.
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.AUTH_SECRET = "x".repeat(48);
    process.env.APP_URL = "http://localhost:3000";
    imagesDir = await mkdtemp(path.join(tmpdir(), "wishlist-sweep-test-"));
    process.env.IMAGE_STORAGE_PATH = imagesDir;

    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
    await rm(imagesDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await ctx.sql`TRUNCATE items, users RESTART IDENTITY CASCADE`;
    ownerId = "";
    for (const entry of await readdir(imagesDir)) {
      await rm(path.join(imagesDir, entry), { force: true });
    }
  });

  async function seedOwner(): Promise<string> {
    const [user] = await ctx.db
      .insert(users)
      .values({ email: "owner@example.com", passwordHash: "x", displayName: "Owner" })
      .returning();
    return user.id;
  }

  async function seedItem(imagePath: string | null, deleted: boolean): Promise<void> {
    if (!ownerId) ownerId = await seedOwner();
    await ctx.db.insert(items).values({
      ownerId,
      url: "https://example.com/p",
      title: "Widget",
      imagePath,
      deletedAt: deleted ? new Date() : null,
    });
  }

  async function touchFile(filename: string): Promise<void> {
    await writeFile(path.join(imagesDir, filename), "fake webp bytes");
  }

  it("removes a file with no matching item at all", async () => {
    await touchFile("11111111-1111-4111-8111-111111111111.webp");

    const { removed } = await sweepOrphanImages(ctx.db);

    expect(removed).toEqual(["11111111-1111-4111-8111-111111111111.webp"]);
    expect(existsSync(path.join(imagesDir, "11111111-1111-4111-8111-111111111111.webp"))).toBe(
      false,
    );
  });

  it("removes a file belonging to a soft-deleted item", async () => {
    await seedItem("22222222-2222-4222-8222-222222222222.webp", true);
    await touchFile("22222222-2222-4222-8222-222222222222.webp");

    const { removed } = await sweepOrphanImages(ctx.db);

    expect(removed).toEqual(["22222222-2222-4222-8222-222222222222.webp"]);
  });

  it("keeps a file belonging to a live item", async () => {
    await seedItem("33333333-3333-4333-8333-333333333333.webp", false);
    await touchFile("33333333-3333-4333-8333-333333333333.webp");

    const { removed } = await sweepOrphanImages(ctx.db);

    expect(removed).toEqual([]);
    expect(existsSync(path.join(imagesDir, "33333333-3333-4333-8333-333333333333.webp"))).toBe(
      true,
    );
  });

  it("ignores non-webp files, including its own marker", async () => {
    await writeFile(path.join(imagesDir, ".last-sweep"), "2026-01-01");
    await writeFile(path.join(imagesDir, "notes.txt"), "hello");

    const { removed } = await sweepOrphanImages(ctx.db);

    expect(removed).toEqual([]);
    expect(existsSync(path.join(imagesDir, ".last-sweep"))).toBe(true);
    expect(existsSync(path.join(imagesDir, "notes.txt"))).toBe(true);
  });

  it("returns cleanly when the images directory doesn't exist yet", async () => {
    const missingDir = path.join(imagesDir, "does-not-exist");
    process.env.IMAGE_STORAGE_PATH = missingDir;

    const { removed } = await sweepOrphanImages(ctx.db);
    expect(removed).toEqual([]);

    process.env.IMAGE_STORAGE_PATH = imagesDir;
  });

  describe("maybeRunSweep", () => {
    const markerPath = () => path.join(imagesDir, ".last-sweep");

    it("runs and writes the marker when none exists yet", async () => {
      await touchFile("44444444-4444-4444-8444-444444444444.webp");

      await maybeRunSweep(ctx.db);

      expect(existsSync(path.join(imagesDir, "44444444-4444-4444-8444-444444444444.webp"))).toBe(
        false,
      );
      expect(existsSync(markerPath())).toBe(true);
    });

    it("skips the sweep when the marker is recent", async () => {
      await writeFile(markerPath(), "just now");
      await touchFile("55555555-5555-4555-8555-555555555555.webp");

      await maybeRunSweep(ctx.db);

      expect(existsSync(path.join(imagesDir, "55555555-5555-4555-8555-555555555555.webp"))).toBe(
        true,
      );
    });

    it("runs again when the marker is older than a week", async () => {
      await writeFile(markerPath(), "old");
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await utimes(markerPath(), eightDaysAgo, eightDaysAgo);
      await touchFile("66666666-6666-4666-8666-666666666666.webp");

      await maybeRunSweep(ctx.db);

      expect(existsSync(path.join(imagesDir, "66666666-6666-4666-8666-666666666666.webp"))).toBe(
        false,
      );
    });
  });
});

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { framePackshot } from "./packshot";

const RED = { r: 200, g: 30, b: 40 };
const WHITE = { r: 255, g: 255, b: 255 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

type Colour = { r: number; g: number; b: number; alpha?: number };

/** A `width`×`height` canvas with one solid `product` block placed on it. */
async function canvas(
  width: number,
  height: number,
  background: Colour,
  product?: { width: number; height: number; left: number; top: number },
): Promise<Buffer> {
  const base = sharp({ create: { width, height, channels: 4, background } });
  if (!product) return base.png().toBuffer();

  const block = await sharp({
    create: { width: product.width, height: product.height, channels: 3, background: RED },
  })
    .png()
    .toBuffer();
  return base.composite([{ input: block, left: product.left, top: product.top }]).png().toBuffer();
}

/** A product centred on a canvas. */
function centred(width: number, height: number, background: Colour, pw: number, ph: number) {
  return canvas(width, height, background, {
    width: pw,
    height: ph,
    left: Math.floor((width - pw) / 2),
    top: Math.floor((height - ph) / 2),
  });
}

/** Bounding box of the non-white pixels — where the product ended up. */
async function productBox(image: Buffer) {
  const { info } = await sharp(image)
    .trim({ background: WHITE, threshold: 10 })
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    left: -(info.trimOffsetLeft ?? 0),
    top: -(info.trimOffsetTop ?? 0),
  };
}

async function pixel(image: Buffer, x: number, y: number) {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

describe("framePackshot", () => {
  it("re-frames a wide Open Graph canvas as a square tile with the product filling 84% of it", async () => {
    // The dominant real-world shape: 1200x630 with a small product in the middle.
    const framed = await framePackshot(await centred(1200, 630, WHITE, 300, 300));
    expect(framed).not.toBeNull();

    const { width, height } = await sharp(framed!).metadata();
    expect(width).toBe(height);

    const box = await productBox(framed!);
    expect(box.width / width!).toBeCloseTo(0.84, 2);
    // Centred: equal margins, give or take the odd pixel.
    expect(Math.abs(box.left - (width! - box.left - box.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(box.top - (height! - box.top - box.height))).toBeLessThanOrEqual(1);
  });

  it("re-frames a tall bottle so its whole height fits, instead of being cropped", async () => {
    const framed = await framePackshot(await centred(365, 1173, WHITE, 333, 1067));
    expect(framed).not.toBeNull();

    const { width, height } = await sharp(framed!).metadata();
    expect(width).toBe(height);
    const box = await productBox(framed!);
    expect(box.height / height!).toBeCloseTo(0.84, 2);
    expect(box.width).toBe(333);
  });

  it("leaves a full-bleed photo alone", async () => {
    const photo = await canvas(800, 1026, { r: 124, g: 130, b: 131 }, {
      width: 300,
      height: 600,
      left: 250,
      top: 200,
    });
    expect(await framePackshot(photo)).toBeNull();
  });

  it("leaves alone a product that bleeds off one edge, rather than floating a cut-off object", async () => {
    // Spans the full width along the bottom: the border is only ~75% white.
    const bleeding = await canvas(800, 800, WHITE, { width: 800, height: 400, left: 0, top: 400 });
    expect(await framePackshot(bleeding)).toBeNull();
  });

  it("flattens a transparent cut-out onto white before framing it", async () => {
    const framed = await framePackshot(await centred(600, 400, TRANSPARENT, 200, 300));
    expect(framed).not.toBeNull();

    const { hasAlpha, height } = await sharp(framed!).metadata();
    expect(hasAlpha).toBe(false);
    expect(await pixel(framed!, 0, 0)).toEqual({ r: 255, g: 255, b: 255 });
    // Trimmed to the cut-out itself, not framed with its clear surround intact.
    expect((await productBox(framed!)).height / height!).toBeCloseTo(0.84, 2);
  });

  it("is idempotent — an already-framed tile comes back as null, even after a lossy WebP round trip", async () => {
    const framed = await framePackshot(await centred(1200, 630, WHITE, 300, 300));
    expect(await framePackshot(framed!)).toBeNull();

    const asStored = await sharp(framed!).webp({ quality: 80 }).toBuffer();
    expect(await framePackshot(asStored)).toBeNull();
  });

  it("returns null for a blank image — there is no product to frame", async () => {
    expect(await framePackshot(await canvas(400, 400, WHITE))).toBeNull();
  });
});

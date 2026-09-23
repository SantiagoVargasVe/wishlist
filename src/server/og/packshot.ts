import "server-only";

import sharp, { type OutputInfo } from "sharp";

/** The backdrop a packshot is framed on — and what a transparent image is flattened onto. */
export const WHITE = { r: 255, g: 255, b: 255 };

/**
 * Margin left on each side of the framed product, as a share of the tile, so
 * the product's longer side fills 84% of it — close to what the big
 * marketplaces' catalog grids settle on.
 */
const MARGIN = 0.08;
const FILL = 1 - 2 * MARGIN;

/**
 * How far a channel may sit below 255 and still count as white. Matches
 * sharp's own default `trim` threshold, so "is the border white?" and "where
 * does the white end?" agree with each other.
 */
const WHITE_TOLERANCE = 10;

/**
 * Share of the border that must be white for the image to count as a
 * packshot. Deliberately high: a product that bleeds off one edge (a shoe cut
 * at the bottom) falls short and is left alone, since framing it would float a
 * visibly cut-off object in the middle of a white square.
 */
const WHITE_BORDER_SHARE = 0.9;

/** How deep the sampled border ring is, as a share of the shorter side. */
const BORDER_DEPTH = 0.01;

/** Content smaller than this after trimming is noise, not a product. */
const MIN_CONTENT_PX = 8;

/** A tile whose content already fills `FILL` of it to within this is left alone. */
const FRAMED_TOLERANCE = 0.03;

function isWhite(data: Buffer, offset: number): boolean {
  const floor = 255 - WHITE_TOLERANCE;
  return data[offset] >= floor && data[offset + 1] >= floor && data[offset + 2] >= floor;
}

/** Share of the pixels in the outer ring of a raw RGB(A) buffer that are white. */
function whiteBorderShare(data: Buffer, { width, height, channels }: OutputInfo): number {
  const depth = Math.max(1, Math.round(Math.min(width, height) * BORDER_DEPTH));
  let white = 0;
  let total = 0;

  for (let y = 0; y < height; y++) {
    const fullRow = y < depth || y >= height - depth;
    for (let x = 0; x < width; x++) {
      // Interior rows only contribute their left and right bands.
      if (!fullRow && x === depth) x = width - depth;
      total++;
      if (isWhite(data, (y * width + x) * channels)) white++;
    }
  }

  return white / total;
}

/**
 * Re-frames a product photographed on white — the shape most stored images
 * turned out to have, whether a 1.91:1 Open Graph canvas with the product lost
 * in the middle or a 0.31:1 bottle (T114 has the survey) — as a square white
 * tile with the product centred and filling `FILL` of it.
 *
 * Returns `null`, meaning "store it as it is", for anything else: a full-bleed
 * photo, a product bleeding off an edge, a blank image, or a tile that is
 * already framed — which is what makes re-running this safe.
 *
 * The result is a lossless PNG at whatever size the framing produced; capping
 * the size and choosing the stored codec stay with the caller.
 */
export async function framePackshot(input: Buffer): Promise<Buffer | null> {
  const { data, info } = await sharp(input)
    .flatten({ background: WHITE })
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (whiteBorderShare(data, info) < WHITE_BORDER_SHARE) return null;

  let trimmed: { data: Buffer; info: OutputInfo };
  try {
    // Trim the flattened pixels, not `input`: within one pipeline sharp trims
    // *before* it flattens, so a transparent cut-out's clear pixels would read
    // as black content and nothing would be trimmed.
    const { width, height, channels } = info;
    trimmed = await sharp(data, { raw: { width, height, channels } })
      .trim({ background: WHITE, threshold: WHITE_TOLERANCE })
      .png()
      .toBuffer({ resolveWithObject: true });
  } catch {
    // Framing is a nicety: if it fails for any reason, store the image as it is.
    return null;
  }

  const { width, height } = trimmed.info;
  // Nothing trimmed means a blank image (sharp hands it back whole rather than
  // throwing) or content already touching all four edges — nothing to frame.
  const untrimmed = width === info.width && height === info.height;
  if (untrimmed || width < MIN_CONTENT_PX || height < MIN_CONTENT_PX) return null;

  const content = Math.max(width, height);
  const alreadyFramed =
    info.width === info.height && Math.abs(content / info.width - FILL) <= FRAMED_TOLERANCE;
  if (alreadyFramed) return null;

  const side = Math.ceil(content / FILL);
  const left = Math.floor((side - width) / 2);
  const top = Math.floor((side - height) / 2);

  return sharp(trimmed.data)
    .extend({
      top,
      bottom: side - height - top,
      left,
      right: side - width - left,
      background: WHITE,
    })
    .png()
    .toBuffer();
}

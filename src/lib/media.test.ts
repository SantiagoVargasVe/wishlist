import { describe, expect, it } from "vitest";

import { mediaUrl } from "./media";

const written = new Date("2026-09-23T12:00:00.123Z");

describe("mediaUrl", () => {
  it("points at the /media route with a version, so rewritten images get a fresh cache key", () => {
    expect(mediaUrl("abc.webp", null)).toMatch(/^\/media\/abc\.webp\?v=\d+$/);
  });

  // T115: the filename never changes when an owner replaces a picture, and
  // /media is `immutable` for a year — only a new URL reaches a cached copy.
  it("changes when the item's own image version changes", () => {
    const replaced = new Date(written.getTime() + 1);
    expect(mediaUrl("abc.webp", replaced)).not.toBe(mediaUrl("abc.webp", written));
  });

  it("keeps the global version alongside the item's, so a bulk rewrite still busts it", () => {
    expect(mediaUrl("abc.webp", written)).toMatch(/^\/media\/abc\.webp\?v=\d+&/);
  });

  it("gives the same URL for a Date and its JSON-serialized form", () => {
    // SSR hands the visitor grid a Date; its TanStack Query refetch after a
    // claim hands it the same value as an ISO string.
    const overTheWire = JSON.parse(JSON.stringify({ written })).written as string;
    expect(mediaUrl("abc.webp", overTheWire)).toBe(mediaUrl("abc.webp", written));
  });

  it("gives a different URL with no item version than with one", () => {
    expect(mediaUrl("abc.webp", null)).not.toBe(mediaUrl("abc.webp", written));
  });
});

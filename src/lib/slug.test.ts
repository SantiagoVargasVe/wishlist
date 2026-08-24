import { describe, expect, it } from "vitest";

import { generateSlug, SLUG_ALPHABET, SLUG_LENGTH } from "./slug";

describe("generateSlug", () => {
  it("returns a slug of the expected length", () => {
    expect(generateSlug()).toHaveLength(SLUG_LENGTH);
  });

  it("uses only characters from the alphabet", () => {
    const pattern = new RegExp(`^[${SLUG_ALPHABET}]+$`);
    for (let i = 0; i < 200; i += 1) {
      expect(generateSlug()).toMatch(pattern);
    }
  });

  it("is URL-safe and lowercase", () => {
    expect(SLUG_ALPHABET).toBe(SLUG_ALPHABET.toLowerCase());
    expect(SLUG_ALPHABET).toMatch(/^[a-z0-9]+$/);
  });

  it("omits characters that are ambiguous when read aloud", () => {
    for (const char of ["l", "o", "0", "1"]) {
      expect(SLUG_ALPHABET).not.toContain(char);
    }
  });

  it("has enough entropy to be unguessable", () => {
    // Possession of the slug IS the permission for a shared list, so this must
    // resist enumeration, not merely avoid collisions.
    const bits = Math.log2(SLUG_ALPHABET.length ** SLUG_LENGTH);
    expect(bits).toBeGreaterThan(45);
  });

  it("does not collide across many draws", () => {
    const slugs = new Set(Array.from({ length: 5000 }, generateSlug));
    expect(slugs.size).toBe(5000);
  });
});

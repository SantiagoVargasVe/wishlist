import { describe, expect, it } from "vitest";

import {
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
} from "./invite-code";

describe("generateInviteCode", () => {
  it("returns a code of the expected length", () => {
    expect(generateInviteCode()).toHaveLength(INVITE_CODE_LENGTH);
  });

  it("uses only characters from the alphabet", () => {
    const pattern = new RegExp(`^[${INVITE_CODE_ALPHABET}]+$`);
    for (let i = 0; i < 200; i += 1) {
      expect(generateInviteCode()).toMatch(pattern);
    }
  });

  it("omits characters that are ambiguous when transcribed", () => {
    // These codes get read aloud and typed from screenshots. O/0 and I/1/L
    // confusion turns an invite into a support conversation.
    for (const char of ["O", "0", "I", "1", "L"]) {
      expect(INVITE_CODE_ALPHABET).not.toContain(char);
    }
  });

  it("is uppercase only, so casing never matters", () => {
    expect(INVITE_CODE_ALPHABET).toBe(INVITE_CODE_ALPHABET.toUpperCase());
  });

  it("does not collide across many draws", () => {
    const codes = new Set(Array.from({ length: 5000 }, generateInviteCode));
    expect(codes.size).toBe(5000);
  });
});

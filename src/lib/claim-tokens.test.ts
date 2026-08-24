import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getClaimToken, removeClaimToken, setClaimToken } from "./claim-tokens";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("claim-tokens", () => {
  it("returns null for an item that was never claimed", () => {
    expect(getClaimToken("item-1")).toBeNull();
  });

  it("stores and retrieves a token by item id", () => {
    setClaimToken("item-1", "tok_abc");
    expect(getClaimToken("item-1")).toBe("tok_abc");
  });

  it("keeps tokens for different items independent", () => {
    setClaimToken("item-1", "tok_a");
    setClaimToken("item-2", "tok_b");

    expect(getClaimToken("item-1")).toBe("tok_a");
    expect(getClaimToken("item-2")).toBe("tok_b");
  });

  it("removes only the given item's token", () => {
    setClaimToken("item-1", "tok_a");
    setClaimToken("item-2", "tok_b");

    removeClaimToken("item-1");

    expect(getClaimToken("item-1")).toBeNull();
    expect(getClaimToken("item-2")).toBe("tok_b");
  });

  it("survives malformed localStorage content instead of throwing", () => {
    localStorage.setItem("wishlist:claims", "{not json");
    expect(getClaimToken("item-1")).toBeNull();
  });
});

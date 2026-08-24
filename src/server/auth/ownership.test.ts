import { describe, expect, it } from "vitest";

import { ForbiddenError, NotFoundError } from "../errors";
import { assertOwned } from "./ownership";

const notFound = () => new NotFoundError("THING_NOT_FOUND", "Thing not found");

describe("assertOwned", () => {
  it("returns the resource when the caller owns it", () => {
    const resource = { id: "1", ownerId: "alice" };
    expect(assertOwned(resource, "alice", notFound)).toBe(resource);
  });

  it("throws the caller-supplied NotFoundError when the resource is missing", () => {
    expect(() => assertOwned(null, "alice", notFound)).toThrow(NotFoundError);
    expect(() => assertOwned(undefined, "alice", notFound)).toThrow(
      NotFoundError,
    );
  });

  it("preserves the caller's error code and message", () => {
    // Different resource types need different codes — WISHLIST_NOT_FOUND vs
    // ITEM_NOT_FOUND — so the factory has to actually be used, not swallowed.
    try {
      assertOwned(null, "alice", notFound);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).code).toBe("THING_NOT_FOUND");
    }
  });

  it("throws ForbiddenError, not NotFoundError, when it exists but isn't yours", () => {
    // The documented split: 404 truly missing, 403 exists but not yours.
    // Conflating them either leaks existence through an unearned 403, or hides
    // a real permission problem behind a misleading 404.
    const resource = { id: "1", ownerId: "alice" };
    expect(() => assertOwned(resource, "mallory", notFound)).toThrow(
      ForbiddenError,
    );
  });

  it("does not call the notFound factory when the resource exists", () => {
    const resource = { id: "1", ownerId: "alice" };
    let called = false;
    const spy = () => {
      called = true;
      return notFound();
    };

    assertOwned(resource, "alice", spy);
    expect(called).toBe(false);
  });
});

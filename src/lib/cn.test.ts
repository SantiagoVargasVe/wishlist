import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("lets the later class win a Tailwind conflict", () => {
    // This is the whole reason cn exists: a caller passing `p-8` must beat a
    // component's default `p-4`, regardless of stylesheet order.
    expect(cn("p-4", "p-8")).toBe("p-8");
    expect(cn("bg-primary", "bg-card")).toBe("bg-card");
  });

  it("keeps non-conflicting utilities from the same family", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });
});

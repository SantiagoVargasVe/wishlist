import { describe, expect, it } from "vitest";

import { computeUsdSnapshot } from "./money";

describe("computeUsdSnapshot", () => {
  it("snapshots a USD amount at its own value, rate 1", () => {
    expect(computeUsdSnapshot("49.99", "USD", 4100)).toEqual({
      priceUsdSnapshot: "49.99",
      fxRateUsed: "1",
    });
  });

  it("converts a COP amount by dividing by the rate", () => {
    expect(computeUsdSnapshot("410000", "COP", 4100)).toEqual({
      priceUsdSnapshot: "100.00",
      fxRateUsed: "4100",
    });
  });

  it("rounds to 2 decimal places", () => {
    // 1,300,000 / 4100 = 317.0731707..., which would show a floating-point
    // artifact (e.g. "317.07310000000004") if computed carelessly.
    const result = computeUsdSnapshot("1300000", "COP", 4100);
    expect(result.priceUsdSnapshot).toBe("317.07");
    expect(result.priceUsdSnapshot).toMatch(/^\d+\.\d{2}$/);
  });

  it("records the actual rate used, not a rounded one", () => {
    const result = computeUsdSnapshot("100000", "COP", 4123.45);
    expect(result.fxRateUsed).toBe("4123.45");
  });

  it("handles a large COP amount without precision loss in the integer part", () => {
    const result = computeUsdSnapshot("1299999.99", "COP", 4100);
    expect(result.priceUsdSnapshot).toBe("317.07");
  });
});

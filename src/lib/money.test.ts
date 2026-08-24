import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats COP with the es-CO locale", () => {
    // Intl's es-CO output uses a non-breaking space (U+00A0) after "$".
    expect(formatMoney("1300000", "COP")).toBe("$ 1.300.000,00");
  });

  it("formats USD with the en-US locale", () => {
    expect(formatMoney("49.99", "USD")).toBe("$49.99");
  });

  it("keeps cents precision for a COP amount", () => {
    expect(formatMoney("45000.50", "COP")).toBe("$ 45.000,50");
  });

  it("falls back to a plain amount + code for an unsupported currency", () => {
    expect(formatMoney("10", "EUR")).toBe("10 EUR");
  });
});

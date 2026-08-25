import { describe, expect, it } from "vitest";
import { formatAmountInput, formatMoney, parseAmountInput } from "./money";

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

describe("formatAmountInput", () => {
  it("groups a COP integer with periods", () => {
    expect(formatAmountInput("1300000", "COP")).toBe("1.300.000");
  });

  it("groups a USD integer with commas", () => {
    expect(formatAmountInput("1300000", "USD")).toBe("1,300,000");
  });

  it("uses a comma decimal separator for COP", () => {
    expect(formatAmountInput("45000.50", "COP")).toBe("45.000,50");
  });

  it("uses a period decimal separator for USD", () => {
    expect(formatAmountInput("45000.50", "USD")).toBe("45,000.50");
  });

  it("preserves an in-progress trailing decimal point while typing", () => {
    expect(formatAmountInput("1300000.", "USD")).toBe("1,300,000.");
  });

  it("returns an empty string for an empty raw value", () => {
    expect(formatAmountInput("", "COP")).toBe("");
  });
});

describe("parseAmountInput", () => {
  it("strips USD thousands commas back to a raw digit string", () => {
    expect(parseAmountInput("1,300,000", "USD")).toBe("1300000");
  });

  it("strips COP thousands periods back to a raw digit string", () => {
    expect(parseAmountInput("1.300.000", "COP")).toBe("1300000");
  });

  it("converts a USD decimal point to the schema's period format (no-op)", () => {
    expect(parseAmountInput("1,300,000.50", "USD")).toBe("1300000.50");
  });

  it("converts a COP decimal comma to the schema's period format", () => {
    expect(parseAmountInput("1.300.000,50", "COP")).toBe("1300000.50");
  });

  it("treats a repeated COP decimal separator as thousands groups, not a fraction — a plain grouped-integer paste", () => {
    // "," is COP's decimal separator, but it appears three times here — a
    // real decimal point never repeats, so this must be a differently
    // (USD-style) grouped integer, not "1300.000" with a 3-digit fraction.
    expect(parseAmountInput("1,300,000", "COP")).toBe("1300000");
  });

  it("caps the integer part at 12 digits and decimals at 2 places", () => {
    expect(parseAmountInput("1234567890123.999", "USD")).toBe("123456789012.99");
  });

  it("preserves an in-progress trailing decimal point", () => {
    expect(parseAmountInput("1300000.", "USD")).toBe("1300000.");
  });

  it("round-trips through formatAmountInput", () => {
    const raw = "45000.50";
    expect(parseAmountInput(formatAmountInput(raw, "COP"), "COP")).toBe(raw);
    expect(parseAmountInput(formatAmountInput(raw, "USD"), "USD")).toBe(raw);
  });
});

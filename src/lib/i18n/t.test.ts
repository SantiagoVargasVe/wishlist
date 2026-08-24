import { describe, expect, it } from "vitest";
import { interpolate, t } from "./t";
import type { TranslationKey } from "./t";

describe("t", () => {
  it("resolves a nested dot-path key", () => {
    expect(t("theme.light")).toBe("claro");
  });

  it("interpolates a var into the resolved template", () => {
    expect(t("theme.switchTo", { mode: t("theme.dark") })).toBe("Cambiar a modo oscuro");
  });

  it("throws on a key that isn't in the dictionary", () => {
    expect(() => t("nope.missing" as TranslationKey)).toThrow(/Missing i18n key/);
  });
});

describe("interpolate", () => {
  it("replaces every occurrence of a repeated placeholder", () => {
    expect(interpolate("{who} y {who}", { who: "Ana" })).toBe("Ana y Ana");
  });

  it("returns the template unchanged when there are no vars", () => {
    expect(interpolate("hola")).toBe("hola");
  });
});

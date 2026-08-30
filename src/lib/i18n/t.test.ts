import { describe, expect, it } from "vitest";
import { interpolate, t, translateMessage } from "./t";
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

describe("translateMessage", () => {
  it("resolves a string that is a known i18n key", () => {
    expect(translateMessage("wishlist.itemForm.errors.title")).toBe("Ingresa un título");
  });

  it("passes a string that is not a known key through unchanged", () => {
    expect(translateMessage("Enter a title")).toBe("Enter a title");
    expect(translateMessage("Correo o contraseña incorrectos")).toBe(
      "Correo o contraseña incorrectos",
    );
  });

  it("passes a dotted-but-unknown string through unchanged", () => {
    expect(translateMessage("not.a.real.key")).toBe("not.a.real.key");
  });

  it("returns undefined for undefined", () => {
    expect(translateMessage(undefined)).toBeUndefined();
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

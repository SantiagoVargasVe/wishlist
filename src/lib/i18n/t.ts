import { es } from "./es";

type Dictionary = typeof es;

/** Every dot-path to a leaf string in the dictionary, e.g. `"theme.switchToDark"`. */
type DotPath<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DotPath<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = DotPath<Dictionary>;

function resolve(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === "object" && segment in node
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      es,
    );

  if (typeof value !== "string") {
    throw new Error(`Missing i18n key: "${key}"`);
  }
  return value;
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

/**
 * Looks up a dictionary string by dot-path key and interpolates `{name}`
 * placeholders from `vars`. Only `es` exists today, but every user-facing
 * string routes through here so a second locale is a new dictionary file,
 * not a rewrite — see T050's context.
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return interpolate(resolve(key), vars);
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.schema";

/** Minimal KEY=value reader — enough for .env.example, no interpolation. */
function readEnvFile(relativePath: string): Record<string, string> {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  const entries: Record<string, string> = {};

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) entries[match[1]] = match[2];
  }

  return entries;
}

const valid = {
  DATABASE_URL: "postgresql://wishlist:pw@localhost:5432/wishlist",
  AUTH_SECRET: "x".repeat(32),
  APP_URL: "http://localhost:3000",
};

describe("parseConfig", () => {
  it("accepts a minimal valid environment", () => {
    const config = parseConfig(valid);
    expect(config.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(config.APP_URL).toBe(valid.APP_URL);
  });

  it("applies defaults for omitted optional values", () => {
    const config = parseConfig(valid);
    expect(config.NODE_ENV).toBe("development");
    expect(config.AUTH_COOKIE_NAME).toBe("wishlist_session");
    expect(config.IMAGE_MAX_WIDTH).toBe(800);
    expect(config.OG_FETCH_TIMEOUT_MS).toBe(5000);
  });

  it("coerces numeric strings, since env values are always strings", () => {
    const config = parseConfig({ ...valid, IMAGE_MAX_WIDTH: "1200" });
    expect(config.IMAGE_MAX_WIDTH).toBe(1200);
    expect(typeof config.IMAGE_MAX_WIDTH).toBe("number");
  });

  it("names the missing variable when a required one is absent", () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = valid;
    expect(() => parseConfig(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it("rejects an AUTH_SECRET shorter than 32 characters", () => {
    // A short secret is the dangerous case: it looks configured but is
    // brute-forceable, so it must fail as loudly as a missing one.
    expect(() => parseConfig({ ...valid, AUTH_SECRET: "tooshort" })).toThrow(
      /AUTH_SECRET/,
    );
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() =>
      parseConfig({ ...valid, DATABASE_URL: "mysql://localhost/db" }),
    ).toThrow(/postgresql/);
  });

  it("rejects an APP_URL that is not a URL", () => {
    expect(() => parseConfig({ ...valid, APP_URL: "not-a-url" })).toThrow(
      /APP_URL/,
    );
  });

  it("reports every problem at once, not just the first", () => {
    // Fixing config one error per restart is miserable; the whole point of
    // collecting issues is that one run tells you everything.
    let message = "";
    try {
      parseConfig({ AUTH_SECRET: "short", APP_URL: "nope" });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/AUTH_SECRET/);
    expect(message).toMatch(/APP_URL/);
  });
});

describe(".env.example", () => {
  it("satisfies the schema", () => {
    // Drift guard: adding a required variable to the schema without documenting
    // it in .env.example fails here, instead of failing for the next person who
    // clones the repo and can't boot.
    expect(() => parseConfig(readEnvFile("../../.env.example"))).not.toThrow();
  });
});

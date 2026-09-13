import { afterEach, describe, expect, it, vi } from "vitest";
import { runStartup } from "./startup";

afterEach(() => vi.restoreAllMocks());

describe("startup failure handling", () => {
  it("names invalid configuration fields without logging their values", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runStartup(async () => {
      throw new Error("Invalid environment configuration:\n  - AUTH_SECRET: secret-value is too short");
    })).rejects.toThrow("exit");
    expect(JSON.stringify(log.mock.calls)).toContain("AUTH_SECRET");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-value");
  });

  it("completes successful initialization without exiting", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    await runStartup(async () => {});
    expect(exit).not.toHaveBeenCalled();
  });

  it.each([
    { code: "57P03" },
    { cause: { code: "42601", query: "secret SQL parameters" } },
    { code: "postgres://secret-password@host/db" },
    new Error("secret configuration value"),
  ])("exits nonzero without leaking raw errors", async (error) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runStartup(async () => { throw error; })).rejects.toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "../instrumentation";
import { waitForDatabase } from "./db/wait-for-database";
import { runMigrations } from "./db/migrate";
import { scheduleWeeklySweep } from "./og/sweep";

vi.mock("./config", () => ({
  config: { DATABASE_URL: "postgres://test:test@localhost/test" },
  getConfig: () => ({ NODE_ENV: process.env.NODE_ENV, DATABASE_URL: "postgres://test:test@localhost/test" }),
}));
vi.mock("./db/wait-for-database", () => ({ waitForDatabase: vi.fn() }));
vi.mock("./db/migrate", () => ({ runMigrations: vi.fn() }));
vi.mock("./og/sweep", () => ({ scheduleWeeklySweep: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("instrumentation boot sequence", () => {
  it("does not migrate or schedule jobs until PostgreSQL is ready", async () => {
    let ready!: () => void;
    vi.mocked(waitForDatabase).mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    const boot = register();
    await vi.waitFor(() => expect(waitForDatabase).toHaveBeenCalledOnce());
    expect(runMigrations).not.toHaveBeenCalled();
    expect(scheduleWeeklySweep).not.toHaveBeenCalled();
    ready();
    await boot;
    expect(runMigrations).toHaveBeenCalledOnce();
    expect(scheduleWeeklySweep).toHaveBeenCalledOnce();
  });

  it.each(["readiness", "migration"])("exits if %s fails instead of leaving a poisoned server", async (stage) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(stage === "readiness" ? waitForDatabase : runMigrations)
      .mockRejectedValue({ code: stage === "readiness" ? "57P03" : "42601" });
    await expect(register()).rejects.toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    if (stage === "readiness") expect(runMigrations).not.toHaveBeenCalled();
    expect(scheduleWeeklySweep).not.toHaveBeenCalled();
  });

  it.each(["edge", "development"])("keeps %s out of production database startup", async (mode) => {
    if (mode === "edge") vi.stubEnv("NEXT_RUNTIME", "edge");
    else vi.stubEnv("NODE_ENV", "development");
    await register();
    expect(waitForDatabase).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
  });
});

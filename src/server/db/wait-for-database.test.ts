import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { waitForDatabase } from "./wait-for-database";

vi.mock("postgres", () => ({ default: vi.fn() }));

const query = vi.fn();
const close = vi.fn();
const url = "postgres://test:do-not-log@localhost/test";

beforeEach(() => {
  vi.useFakeTimers();
  query.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  close.mockReset().mockResolvedValue(undefined);
  vi.mocked(postgres).mockReset().mockReturnValue(
    Object.assign(query, { end: close }) as unknown as ReturnType<typeof postgres>,
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("database startup readiness", () => {
  it("closes a successful probe and returns without a delay", async () => {
    await waitForDatabase(url);
    expect(query).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith({ timeout: 0 });
    expect(console.warn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["57P03", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET"])(
    "waits and reconnects after %s, then recovers",
    async (code) => {
      query.mockRejectedValueOnce({ code, message: url });
      const result = waitForDatabase(url);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(query).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await result;
      expect(query).toHaveBeenCalledTimes(2);
      expect(close).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("do-not-log");
    },
  );

  it.each(["28P01", "3D000", "42601"])("does not retry permanent error %s", async (code) => {
    const error = { code };
    query.mockRejectedValue(error);
    await expect(waitForDatabase(url)).rejects.toBe(error);
    expect(query).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up after twelve failed probes so startup can exit", async () => {
    const error = { code: "57P03" };
    query.mockRejectedValue(error);
    const result = expect(waitForDatabase(url)).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await result;
    expect(query).toHaveBeenCalledTimes(12);
    expect(close).toHaveBeenCalledTimes(12);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds an accepted connection that never answers and closes every probe", async () => {
    query.mockImplementation(() => new Promise(() => {}));
    const result = expect(waitForDatabase(url)).rejects.toMatchObject({ code: "CONNECT_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(115_000);
    await result;
    expect(query).toHaveBeenCalledTimes(12);
    expect(close).toHaveBeenCalledTimes(12);
    expect(vi.getTimerCount()).toBe(0);
  });
});

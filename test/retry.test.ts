import { describe, it, expect, vi } from "vitest";
import { withRetry, RetryExhaustedError } from "../src/persistence/retry";

// All tests pass delays=[0,0,0] so no real sleeping occurs.
const NO_DELAY = [0, 0, 0] as const;

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, 3, NO_DELAY);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on a generic error and succeeds on the second attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, 3, NO_DELAY);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries the full maxAttempts count before throwing RetryExhaustedError", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("network error"));
    await expect(withRetry(fn, 3, NO_DELAY)).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("RetryExhaustedError carries the attempt count", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("fail"));
    const err = await withRetry(fn, 2, NO_DELAY).catch(e => e);
    expect(err).toBeInstanceOf(RetryExhaustedError);
    expect((err as RetryExhaustedError).attempts).toBe(2);
  });

  it("does not retry on a unique_violation (pg code 23505)", async () => {
    const uniqueErr = Object.assign(new Error("duplicate key"), {
      code: "23505",
      details: "",
      hint: "",
    });
    const fn = vi.fn().mockRejectedValue(uniqueErr);
    await expect(withRetry(fn, 3, NO_DELAY)).rejects.toMatchObject({ code: "23505" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on a check_violation (pg code 23514)", async () => {
    const checkErr = Object.assign(new Error("check violation"), { code: "23514", details: "", hint: "" });
    const fn = vi.fn().mockRejectedValue(checkErr);
    await expect(withRetry(fn, 3, NO_DELAY)).rejects.toMatchObject({ code: "23514" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on an unknown error code (treated as transient)", async () => {
    const transientErr = Object.assign(new Error("server error"), { code: "XX000", details: "", hint: "" });
    const fn = vi.fn()
      .mockRejectedValueOnce(transientErr)
      .mockResolvedValue("recovered");
    const result = await withRetry(fn, 3, NO_DELAY);
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

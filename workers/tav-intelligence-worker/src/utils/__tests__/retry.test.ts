import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff } from "../retry";

const noSleep = (_ms: number): Promise<void> => Promise.resolve();
const fixedRandom = (v: number) => () => v;

describe("retryWithBackoff", () => {
  it("returns the value on first-attempt success", async () => {
    const fn = vi.fn(async () => 42);
    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs:  1000,
      jitterRatio: 0,
      shouldRetry: () => true,
      sleep:  noSleep,
      random: fixedRandom(0.5),
    });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success and returns the resolved value", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "ok";
    });
    const result = await retryWithBackoff(fn, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs:  1000,
      jitterRatio: 0,
      shouldRetry: () => true,
      sleep:  noSleep,
      random: fixedRandom(0.5),
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("aborts when shouldRetry returns false (rethrows immediately)", async () => {
    const err = new Error("non-retryable");
    const fn = vi.fn(async () => { throw err; });
    const shouldRetry = vi.fn(() => false);
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs:  1000,
        jitterRatio: 0,
        shouldRetry,
        sleep: noSleep,
      }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
  });

  it("rethrows the last error after maxAttempts exhausted", async () => {
    let lastThrown: Error | undefined;
    let i = 0;
    const fn = vi.fn(async () => {
      const e = new Error(`attempt-${++i}`);
      lastThrown = e;
      throw e;
    });
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 50,
        maxDelayMs:  500,
        jitterRatio: 0,
        shouldRetry: () => true,
        sleep: noSleep,
      }),
    ).rejects.toSatisfy((err) => err === lastThrown);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(lastThrown?.message).toBe("attempt-3");
  });

  it("invokes onRetry between attempts but not after the final failure", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn(async () => { throw new Error("x"); });
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs:  1000,
        jitterRatio: 0,
        shouldRetry: () => true,
        onRetry,
        sleep: noSleep,
        random: fixedRandom(0.5),
      }),
    ).rejects.toBeInstanceOf(Error);
    // 3 attempts → 2 retries → onRetry called twice
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("computes backoff = baseDelayMs * 2^(attempt-1) when jitter is 0", async () => {
    const sleeps: number[] = [];
    const fn = vi.fn(async () => { throw new Error("x"); });
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 4,
        baseDelayMs: 100,
        maxDelayMs:  10_000,
        jitterRatio: 0,
        shouldRetry: () => true,
        sleep: async (ms) => { sleeps.push(ms); },
      }),
    ).rejects.toBeInstanceOf(Error);
    // attempt 1 fails → wait 100 → attempt 2 fails → wait 200 → attempt 3 fails → wait 400 → attempt 4 fails
    expect(sleeps).toEqual([100, 200, 400]);
  });

  it("clamps backoff to maxDelayMs", async () => {
    const sleeps: number[] = [];
    const fn = vi.fn(async () => { throw new Error("x"); });
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs:  1500,
        jitterRatio: 0,
        shouldRetry: () => true,
        sleep: async (ms) => { sleeps.push(ms); },
      }),
    ).rejects.toBeInstanceOf(Error);
    // unclamped: 1000, 2000, 4000, 8000 → clamped: 1000, 1500, 1500, 1500
    expect(sleeps).toEqual([1000, 1500, 1500, 1500]);
  });

  it("applies +30% jitter when random() returns 1.0 (max bound)", async () => {
    const sleeps: number[] = [];
    const fn = vi.fn(async () => { throw new Error("x"); });
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 2,
        baseDelayMs: 1000,
        maxDelayMs:  10_000,
        jitterRatio: 0.3,
        shouldRetry: () => true,
        sleep: async (ms) => { sleeps.push(ms); },
        random: fixedRandom(1.0),
      }),
    ).rejects.toBeInstanceOf(Error);
    // 1000 * (1 + (1*2-1)*0.3) = 1000 * 1.3 = 1300
    expect(sleeps).toEqual([1300]);
  });

  it("applies -30% jitter when random() returns 0.0 (min bound)", async () => {
    const sleeps: number[] = [];
    const fn = vi.fn(async () => { throw new Error("x"); });
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 2,
        baseDelayMs: 1000,
        maxDelayMs:  10_000,
        jitterRatio: 0.3,
        shouldRetry: () => true,
        sleep: async (ms) => { sleeps.push(ms); },
        random: fixedRandom(0.0),
      }),
    ).rejects.toBeInstanceOf(Error);
    // 1000 * (1 + (0*2-1)*0.3) = 1000 * 0.7 = 700
    expect(sleeps).toEqual([700]);
  });

  it("rejects maxAttempts < 1 with a clear error", async () => {
    await expect(
      retryWithBackoff(async () => 1, {
        maxAttempts: 0,
        baseDelayMs: 10,
        maxDelayMs:  100,
        jitterRatio: 0,
        shouldRetry: () => true,
      }),
    ).rejects.toThrow("maxAttempts must be >= 1");
  });

  it("passes attempt index to shouldRetry", async () => {
    const seen: number[] = [];
    const fn = vi.fn(async () => { throw new Error("x"); });
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs:  100,
        jitterRatio: 0,
        shouldRetry: (_e, attempt) => { seen.push(attempt); return true; },
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(Error);
    // shouldRetry is consulted on attempts 1 and 2 (not on the final attempt)
    expect(seen).toEqual([1, 2]);
  });
});

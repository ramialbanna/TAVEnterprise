import { describe, it, expect, vi } from "vitest";
import { KvRateLimiter } from "../kvRateLimiter";
import { RateLimitError } from "../../errors";
import {
  RATE_LIMIT_USER_LIVE_PER_WINDOW,
  RATE_LIMIT_GLOBAL_LIVE_PER_WINDOW,
  RATE_LIMIT_WINDOW_SECONDS,
} from "../../cache/constants";

const USER_EMAIL = "rami@texasautovalue.com";
const REQ_ID     = "req-test";

/** Minimal KV mock backed by an in-memory Map. */
function makeKv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get:             vi.fn(async (key: string) => store.get(key) ?? null),
    put:             vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete:          vi.fn(async (key: string) => { store.delete(key); }),
    list:            vi.fn(),
    getWithMetadata: vi.fn(),
  };
}

function windowKey(): number {
  return Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
}

// ── Under-limit ───────────────────────────────────────────────────────────────

describe("KvRateLimiter — under limit", () => {
  it("resolves when both counters are zero", async () => {
    const kv      = makeKv();
    const limiter = new KvRateLimiter(kv as unknown as KVNamespace);
    await expect(limiter.check(USER_EMAIL, REQ_ID)).resolves.toBeUndefined();
  });

  it("increments the per-user counter on each admitted call", async () => {
    const kv      = makeKv();
    const limiter = new KvRateLimiter(kv as unknown as KVNamespace);
    await limiter.check(USER_EMAIL, REQ_ID);
    await limiter.check(USER_EMAIL, REQ_ID);
    const userKey  = `rate:live:user:${USER_EMAIL}:${windowKey()}`;
    const lastCall = kv.put.mock.calls.filter(([k]: string[]) => k === userKey).at(-1);
    expect(lastCall?.[1]).toBe("2");
  });
});

// ── Per-user limit ────────────────────────────────────────────────────────────

describe("KvRateLimiter — per-user limit", () => {
  it("throws RateLimitError when user counter is at the limit", async () => {
    const userKey = `rate:live:user:${USER_EMAIL}:${windowKey()}`;
    const kv      = makeKv({ [userKey]: String(RATE_LIMIT_USER_LIVE_PER_WINDOW) });
    const limiter = new KvRateLimiter(kv as unknown as KVNamespace);
    const err     = await limiter.check(USER_EMAIL, REQ_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).code).toBe("rate_limited");
    expect((err as RateLimitError).httpStatus).toBe(429);
  });

  it("does not increment any counter when the user limit is exceeded", async () => {
    const userKey = `rate:live:user:${USER_EMAIL}:${windowKey()}`;
    const kv      = makeKv({ [userKey]: String(RATE_LIMIT_USER_LIVE_PER_WINDOW) });
    const limiter = new KvRateLimiter(kv as unknown as KVNamespace);
    await limiter.check(USER_EMAIL, REQ_ID).catch(() => {});
    expect(kv.put).not.toHaveBeenCalled();
  });
});

// ── Global limit ──────────────────────────────────────────────────────────────

describe("KvRateLimiter — global limit", () => {
  it("throws RateLimitError when global counter is at the limit", async () => {
    const globalKey = `rate:live:global:${windowKey()}`;
    const kv        = makeKv({ [globalKey]: String(RATE_LIMIT_GLOBAL_LIVE_PER_WINDOW) });
    const limiter   = new KvRateLimiter(kv as unknown as KVNamespace);
    const err       = await limiter.check(USER_EMAIL, REQ_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).code).toBe("rate_limited");
  });

  it("does not increment the global counter when the limit is exceeded", async () => {
    const globalKey = `rate:live:global:${windowKey()}`;
    const kv        = makeKv({ [globalKey]: String(RATE_LIMIT_GLOBAL_LIVE_PER_WINDOW) });
    const limiter   = new KvRateLimiter(kv as unknown as KVNamespace);
    await limiter.check(USER_EMAIL, REQ_ID).catch(() => {});
    // User counter put may have been called (user is under limit); global must not.
    const globalPuts = kv.put.mock.calls.filter(([k]: string[]) => k === globalKey);
    expect(globalPuts).toHaveLength(0);
  });
});

// ── Null email (anonymous) ────────────────────────────────────────────────────

describe("KvRateLimiter — null email", () => {
  it("skips the per-user check when email is null", async () => {
    const kv      = makeKv();
    const limiter = new KvRateLimiter(kv as unknown as KVNamespace);
    await expect(limiter.check(null, REQ_ID)).resolves.toBeUndefined();
    // Only one KV get call (for global key), not two.
    expect(kv.get).toHaveBeenCalledTimes(1);
  });
});

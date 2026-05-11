import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KvCacheLock } from "../kvLock";

// ── Fake KV with explicit get/put/delete spies ────────────────────────────────

interface FakeKv {
  kv:      KVNamespace;
  store:   Map<string, string>;
  getMock: ReturnType<typeof vi.fn>;
  putMock: ReturnType<typeof vi.fn>;
  delMock: ReturnType<typeof vi.fn>;
}

function makeFakeKv(seed?: Record<string, string>): FakeKv {
  const store = new Map<string, string>(seed ? Object.entries(seed) : []);
  const getMock = vi.fn(async (key: string) => {
    return store.get(key) ?? null;
  });
  const putMock = vi.fn(async (
    key: string,
    value: string,
    _opts?: { expirationTtl?: number },
  ) => {
    store.set(key, value);
  });
  const delMock = vi.fn(async (key: string) => {
    store.delete(key);
  });

  const kv = {
    get:    getMock,
    put:    putMock,
    delete: delMock,
    list:   vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;

  return { kv, store, getMock, putMock, delMock };
}

describe("KvCacheLock", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    logSpy.mockRestore();
  });

  function logEvents(): Array<{ event: string; [k: string]: unknown }> {
    return logSpy.mock.calls.map((call) =>
      JSON.parse(String(call[0])) as { event: string; [k: string]: unknown },
    );
  }

  it("acquire on absent key returns true and writes the lock", async () => {
    const { kv, putMock, store } = makeFakeKv();
    const lock = new KvCacheLock(kv);

    const promise = lock.acquire("vin:ABC", 30_000, "req-1");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(true);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(store.get("lock:vin:ABC")).toBe("req-1");
  });

  it("acquire when lock already held returns false and does not overwrite", async () => {
    const { kv, putMock, store } = makeFakeKv({ "lock:vin:ABC": "other-req" });
    const lock = new KvCacheLock(kv);

    const promise = lock.acquire("vin:ABC", 30_000, "req-1");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(false);
    expect(putMock).not.toHaveBeenCalled();
    expect(store.get("lock:vin:ABC")).toBe("other-req");
  });

  it("acquire writes value=requestId at the prefixed lock key", async () => {
    const { kv, putMock } = makeFakeKv();
    const lock = new KvCacheLock(kv);

    const promise = lock.acquire("vin:KEY", 30_000, "owner-x");
    await vi.runAllTimersAsync();
    await promise;

    expect(putMock).toHaveBeenCalledTimes(1);
    const [key, value] = putMock.mock.calls[0] as [string, string, unknown];
    expect(key).toBe("lock:vin:KEY");
    expect(value).toBe("owner-x");
  });

  it("clamps sub-60s ttlMs up to the 60-second KV minimum", async () => {
    const { kv, putMock } = makeFakeKv();
    const lock = new KvCacheLock(kv);

    const promise = lock.acquire("vin:CLAMP", 5_000 /* 5s */, "req-1");
    await vi.runAllTimersAsync();
    await promise;

    const opts = putMock.mock.calls[0]?.[2] as { expirationTtl?: number } | undefined;
    expect(opts?.expirationTtl).toBe(60);
  });

  it("uses ceil(ttlMs/1000) for ttlMs >= 60_000", async () => {
    const { kv, putMock } = makeFakeKv();
    const lock = new KvCacheLock(kv);

    const promise = lock.acquire("vin:BIG", 90_500, "req-1");
    await vi.runAllTimersAsync();
    await promise;

    const opts = putMock.mock.calls[0]?.[2] as { expirationTtl?: number } | undefined;
    expect(opts?.expirationTtl).toBe(91); // ceil(90.5)
  });

  it("release by owner deletes the lock", async () => {
    const { kv, store, delMock } = makeFakeKv({ "lock:vin:KEY": "owner-1" });
    const lock = new KvCacheLock(kv);

    await lock.release("vin:KEY", "owner-1");

    expect(delMock).toHaveBeenCalledWith("lock:vin:KEY");
    expect(store.has("lock:vin:KEY")).toBe(false);
  });

  it("release by non-owner is a no-op (does not delete)", async () => {
    const { kv, store, delMock } = makeFakeKv({ "lock:vin:KEY": "owner-1" });
    const lock = new KvCacheLock(kv);

    await lock.release("vin:KEY", "intruder");

    expect(delMock).not.toHaveBeenCalled();
    expect(store.get("lock:vin:KEY")).toBe("owner-1");
  });

  it("wait returns immediately when the lock is absent", async () => {
    const { kv } = makeFakeKv();
    const lock = new KvCacheLock(kv);

    const promise = lock.wait("vin:KEY", 30_000);
    // Should resolve on first poll without advancing time.
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });

  it("wait resolves once the lock disappears mid-poll", async () => {
    const { kv, store } = makeFakeKv({ "lock:vin:KEY": "other" });
    const lock = new KvCacheLock(kv);

    const promise = lock.wait("vin:KEY", 30_000);

    // First poll observes lock present → schedules 250ms sleep.
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    // Now release the lock.
    store.delete("lock:vin:KEY");

    // Second poll observes absent → resolves.
    await vi.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toBeUndefined();
  });

  it("wait returns at maxWaitMs even if lock still held", async () => {
    const { kv } = makeFakeKv({ "lock:vin:KEY": "stuck" });
    const lock = new KvCacheLock(kv);

    const promise = lock.wait("vin:KEY", 1_000);

    // Advance through enough polls to exceed the wait window.
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(promise).resolves.toBeUndefined();
  });

  it("acquire emits a log line that includes requestId", async () => {
    const { kv } = makeFakeKv();
    const lock = new KvCacheLock(kv);

    const promise = lock.acquire("vin:LOG", 30_000, "req-log");
    await vi.runAllTimersAsync();
    await promise;

    const acquired = logEvents().find((e) => e.event === "mmr.lock.acquired");
    expect(acquired).toBeDefined();
    expect(acquired?.requestId).toBe("req-log");
    expect(acquired?.key).toBe("vin:LOG");
  });

  it("acquire returns false when the verify-after-write read shows a different owner", async () => {
    // Simulate a race: first get returns null (vacant), put succeeds, but the
    // second (verify) get returns someone else's id.
    const getMock = vi.fn();
    getMock.mockResolvedValueOnce(null);             // initial probe
    getMock.mockResolvedValueOnce("racing-req");     // verify after write

    const kv = {
      get:    getMock,
      put:    vi.fn(async () => undefined),
      delete: vi.fn(),
      list:   vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace;

    const lock = new KvCacheLock(kv);
    const promise = lock.acquire("vin:RACE", 30_000, "req-1");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(false);
    expect(logEvents().some((e) =>
      e.event === "mmr.lock.race_lost" && e.observed_owner === "racing-req",
    )).toBe(true);
  });
});

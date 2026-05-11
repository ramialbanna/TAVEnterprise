import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { performMmrLookup } from "../mmrLookup";
import type { MmrLookupDeps, MmrLookupInput } from "../mmrLookup";
import type { MmrResponseEnvelope } from "../../validate";
import type { ManheimVinResponse, ManheimYmmResponse } from "../../clients/manheim";
import { CacheLockError, ManheimUnavailableError } from "../../errors";
import {
  POSITIVE_CACHE_TTL_SECONDS as POS_TTL,
  NEGATIVE_CACHE_TTL_SECONDS as NEG_TTL,
} from "../../cache/constants";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeps(): MmrLookupDeps & {
  client: { lookupByVin: ReturnType<typeof vi.fn>; lookupByYmm: ReturnType<typeof vi.fn> };
  cache:  { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; invalidate: ReturnType<typeof vi.fn> };
  lock:   { acquire: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn>; wait: ReturnType<typeof vi.fn> };
} {
  return {
    client: {
      lookupByVin: vi.fn(),
      lookupByYmm: vi.fn(),
    },
    cache: {
      get:        vi.fn(),
      set:        vi.fn(),
      invalidate: vi.fn(),
    },
    lock: {
      acquire: vi.fn(),
      release: vi.fn(),
      wait:    vi.fn(),
    },
  };
}

const VIN_INPUT: MmrLookupInput = {
  kind:    "vin",
  vin:     "1HGCM82633A123456",
  year:    2020,
  mileage: 45_000,
};

const YMM_INPUT: MmrLookupInput = {
  kind:  "ymm",
  year:  2020,
  make:  "Toyota",
  model: "Camry",
  trim:  "SE",
  mileage: 60_000,
};

const cachedEnvelope: MmrResponseEnvelope = {
  ok:                  true,
  mmr_value:           18_500,
  mileage_used:        45_000,
  is_inferred_mileage: false,
  cache_hit:           false, // cache stores the freshly-fetched form; service flips it to true on read
  source:              "manheim",
  fetched_at:          "2026-05-07T12:00:00.000Z",
  expires_at:          "2026-05-08T12:00:00.000Z",
  mmr_payload:         { items: [{ wholesale: { average: 18500 } }] },
  error_code:          null,
  error_message:       null,
};

const vinLiveResult: ManheimVinResponse = {
  mmr_value:  18_500,
  payload:    { items: [{ wholesale: { average: 18500 } }] },
  fetched_at: "2026-05-07T12:00:00.000Z",
  retryCount: 0,
};

const ymmLiveResult: ManheimYmmResponse = {
  mmr_value:  17_250,
  payload:    { items: [{ wholesale: { average: 17250 } }] },
  fetched_at: "2026-05-07T12:00:00.000Z",
  retryCount: 0,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("performMmrLookup", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function logEvents(): Array<{ event: string; [k: string]: unknown }> {
    return logSpy.mock.calls.map((call) =>
      JSON.parse(String(call[0])) as { event: string; [k: string]: unknown },
    );
  }

  it("cache hit: returns cached envelope, no client call, no lock attempt", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(cachedEnvelope);

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-1" },
      deps,
    );

    expect(result.cache_hit).toBe(true);
    expect(result.mmr_value).toBe(18_500);
    expect(deps.client.lookupByVin).not.toHaveBeenCalled();
    expect(deps.client.lookupByYmm).not.toHaveBeenCalled();
    expect(deps.lock.acquire).not.toHaveBeenCalled();
    expect(deps.cache.set).not.toHaveBeenCalled();
  });

  it("cache miss + lock acquired → calls client, writes cache, returns cache_hit=false", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);                  // initial miss
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue(vinLiveResult);
    deps.cache.set.mockResolvedValue(undefined);
    deps.lock.release.mockResolvedValue(undefined);

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-2" },
      deps,
    );

    expect(result.cache_hit).toBe(false);
    expect(result.mmr_value).toBe(18_500);
    expect(result.source).toBe("manheim");
    expect(deps.client.lookupByVin).toHaveBeenCalledTimes(1);
    expect(deps.cache.set).toHaveBeenCalledTimes(1);
    expect(deps.lock.release).toHaveBeenCalledWith(
      "vin:1HGCM82633A123456",
      "req-2",
    );
  });

  it("force_refresh: skips initial cache.get, calls client, writes cache", async () => {
    const deps = makeDeps();
    // Even if cache returned a value, force_refresh should bypass.
    deps.cache.get.mockResolvedValue(cachedEnvelope);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue(vinLiveResult);

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-3", forceRefresh: true },
      deps,
    );

    // We must NOT have read the cache for the initial check OR the recheck.
    expect(deps.cache.get).not.toHaveBeenCalled();
    expect(deps.client.lookupByVin).toHaveBeenCalledTimes(1);
    expect(deps.cache.set).toHaveBeenCalledTimes(1);
    expect(result.cache_hit).toBe(false);
  });

  it("lock contention: acquire false → wait → cache populated → cache_hit=true", async () => {
    const deps = makeDeps();
    // Initial miss, then after waiting, a populated cache.
    deps.cache.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cachedEnvelope);
    deps.lock.acquire.mockResolvedValue(false);
    deps.lock.wait.mockResolvedValue(undefined);

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-4" },
      deps,
    );

    expect(result.cache_hit).toBe(true);
    expect(result.mmr_value).toBe(18_500);
    expect(deps.lock.wait).toHaveBeenCalledTimes(1);
    expect(deps.client.lookupByVin).not.toHaveBeenCalled();
  });

  it("lock contention: acquire false → wait → cache STILL empty → throws CacheLockError", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null); // miss before AND after wait
    deps.lock.acquire.mockResolvedValue(false);
    deps.lock.wait.mockResolvedValue(undefined);

    await expect(
      performMmrLookup({ input: VIN_INPUT, requestId: "req-5" }, deps),
    ).rejects.toBeInstanceOf(CacheLockError);

    expect(deps.client.lookupByVin).not.toHaveBeenCalled();
  });

  it("inferred mileage propagates: missing mileage → client called with inferred value, envelope flagged", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue(vinLiveResult);

    // 2020 model; "now" = 2026-06-15 → ~6.5 years → ~97,500 miles.
    const fixedNow = new Date("2026-06-15T12:00:00.000Z");

    const result = await performMmrLookup(
      {
        input: { kind: "vin", vin: "1HGCM82633A123456", year: 2020 },
        requestId: "req-6",
        now: () => fixedNow,
      },
      deps,
    );

    expect(result.is_inferred_mileage).toBe(true);
    const callArg = deps.client.lookupByVin.mock.calls[0]?.[0] as { mileage: number };
    expect(callArg.mileage).toBeGreaterThan(0);
    expect(result.mileage_used).toBe(callArg.mileage);
  });

  it("negative result (mmr_value=null): cache.set uses NEGATIVE_CACHE_TTL_SECONDS", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue({
      ...vinLiveResult,
      mmr_value: null,
      payload:   {},
    });

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-7" },
      deps,
    );

    expect(result.mmr_value).toBeNull();
    expect(result.ok).toBe(false);
    const setArgs = deps.cache.set.mock.calls[0] as [string, unknown, number, string];
    expect(setArgs[2]).toBe(NEG_TTL);
  });

  it("positive result: cache.set uses POSITIVE_CACHE_TTL_SECONDS", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue(vinLiveResult);

    await performMmrLookup({ input: VIN_INPUT, requestId: "req-8" }, deps);

    const setArgs = deps.cache.set.mock.calls[0] as [string, unknown, number, string];
    expect(setArgs[2]).toBe(POS_TTL);
  });

  it("requestId propagates to cache, lock, and client", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue(vinLiveResult);

    await performMmrLookup(
      { input: VIN_INPUT, requestId: "trace-req" },
      deps,
    );

    expect(deps.cache.get).toHaveBeenCalledWith(expect.any(String), "trace-req");
    expect(deps.lock.acquire).toHaveBeenCalledWith(expect.any(String), expect.any(Number), "trace-req");
    expect(deps.lock.release).toHaveBeenCalledWith(expect.any(String), "trace-req");
    expect(deps.cache.set).toHaveBeenCalledWith(expect.any(String), expect.any(Object), expect.any(Number), "trace-req");
    const clientArgs = deps.client.lookupByVin.mock.calls[0]?.[0] as { requestId: string };
    expect(clientArgs.requestId).toBe("trace-req");
  });

  it("lock release happens even when client.lookup throws", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    const upstream = new ManheimUnavailableError("boom", { attempts: 4 });
    deps.client.lookupByVin.mockRejectedValue(upstream);

    await expect(
      performMmrLookup({ input: VIN_INPUT, requestId: "req-9" }, deps),
    ).rejects.toBe(upstream);

    expect(deps.lock.release).toHaveBeenCalledWith(
      "vin:1HGCM82633A123456",
      "req-9",
    );
    expect(deps.cache.set).not.toHaveBeenCalled();
  });

  it("Manheim errors bubble unchanged", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    const upstream = new ManheimUnavailableError("rate exhausted");
    deps.client.lookupByVin.mockRejectedValue(upstream);

    const promise = performMmrLookup({ input: VIN_INPUT, requestId: "req-10" }, deps);
    await expect(promise).rejects.toBe(upstream);
  });

  it("cache.set rejection does NOT block the response", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue(vinLiveResult);
    deps.cache.set.mockRejectedValue(new Error("kv write failed"));

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-11" },
      deps,
    );

    expect(result.mmr_value).toBe(18_500);
    expect(deps.lock.release).toHaveBeenCalled();
    expect(logEvents().some((e) =>
      e.event === "mmr.lookup.cache_set_failed",
    )).toBe(true);
  });

  it("re-check after lock acquired: if cache populated, NO client call", async () => {
    const deps = makeDeps();
    // Initial check: miss. Re-check after acquire: hit.
    deps.cache.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cachedEnvelope);
    deps.lock.acquire.mockResolvedValue(true);

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-12" },
      deps,
    );

    expect(result.cache_hit).toBe(true);
    expect(deps.client.lookupByVin).not.toHaveBeenCalled();
    expect(deps.cache.set).not.toHaveBeenCalled();
    expect(deps.lock.release).toHaveBeenCalled();
  });

  it("final log line includes route, cacheHit, lockAttempted, cacheKey, inferredMileage, retryCount, latencyMs", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue({ ...vinLiveResult, retryCount: 2 });

    await performMmrLookup({ input: VIN_INPUT, requestId: "req-13" }, deps);

    const completion = logEvents().find((e) => e.event === "mmr.lookup.complete");
    expect(completion).toBeDefined();
    expect(completion?.route).toBe("vin");
    expect(completion?.cacheHit).toBe(false);
    expect(completion?.lockAttempted).toBe(true);
    expect(completion?.cacheKey).toBe("vin:1HGCM82633A123456");
    expect(completion?.inferredMileage).toBe(false);
    expect(completion?.retryCount).toBe(2);
    expect(typeof completion?.latencyMs).toBe("number");
    expect(completion?.kpi).toBe(true);
  });

  it("retryCount from client appears in the completion log", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue({ ...vinLiveResult, retryCount: 3 });

    await performMmrLookup({ input: VIN_INPUT, requestId: "req-14" }, deps);

    const completion = logEvents().find((e) => e.event === "mmr.lookup.complete");
    expect(completion?.retryCount).toBe(3);
  });

  it("VIN input uses deriveVinCacheKey; YMM input uses deriveYmmCacheKey", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByVin.mockResolvedValue(vinLiveResult);
    deps.client.lookupByYmm.mockResolvedValue(ymmLiveResult);

    await performMmrLookup({ input: VIN_INPUT, requestId: "vin-req" }, deps);
    const vinKey = deps.cache.get.mock.calls[0]?.[0];
    expect(vinKey).toBe("vin:1HGCM82633A123456");

    deps.cache.get.mockResolvedValue(null);
    await performMmrLookup({ input: YMM_INPUT, requestId: "ymm-req" }, deps);
    const ymmKey = deps.cache.get.mock.calls[deps.cache.get.mock.calls.length - 1]?.[0];
    // year:2020, make:toyota, model:camry, trim:se, bucket: round(60000/5000)*5000 = 60000
    expect(ymmKey).toBe("ymm:2020:toyota:camry:se:60000");
  });

  it("YMM path: client.lookupByYmm called with normalized inputs", async () => {
    const deps = makeDeps();
    deps.cache.get.mockResolvedValue(null);
    deps.lock.acquire.mockResolvedValue(true);
    deps.client.lookupByYmm.mockResolvedValue(ymmLiveResult);

    await performMmrLookup(
      { input: YMM_INPUT, requestId: "ymm-call" },
      deps,
    );

    expect(deps.client.lookupByYmm).toHaveBeenCalledTimes(1);
    const arg = deps.client.lookupByYmm.mock.calls[0]?.[0] as {
      year:    number;
      make:    string;
      model:   string;
      trim?:   string;
      mileage: number;
    };
    expect(arg.year).toBe(2020);
    expect(arg.make).toBe("Toyota");
    expect(arg.model).toBe("Camry");
    expect(arg.trim).toBe("SE");
    expect(arg.mileage).toBe(60_000);
  });
});

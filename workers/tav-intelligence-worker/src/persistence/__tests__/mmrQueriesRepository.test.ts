import { describe, it, expect, vi } from "vitest";
import { createMmrQueriesRepository } from "../mmrQueriesRepository";
import type { MmrQueryInsertArgs } from "../mmrQueriesRepository";
import { createMmrCacheRepository } from "../mmrCacheRepository";
import { PersistenceError } from "../../errors";
import type { MmrLookupDeps, MmrLookupInput } from "../../services/mmrLookup";
import { performMmrLookup } from "../../services/mmrLookup";
import type { MmrResponseEnvelope } from "../../validate";
import type { UserContext } from "../../auth/userContext";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const USER_CTX: UserContext = {
  userId: "rami@texasautovalue.com",
  email:  "rami@texasautovalue.com",
  name:   "Rami",
  roles:  [],
};

const VIN_INPUT: MmrLookupInput = {
  kind:    "vin",
  vin:     "1HGCM82633A123456",
  year:    2020,
  mileage: 45_000,
};

const LIVE_ENVELOPE: MmrResponseEnvelope = {
  ok:                  true,
  mmr_value:           18_500,
  mileage_used:        45_000,
  is_inferred_mileage: false,
  cache_hit:           false,
  source:              "manheim",
  fetched_at:          "2026-05-07T12:00:00.000Z",
  expires_at:          "2026-05-08T12:00:00.000Z",
  mmr_payload:         { items: [] },
  error_code:          null,
  error_message:       null,
};

function makeSupabaseMock(error: { code: string; message: string } | null = null) {
  const fromReturn = {
    upsert: vi.fn().mockResolvedValue({ data: null, error }),
    insert: vi.fn().mockResolvedValue({ data: null, error }),
  };
  return {
    from: vi.fn().mockReturnValue(fromReturn),
    _fromReturn: fromReturn,
  };
}

// ── Test 1: query record written on cache hit ─────────────────────────────────

describe("mmrQueriesRepository — insert (cache hit)", () => {
  it("calls upsert with correct fields when outcome is hit", async () => {
    const sb   = makeSupabaseMock();
    const repo = createMmrQueriesRepository(sb as never);

    const args: MmrQueryInsertArgs = {
      requestId:    "req-cache-hit",
      input:        VIN_INPUT,
      userContext:  USER_CTX,
      envelope:     LIVE_ENVELOPE,
      cacheHit:     true,
      forceRefresh: false,
      retryCount:   0,
      latencyMs:    12,
      outcome:      "hit",
    };

    await repo.insert(args);

    expect(sb.from).toHaveBeenCalledWith("mmr_queries");
    const row = sb._fromReturn.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.request_id).toBe("req-cache-hit");
    expect(row.cache_hit).toBe(true);
    expect(row.source).toBe("cache");
    expect(row.outcome).toBe("hit");
    expect(row.retry_count).toBe(0);
    expect(row.vin).toBe("1HGCM82633A123456");
  });
});

// ── Test 2: query record written on live Manheim call ────────────────────────

describe("mmrQueriesRepository — insert (live call)", () => {
  it("records source=manheim and retryCount on a live call", async () => {
    const sb   = makeSupabaseMock();
    const repo = createMmrQueriesRepository(sb as never);

    await repo.insert({
      requestId:    "req-live",
      input:        VIN_INPUT,
      userContext:  USER_CTX,
      envelope:     LIVE_ENVELOPE,
      cacheHit:     false,
      forceRefresh: false,
      retryCount:   2,
      latencyMs:    340,
      outcome:      "miss",
    });

    const row = sb._fromReturn.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.source).toBe("manheim");
    expect(row.cache_hit).toBe(false);
    expect(row.retry_count).toBe(2);
    expect(row.outcome).toBe("miss");
    expect(row.latency_ms).toBe(340);
    expect(row.mmr_value).toBe(18_500);
  });
});

// ── Test 3: cache mirror written on live Manheim call ────────────────────────

describe("mmrCacheRepository — upsert (live call)", () => {
  it("upserts with cacheKey and core envelope fields", async () => {
    const sb   = makeSupabaseMock();
    const repo = createMmrCacheRepository(sb as never);

    await repo.upsert({
      cacheKey: "vin:1HGCM82633A123456",
      input:    VIN_INPUT,
      envelope: LIVE_ENVELOPE,
    });

    expect(sb.from).toHaveBeenCalledWith("mmr_cache");
    const row = sb._fromReturn.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.cache_key).toBe("vin:1HGCM82633A123456");
    expect(row.mmr_value).toBe(18_500);
    expect(row.source).toBe("manheim");
    expect(row.vin).toBe("1HGCM82633A123456");
  });

  it("writes mmr_wholesale_avg equal to mmr_value", async () => {
    const sb   = makeSupabaseMock();
    const repo = createMmrCacheRepository(sb as never);

    await repo.upsert({
      cacheKey: "vin:1HGCM82633A123456",
      input:    VIN_INPUT,
      envelope: LIVE_ENVELOPE,
    });

    const row = sb._fromReturn.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.mmr_wholesale_avg).toBe(18_500);
  });

  it("writes null for distribution columns when mmr_payload has no pricing data", async () => {
    const sb   = makeSupabaseMock();
    const repo = createMmrCacheRepository(sb as never);

    await repo.upsert({
      cacheKey: "vin:1HGCM82633A123456",
      input:    VIN_INPUT,
      envelope: LIVE_ENVELOPE,
    });

    const row = sb._fromReturn.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.mmr_wholesale_clean).toBeNull();
    expect(row.mmr_wholesale_rough).toBeNull();
    expect(row.mmr_retail_clean).toBeNull();
    expect(row.mmr_sample_count).toBeNull();
  });

  it("extracts distribution columns from mmr_payload when pricing data is present", async () => {
    const sb   = makeSupabaseMock();
    const repo = createMmrCacheRepository(sb as never);

    const envelopeWithPricing: MmrResponseEnvelope = {
      ...LIVE_ENVELOPE,
      mmr_payload: {
        items: [{
          adjustedPricing: { wholesale: { above: 19_800, average: 18_500, below: 17_200 } },
          sampleSize: "55",
        }],
      },
    };

    await repo.upsert({
      cacheKey: "vin:1HGCM82633A123456",
      input:    VIN_INPUT,
      envelope: envelopeWithPricing,
    });

    const row = sb._fromReturn.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.mmr_wholesale_clean).toBe(19_800);
    expect(row.mmr_wholesale_rough).toBe(17_200);
    expect(row.mmr_sample_count).toBe(55);
    expect(row.mmr_retail_clean).toBeNull();
  });

  it("writes mmr_wholesale_avg=null when envelope has no mmr_value (negative cache)", async () => {
    const sb   = makeSupabaseMock();
    const repo = createMmrCacheRepository(sb as never);

    const negativeEnvelope: MmrResponseEnvelope = {
      ...LIVE_ENVELOPE,
      ok:        false,
      mmr_value: null,
    };

    await repo.upsert({
      cacheKey: "vin:1HGCM82633A123456",
      input:    VIN_INPUT,
      envelope: negativeEnvelope,
    });

    const row = sb._fromReturn.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.mmr_value).toBeNull();
    expect(row.mmr_wholesale_avg).toBeNull();
  });
});

// ── Test 4: cache mirror NOT written on cache hit ────────────────────────────

describe("mmrLookup — cache mirror skipped on cache hit", () => {
  it("does not call cacheRepo.upsert when the result is a cache hit", async () => {
    const cacheRepoMock   = { upsert: vi.fn() };
    const queryRepoMock   = { insert: vi.fn().mockResolvedValue(undefined) };
    const activityRepoMock = { insert: vi.fn().mockResolvedValue(undefined) };

    const deps: MmrLookupDeps = {
      client: { lookupByVin: vi.fn(), lookupByYmm: vi.fn() },
      cache:  {
        get:        vi.fn().mockResolvedValue({ ...LIVE_ENVELOPE }),
        set:        vi.fn(),
        invalidate: vi.fn(),
      },
      lock:        { acquire: vi.fn(), release: vi.fn(), wait: vi.fn() },
      queryRepo:   queryRepoMock,
      cacheRepo:   cacheRepoMock,
      activityRepo: activityRepoMock,
    };

    await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-t4", userContext: USER_CTX },
      deps,
    );

    expect(cacheRepoMock.upsert).not.toHaveBeenCalled();
    expect(queryRepoMock.insert).toHaveBeenCalledOnce();
  });
});

// ── Test 5: activity record written on every lookup ──────────────────────────

describe("mmrLookup — activity record written on every lookup path", () => {
  it("calls activityRepo.insert on a cache hit", async () => {
    const activityRepoMock = { insert: vi.fn().mockResolvedValue(undefined) };

    const deps: MmrLookupDeps = {
      client: { lookupByVin: vi.fn(), lookupByYmm: vi.fn() },
      cache:  {
        get:        vi.fn().mockResolvedValue(LIVE_ENVELOPE),
        set:        vi.fn(),
        invalidate: vi.fn(),
      },
      lock:        { acquire: vi.fn(), release: vi.fn(), wait: vi.fn() },
      queryRepo:   { insert: vi.fn().mockResolvedValue(undefined) },
      cacheRepo:   { upsert: vi.fn() },
      activityRepo: activityRepoMock,
    };

    await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-t5", userContext: USER_CTX },
      deps,
    );

    expect(activityRepoMock.insert).toHaveBeenCalledOnce();
    const call = activityRepoMock.insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.activityType).toBe("mmr_search");
  });
});

// ── Test 6: PersistenceError from repo is swallowed ─────────────────────────

describe("mmrLookup — persistence errors are swallowed (best-effort)", () => {
  it("returns the MMR envelope even when queryRepo.insert throws PersistenceError", async () => {
    const deps: MmrLookupDeps = {
      client: { lookupByVin: vi.fn(), lookupByYmm: vi.fn() },
      cache:  {
        get:        vi.fn().mockResolvedValue(LIVE_ENVELOPE),
        set:        vi.fn(),
        invalidate: vi.fn(),
      },
      lock:        { acquire: vi.fn(), release: vi.fn(), wait: vi.fn() },
      queryRepo:   { insert: vi.fn().mockRejectedValue(new PersistenceError("db down")) },
      cacheRepo:   { upsert: vi.fn() },
      activityRepo: { insert: vi.fn().mockResolvedValue(undefined) },
    };

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-t6", userContext: USER_CTX },
      deps,
    );

    expect(result.mmr_value).toBe(18_500);
  });
});

// ── Test 7: idempotency — duplicate requestId is ignored ────────────────────

describe("mmrQueriesRepository — duplicate requestId idempotency", () => {
  it("does not throw when Supabase returns no error (ignoreDuplicates behavior)", async () => {
    const sb   = makeSupabaseMock(null);
    const repo = createMmrQueriesRepository(sb as never);

    const args: MmrQueryInsertArgs = {
      requestId:    "req-idempotent",
      input:        VIN_INPUT,
      userContext:  USER_CTX,
      envelope:     LIVE_ENVELOPE,
      cacheHit:     true,
      forceRefresh: false,
      retryCount:   0,
      latencyMs:    5,
      outcome:      "hit",
    };

    // Both calls should resolve without throwing (conflict is silently ignored).
    await expect(repo.insert(args)).resolves.toBeUndefined();
    await expect(repo.insert(args)).resolves.toBeUndefined();
  });

  it("throws PersistenceError when Supabase returns a real database error", async () => {
    const sb   = makeSupabaseMock({ code: "42P01", message: "relation does not exist" });
    const repo = createMmrQueriesRepository(sb as never);

    await expect(
      repo.insert({
        requestId:    "req-err",
        input:        VIN_INPUT,
        userContext:  USER_CTX,
        envelope:     null,
        cacheHit:     false,
        forceRefresh: false,
        retryCount:   0,
        latencyMs:    0,
        outcome:      "error",
        errorCode:    "manheim_unavailable",
        errorMessage: "upstream down",
      }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});

// ── Test 8: all writes skipped when repos not provided ───────────────────────

describe("mmrLookup — writes skipped when repos absent from deps", () => {
  it("completes successfully with no repo deps provided", async () => {
    const deps: MmrLookupDeps = {
      client: { lookupByVin: vi.fn(), lookupByYmm: vi.fn() },
      cache:  {
        get:        vi.fn().mockResolvedValue(LIVE_ENVELOPE),
        set:        vi.fn(),
        invalidate: vi.fn(),
      },
      lock: { acquire: vi.fn(), release: vi.fn(), wait: vi.fn() },
      // No queryRepo, cacheRepo, or activityRepo
    };

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-t8" },
      deps,
    );

    expect(result.cache_hit).toBe(true);
    expect(result.mmr_value).toBe(18_500);
  });
});

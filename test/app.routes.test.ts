import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";
import { listImportBatches } from "../src/persistence/importBatches";
import { listHistoricalSales } from "../src/persistence/historicalSales";
import { getLastCronRun } from "../src/persistence/cronRuns";
import {
  getMmrValueFromWorker,
  WorkerTimeoutError,
  WorkerRateLimitError,
  WorkerUnavailableError,
} from "../src/valuation/workerClient";

// ── Supabase mock ───────────────────────────────────────────────────────────────
// `dbState` is hoisted so the vi.mock factory can reference it; tests mutate it.
const { dbState } = vi.hoisted(() => ({
  dbState: {
    throwOnInit: false,
    // table name → { data?, count?, error? }
    tables: {} as Record<string, { data?: unknown[]; count?: number; error?: unknown }>,
  },
}));

vi.mock("../src/persistence/supabase", () => ({
  getSupabaseClient: vi.fn(() => {
    if (dbState.throwOnInit) throw new Error("client init failed");
    return {
      from: (table: string) => ({
        select: (_cols?: string, _opts?: { count?: string; head?: boolean }) => {
          const t = dbState.tables[table] ?? { data: [], count: 0 };
          if (t.error !== undefined) {
            return Promise.resolve({ data: null, count: null, error: t.error });
          }
          return Promise.resolve({ data: t.data ?? [], count: t.count ?? 0, error: null });
        },
      }),
    };
  }),
}));

// persistence/importBatches.listImportBatches is mocked so /app/import-batches
// tests can control its return value / force a query failure without a real DB.
vi.mock("../src/persistence/importBatches", () => ({
  listImportBatches: vi.fn(),
}));

// Same for persistence/historicalSales.listHistoricalSales (/app/historical-sales).
vi.mock("../src/persistence/historicalSales", () => ({
  listHistoricalSales: vi.fn(),
}));

// persistence/cronRuns: getLastCronRun feeds /app/system-status' `staleSweep` block.
// The record* helpers are stubbed too so importing src/index (whose scheduled() uses
// recordCronRunSafe) doesn't pull in the real module / hit the fake DB client.
vi.mock("../src/persistence/cronRuns", () => ({
  getLastCronRun: vi.fn(),
  recordCronRun: vi.fn(),
  recordCronRunSafe: vi.fn(),
}));

// valuation/workerClient: only getMmrValueFromWorker is replaced; the Worker*Error
// classes stay real so `instanceof` checks in handleMmrVin work and tests can
// construct them.
vi.mock("../src/valuation/workerClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/valuation/workerClient")>();
  return { ...actual, getMmrValueFromWorker: vi.fn() };
});

const ctx = {
  waitUntil: (_p: Promise<unknown>) => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

const APP_SECRET = "app-secret-test-value";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    APP_API_SECRET: APP_SECRET,
    MANHEIM_LOOKUP_MODE: "worker",
    INTEL_WORKER_URL: "https://intel.example.workers.dev",
    INTEL_WORKER: undefined,
    ...overrides,
  } as unknown as Env;
}

function authedReq(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${APP_SECRET}`, ...(init.headers ?? {}) },
  });
}

function authedPost(path: string, body: unknown): Request {
  return authedReq(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  dbState.throwOnInit = false;
  dbState.tables = {};
  vi.clearAllMocks();
  vi.mocked(listImportBatches).mockReset();
  vi.mocked(listImportBatches).mockResolvedValue([]);
  vi.mocked(listHistoricalSales).mockReset();
  vi.mocked(listHistoricalSales).mockResolvedValue([]);
  vi.mocked(getMmrValueFromWorker).mockReset();
  vi.mocked(getMmrValueFromWorker).mockResolvedValue(null);
  vi.mocked(getLastCronRun).mockReset();
  vi.mocked(getLastCronRun).mockResolvedValue(null);
});

describe("/app/* auth", () => {
  it("returns 503 when APP_API_SECRET is not configured", async () => {
    const res = await worker.fetch(
      authedReq("/app/system-status"),
      makeEnv({ APP_API_SECRET: "" }),
      ctx,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("app_auth_not_configured");
  });

  it("returns 401 with a wrong bearer token", async () => {
    const req = new Request("http://localhost/app/system-status", {
      headers: { Authorization: "Bearer not-the-secret" },
    });
    const res = await worker.fetch(req, makeEnv(), ctx);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 with no Authorization header", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/app/system-status"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown /app/* path", async () => {
    const res = await worker.fetch(authedReq("/app/nope"), makeEnv(), ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("not_found");
  });
});

describe("GET /app/system-status", () => {
  it("returns 200 with db.ok=true, source health, and staleSweep never_run when no cron run yet", async () => {
    dbState.tables.v_source_health = {
      data: [{ source: "facebook", region: "dallas", status: "complete" }],
    };
    const res = await worker.fetch(authedReq("/app/system-status"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: {
        service: string;
        version: string;
        db: { ok: boolean };
        intelWorker: { mode: string; binding: boolean; url: string | null };
        sources: unknown[];
        staleSweep: { lastRunAt: string | null; missingReason?: string; status?: string; updated?: number | null };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data.service).toBe("tav-enterprise");
    expect(body.data.version).toBe("0.1.0");
    expect(body.data.db.ok).toBe(true);
    expect(body.data.sources).toHaveLength(1);
    expect(body.data.intelWorker).toEqual({
      mode: "worker",
      binding: false,
      url: "https://intel.example.workers.dev",
    });
    expect(body.data.staleSweep).toEqual({ lastRunAt: null, missingReason: "never_run" });
    expect(vi.mocked(getLastCronRun)).toHaveBeenCalledWith(expect.anything(), "stale_sweep");
  });

  it("reports staleSweep lastRunAt + status + updated from the latest stale_sweep cron run", async () => {
    vi.mocked(getLastCronRun).mockResolvedValue({
      id: "c1",
      jobName: "stale_sweep",
      startedAt: "2026-05-11T06:00:00.000Z",
      finishedAt: "2026-05-11T06:00:03.500Z",
      status: "ok",
      detail: { updated: 42 },
    });
    const res = await worker.fetch(authedReq("/app/system-status"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { staleSweep: unknown } };
    expect(body.data.staleSweep).toEqual({
      lastRunAt: "2026-05-11T06:00:03.500Z",
      status: "ok",
      updated: 42,
    });
  });

  it("falls back to startedAt and updated:null when finishedAt / detail.updated are absent (e.g. failed run)", async () => {
    vi.mocked(getLastCronRun).mockResolvedValue({
      id: "c2",
      jobName: "stale_sweep",
      startedAt: "2026-05-11T06:00:00.000Z",
      finishedAt: null,
      status: "failed",
      detail: { error: { name: "Error", message: "rpc boom" } },
    });
    const res = await worker.fetch(authedReq("/app/system-status"), makeEnv(), ctx);
    const body = (await res.json()) as { data: { staleSweep: unknown } };
    expect(body.data.staleSweep).toEqual({
      lastRunAt: "2026-05-11T06:00:00.000Z",
      status: "failed",
      updated: null,
    });
  });

  it("reports staleSweep db_error when the cron_runs lookup throws (db itself still ok)", async () => {
    dbState.tables.v_source_health = { data: [] };
    vi.mocked(getLastCronRun).mockRejectedValue(new Error("relation cron_runs does not exist"));
    const res = await worker.fetch(authedReq("/app/system-status"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { db: { ok: boolean }; staleSweep: unknown } };
    expect(body.data.db.ok).toBe(true);
    expect(body.data.staleSweep).toEqual({ lastRunAt: null, missingReason: "db_error" });
  });

  it("still returns 200 with db.ok=false when the v_source_health query errors (staleSweep still resolves)", async () => {
    dbState.tables.v_source_health = { error: { message: "boom" } };
    const res = await worker.fetch(authedReq("/app/system-status"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { db: { ok: boolean; missingReason?: string }; sources: unknown[]; staleSweep: unknown };
    };
    expect(body.ok).toBe(true);
    expect(body.data.db.ok).toBe(false);
    expect(body.data.db.missingReason).toBe("db_error");
    expect(body.data.sources).toEqual([]);
    expect(body.data.staleSweep).toEqual({ lastRunAt: null, missingReason: "never_run" });
  });

  it("reports db_error for both db and staleSweep when the Supabase client cannot be constructed", async () => {
    dbState.throwOnInit = true;
    const res = await worker.fetch(authedReq("/app/system-status"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { db: { ok: boolean; missingReason?: string }; staleSweep: unknown };
    };
    expect(body.data.db.ok).toBe(false);
    expect(body.data.db.missingReason).toBe("db_error");
    expect(body.data.staleSweep).toEqual({ lastRunAt: null, missingReason: "db_error" });
    expect(vi.mocked(getLastCronRun)).not.toHaveBeenCalled();
  });

  it("reports intelWorker.mode=direct and binding=true correctly", async () => {
    const res = await worker.fetch(
      authedReq("/app/system-status"),
      makeEnv({ MANHEIM_LOOKUP_MODE: "direct", INTEL_WORKER: {} as unknown as Fetcher }),
      ctx,
    );
    const body = (await res.json()) as { data: { intelWorker: { mode: string; binding: boolean } } };
    expect(body.data.intelWorker.mode).toBe("direct");
    expect(body.data.intelWorker.binding).toBe(true);
  });
});

describe("GET /app/kpis", () => {
  it("returns 200 with metric blocks populated from Supabase", async () => {
    dbState.tables.v_outcome_summary_global = {
      data: [{
        total_outcomes: 12,
        avg_gross_profit: 1500,
        avg_hold_days: 21.5,
        sell_through_rate: 0.9167,
        last_outcome_at: "2026-05-01T00:00:00.000Z",
      }],
    };
    dbState.tables.v_outcome_summary = {
      data: [{ region: "dallas", total_outcomes: 12, avg_gross_profit: 1500 }],
    };
    dbState.tables.leads = { count: 47 };
    dbState.tables.normalized_listings = { count: 880 };

    const res = await worker.fetch(authedReq("/app/kpis"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: {
        outcomes: {
          value: {
            totalOutcomes: number;
            avgGrossProfit: number | null;
            avgHoldDays: number | null;
            lastOutcomeAt: string | null;
            byRegion: unknown[];
          } | null;
          missingReason: string | null;
        };
        leads: { value: { total: number } | null; missingReason: string | null };
        listings: { value: { normalizedTotal: number } | null; missingReason: string | null };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data.outcomes.missingReason).toBeNull();
    // sell_through_rate is present in the view row but intentionally NOT surfaced
    // (tautologically 1.0 today — see handleKpis comment / docs/followups.md).
    expect(body.data.outcomes.value).toEqual({
      totalOutcomes: 12,
      avgGrossProfit: 1500,
      avgHoldDays: 21.5,
      lastOutcomeAt: "2026-05-01T00:00:00.000Z",
      byRegion: [{ region: "dallas", total_outcomes: 12, avg_gross_profit: 1500 }],
    });
    expect(body.data.outcomes.value).not.toHaveProperty("sellThroughRate");
    expect(body.data.leads.value).toEqual({ total: 47 });
    expect(body.data.listings.value).toEqual({ normalizedTotal: 880 });
  });

  it("passes NULL global aggregates through as null on an empty outcomes table", async () => {
    dbState.tables.v_outcome_summary_global = {
      data: [{
        total_outcomes: 0,
        avg_gross_profit: null,
        avg_hold_days: null,
        sell_through_rate: null,
        last_outcome_at: null,
      }],
    };
    dbState.tables.v_outcome_summary = { data: [] };
    dbState.tables.leads = { count: 0 };
    dbState.tables.normalized_listings = { count: 0 };

    const res = await worker.fetch(authedReq("/app/kpis"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { outcomes: { value: Record<string, unknown> | null; missingReason: string | null } };
    };
    expect(body.data.outcomes.missingReason).toBeNull();
    expect(body.data.outcomes.value).toEqual({
      totalOutcomes: 0,
      avgGrossProfit: null,
      avgHoldDays: null,
      lastOutcomeAt: null,
      byRegion: [],
    });
  });

  it("degrades the outcomes block when the per-region view errors, without failing the request", async () => {
    dbState.tables.v_outcome_summary_global = { data: [{ total_outcomes: 1 }] };
    dbState.tables.v_outcome_summary = { error: { message: "view missing" } };
    dbState.tables.leads = { count: 3 };
    dbState.tables.normalized_listings = { count: 9 };

    const res = await worker.fetch(authedReq("/app/kpis"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        outcomes: { value: unknown; missingReason: string | null };
        leads: { value: { total: number } | null };
      };
    };
    expect(body.data.outcomes.value).toBeNull();
    expect(body.data.outcomes.missingReason).toBe("db_error");
    expect(body.data.leads.value).toEqual({ total: 3 });
  });

  it("degrades the outcomes block when the global rollup view errors", async () => {
    dbState.tables.v_outcome_summary_global = { error: { message: "view missing" } };
    dbState.tables.v_outcome_summary = { data: [{ region: "dallas" }] };
    dbState.tables.leads = { count: 5 };
    dbState.tables.normalized_listings = { count: 11 };

    const res = await worker.fetch(authedReq("/app/kpis"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { outcomes: { value: unknown; missingReason: string | null } };
    };
    expect(body.data.outcomes.value).toBeNull();
    expect(body.data.outcomes.missingReason).toBe("db_error");
  });

  it("returns 503 when the Supabase client cannot be constructed", async () => {
    dbState.throwOnInit = true;
    const res = await worker.fetch(authedReq("/app/kpis"), makeEnv(), ctx);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("db_error");
  });
});

describe("GET /app/import-batches", () => {
  it("requires a Bearer token", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/app/import-batches"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(vi.mocked(listImportBatches)).not.toHaveBeenCalled();
  });

  it("returns 200 with the batch list and the default limit of 20", async () => {
    vi.mocked(listImportBatches).mockResolvedValue([
      { id: "b1" },
      { id: "b2" },
    ] as unknown as Awaited<ReturnType<typeof listImportBatches>>);

    const res = await worker.fetch(authedReq("/app/import-batches"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: Array<{ id: string }> };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([{ id: "b1" }, { id: "b2" }]);
    expect(vi.mocked(listImportBatches)).toHaveBeenCalledWith(expect.anything(), 20);
  });

  it("passes ?limit=5 through", async () => {
    const res = await worker.fetch(authedReq("/app/import-batches?limit=5"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(listImportBatches)).toHaveBeenCalledWith(expect.anything(), 5);
  });

  it("clamps ?limit=500 to 100", async () => {
    const res = await worker.fetch(authedReq("/app/import-batches?limit=500"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(listImportBatches)).toHaveBeenCalledWith(expect.anything(), 100);
  });

  it("falls back to 20 for invalid / zero / negative / fractional limits", async () => {
    for (const bad of ["abc", "0", "-3", "2.5", ""]) {
      vi.mocked(listImportBatches).mockClear();
      const res = await worker.fetch(
        authedReq(`/app/import-batches?limit=${encodeURIComponent(bad)}`),
        makeEnv(),
        ctx,
      );
      expect(res.status).toBe(200);
      expect(vi.mocked(listImportBatches)).toHaveBeenCalledWith(expect.anything(), 20);
    }
  });

  it("returns 503 db_error when listImportBatches throws", async () => {
    vi.mocked(listImportBatches).mockRejectedValue(new Error("query failed"));
    const res = await worker.fetch(authedReq("/app/import-batches"), makeEnv(), ctx);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("db_error");
  });

  it("returns 503 db_error when the Supabase client cannot be constructed", async () => {
    dbState.throwOnInit = true;
    const res = await worker.fetch(authedReq("/app/import-batches"), makeEnv(), ctx);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("db_error");
    expect(vi.mocked(listImportBatches)).not.toHaveBeenCalled();
  });
});

describe("GET /app/historical-sales", () => {
  it("requires a Bearer token", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/app/historical-sales"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(vi.mocked(listHistoricalSales)).not.toHaveBeenCalled();
  });

  it("returns 200 with the sales list and the default limit of 20", async () => {
    vi.mocked(listHistoricalSales).mockResolvedValue([
      { id: "s1" },
      { id: "s2" },
    ] as unknown as Awaited<ReturnType<typeof listHistoricalSales>>);

    const res = await worker.fetch(authedReq("/app/historical-sales"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: Array<{ id: string }> };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([{ id: "s1" }, { id: "s2" }]);
    expect(vi.mocked(listHistoricalSales)).toHaveBeenCalledWith(expect.anything(), { limit: 20 });
  });

  it("passes ?limit=5 through", async () => {
    const res = await worker.fetch(authedReq("/app/historical-sales?limit=5"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(listHistoricalSales)).toHaveBeenCalledWith(expect.anything(), { limit: 5 });
  });

  it("clamps ?limit=500 to 100", async () => {
    const res = await worker.fetch(authedReq("/app/historical-sales?limit=500"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(listHistoricalSales)).toHaveBeenCalledWith(expect.anything(), { limit: 100 });
  });

  it("falls back to 20 for invalid / zero / negative / fractional limits", async () => {
    for (const bad of ["abc", "0", "-3", "2.5", ""]) {
      vi.mocked(listHistoricalSales).mockClear();
      const res = await worker.fetch(
        authedReq(`/app/historical-sales?limit=${encodeURIComponent(bad)}`),
        makeEnv(),
        ctx,
      );
      expect(res.status).toBe(200);
      expect(vi.mocked(listHistoricalSales)).toHaveBeenCalledWith(expect.anything(), { limit: 20 });
    }
  });

  it("applies year / make / model / since filters", async () => {
    const res = await worker.fetch(
      authedReq("/app/historical-sales?limit=7&year=2021&make=Honda&model=Civic&since=2024-01-01"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(listHistoricalSales)).toHaveBeenCalledWith(expect.anything(), {
      limit: 7,
      year: 2021,
      make: "Honda",
      model: "Civic",
      since: "2024-01-01",
    });
  });

  it("returns 503 db_error when listHistoricalSales throws", async () => {
    vi.mocked(listHistoricalSales).mockRejectedValue(new Error("query failed"));
    const res = await worker.fetch(authedReq("/app/historical-sales"), makeEnv(), ctx);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("db_error");
  });

  it("returns 503 db_error when the Supabase client cannot be constructed", async () => {
    dbState.throwOnInit = true;
    const res = await worker.fetch(authedReq("/app/historical-sales"), makeEnv(), ctx);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("db_error");
    expect(vi.mocked(listHistoricalSales)).not.toHaveBeenCalled();
  });
});

describe("POST /app/mmr/vin", () => {
  const VIN = "1HGCM82633A004352"; // 17 chars

  type MmrResultLike = Awaited<ReturnType<typeof getMmrValueFromWorker>>;
  const mmrResult = (over: Partial<NonNullable<MmrResultLike>> = {}) =>
    ({ mmrValue: 18500, confidence: "high", method: "vin", rawResponse: {}, ...over }) as MmrResultLike;

  it("requires a Bearer token", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/app/mmr/vin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: VIN }),
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(vi.mocked(getMmrValueFromWorker)).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_json for a non-JSON body", async () => {
    const res = await worker.fetch(authedPost("/app/mmr/vin", "{not json"), makeEnv(), ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("invalid_json");
    expect(vi.mocked(getMmrValueFromWorker)).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_body when vin is missing", async () => {
    const res = await worker.fetch(authedPost("/app/mmr/vin", {}), makeEnv(), ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("invalid_body");
    expect(vi.mocked(getMmrValueFromWorker)).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_body when vin is too short", async () => {
    const res = await worker.fetch(authedPost("/app/mmr/vin", { vin: "abc" }), makeEnv(), ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("invalid_body");
  });

  it("returns 200 with the valuation when the worker resolves a value", async () => {
    vi.mocked(getMmrValueFromWorker).mockResolvedValue(mmrResult());
    const res = await worker.fetch(authedPost("/app/mmr/vin", { vin: VIN }), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { mmrValue: number | null; confidence: string | null; method: string | null };
    };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ mmrValue: 18500, confidence: "high", method: "vin" });
    expect(vi.mocked(getMmrValueFromWorker)).toHaveBeenCalledWith({ vin: VIN }, expect.anything());
  });

  it("forwards optional year and mileage to the worker", async () => {
    vi.mocked(getMmrValueFromWorker).mockResolvedValue(mmrResult());
    const res = await worker.fetch(
      authedPost("/app/mmr/vin", { vin: VIN, year: 2020, mileage: 45000 }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(getMmrValueFromWorker)).toHaveBeenCalledWith(
      { vin: VIN, year: 2020, mileage: 45000 },
      expect.anything(),
    );
  });

  it("reports method:null when the worker result has no method", async () => {
    vi.mocked(getMmrValueFromWorker).mockResolvedValue(mmrResult({ method: undefined }));
    const res = await worker.fetch(authedPost("/app/mmr/vin", { vin: VIN }), makeEnv(), ctx);
    const body = (await res.json()) as { data: { method: string | null } };
    expect(body.data.method).toBeNull();
  });

  it("returns 200 mmrValue:null + missingReason when the worker returns no value", async () => {
    vi.mocked(getMmrValueFromWorker).mockResolvedValue(null);
    const res = await worker.fetch(authedPost("/app/mmr/vin", { vin: VIN }), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { mmrValue: number | null; missingReason: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ mmrValue: null, missingReason: "no_mmr_value" });
  });

  it("returns 200 mmrValue:null + intel_worker_not_configured when INTEL_WORKER_URL is empty", async () => {
    const res = await worker.fetch(
      authedPost("/app/mmr/vin", { vin: VIN }),
      makeEnv({ INTEL_WORKER_URL: "" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { mmrValue: null; missingReason: string } };
    expect(body.data).toEqual({ mmrValue: null, missingReason: "intel_worker_not_configured" });
    expect(vi.mocked(getMmrValueFromWorker)).not.toHaveBeenCalled();
  });

  it("maps WorkerTimeoutError to a non-blocking 200 with missingReason", async () => {
    vi.mocked(getMmrValueFromWorker).mockRejectedValue(new WorkerTimeoutError());
    const res = await worker.fetch(authedPost("/app/mmr/vin", { vin: VIN }), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { mmrValue: null; missingReason: string } };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ mmrValue: null, missingReason: "intel_worker_timeout" });
  });

  it("maps WorkerRateLimitError to missingReason intel_worker_rate_limited", async () => {
    vi.mocked(getMmrValueFromWorker).mockRejectedValue(new WorkerRateLimitError());
    const res = await worker.fetch(authedPost("/app/mmr/vin", { vin: VIN }), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { missingReason: string } };
    expect(body.data.missingReason).toBe("intel_worker_rate_limited");
  });

  it("maps WorkerUnavailableError to missingReason intel_worker_unavailable", async () => {
    vi.mocked(getMmrValueFromWorker).mockRejectedValue(new WorkerUnavailableError(503));
    const res = await worker.fetch(authedPost("/app/mmr/vin", { vin: VIN }), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { missingReason: string } };
    expect(body.data.missingReason).toBe("intel_worker_unavailable");
  });

  it("lets an unexpected worker error fall through to 503 internal_error", async () => {
    vi.mocked(getMmrValueFromWorker).mockRejectedValue(new Error("kaboom"));
    const res = await worker.fetch(authedPost("/app/mmr/vin", { vin: VIN }), makeEnv(), ctx);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("internal_error");
  });
});

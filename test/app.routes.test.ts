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
import type * as WorkerClientModule from "../src/valuation/workerClient";
import { listSourceRuns, getSourceRunDetail } from "../src/persistence/ingestRuns";
import { listOpportunities, getOpportunityDetail } from "../src/persistence/opportunities";
import { listActiveUsers } from "../src/persistence/users";
import { resolveAppUser } from "../src/auth/resolveAppUser";
import {
  submitManualOpportunity,
  ManualSubmissionValidationError,
} from "../src/persistence/manualOpportunities";
import { parseListingUrl } from "../src/intake/parseListingUrl";
import {
  updateOpportunityStatus,
  addOpportunityNote,
  OpportunityWorkflowError,
} from "../src/persistence/opportunityWorkflow";

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

// persistence/ingestRuns backs GET /app/ingest-runs[/:id].
vi.mock("../src/persistence/ingestRuns", () => ({
  listSourceRuns: vi.fn(),
  getSourceRunDetail: vi.fn(),
}));

vi.mock("../src/persistence/opportunities", () => ({
  listOpportunities: vi.fn(),
  getOpportunityDetail: vi.fn(),
}));

vi.mock("../src/persistence/users", () => ({
  listActiveUsers: vi.fn(),
}));

vi.mock("../src/auth/resolveAppUser", () => ({
  resolveAppUser: vi.fn(),
}));

vi.mock("../src/persistence/manualOpportunities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/persistence/manualOpportunities")>();
  return {
    ...actual,
    submitManualOpportunity: vi.fn(),
  };
});

vi.mock("../src/intake/parseListingUrl", () => ({
  parseListingUrl: vi.fn(),
}));

vi.mock("../src/persistence/opportunityWorkflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/persistence/opportunityWorkflow")>();
  return {
    ...actual,
    updateOpportunityStatus: vi.fn(),
    addOpportunityNote: vi.fn(),
  };
});

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
  const actual = await importOriginal<typeof WorkerClientModule>();
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
  vi.mocked(listSourceRuns).mockReset();
  vi.mocked(listSourceRuns).mockResolvedValue([]);
  vi.mocked(getSourceRunDetail).mockReset();
  vi.mocked(getSourceRunDetail).mockResolvedValue(null);
  vi.mocked(listActiveUsers).mockReset();
  vi.mocked(listActiveUsers).mockResolvedValue([]);
  vi.mocked(resolveAppUser).mockReset();
  vi.mocked(resolveAppUser).mockResolvedValue(null);
  vi.mocked(submitManualOpportunity).mockReset();
  vi.mocked(updateOpportunityStatus).mockReset();
  vi.mocked(addOpportunityNote).mockReset();
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
    // (tautologically 1.0 today — see handleKpis comment / docs/05-process/followups.md).
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

  it("returns 200 mmrValue:null + intel_worker_not_configured when neither INTEL_WORKER_URL nor INTEL_WORKER binding is configured", async () => {
    const res = await worker.fetch(
      authedPost("/app/mmr/vin", { vin: VIN }),
      makeEnv({ INTEL_WORKER_URL: "", INTEL_WORKER: undefined }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { mmrValue: null; missingReason: string } };
    expect(body.data).toEqual({ mmrValue: null, missingReason: "intel_worker_not_configured" });
    expect(vi.mocked(getMmrValueFromWorker)).not.toHaveBeenCalled();
  });

  it("does NOT short-circuit when INTEL_WORKER service binding is present and INTEL_WORKER_URL is empty (prod config)", async () => {
    vi.mocked(getMmrValueFromWorker).mockResolvedValue({
      mmrValue: 27500,
      confidence: "high",
      method: "vin",
      rawResponse: {},
    });
    // Service-binding-only production: INTEL_WORKER_URL empty, INTEL_WORKER stubbed.
    const stubbedBinding = { fetch: vi.fn() } as unknown as Fetcher;
    const res = await worker.fetch(
      authedPost("/app/mmr/vin", { vin: VIN }),
      makeEnv({ INTEL_WORKER_URL: "", INTEL_WORKER: stubbedBinding }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { mmrValue: number; missingReason?: string } };
    expect(body.data).toEqual({ mmrValue: 27500, confidence: "high", method: "vin" });
    // Critical: the handler must have delegated to getMmrValueFromWorker, not
    // short-circuited with intel_worker_not_configured.
    expect(vi.mocked(getMmrValueFromWorker)).toHaveBeenCalledTimes(1);
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

describe("/app/mmr live catalog + YMM valuation", () => {
  function intelEnv(fetchImpl: ReturnType<typeof vi.fn>): Env {
    return makeEnv({
      INTEL_WORKER_URL: "",
      INTEL_WORKER_SECRET: "intel-secret-test-value",
      INTEL_WORKER: { fetch: fetchImpl } as unknown as Fetcher,
    });
  }

  function intelOk(data: unknown): Response {
    return new Response(JSON.stringify({
      success: true,
      data,
      requestId: "intel-req",
      timestamp: "2026-05-17T12:00:00.000Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  it("GET /app/mmr/catalog/years proxies to intel and unwraps the catalog envelope", async () => {
    const intelFetch = vi.fn().mockResolvedValue(intelOk({
      items: ["2026", "2025"],
      catalogState: "connected",
      cached: false,
      reason: null,
    }));
    const res = await worker.fetch(authedReq("/app/mmr/catalog/years"), intelEnv(intelFetch), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { items: string[] } };
    expect(body).toEqual({
      ok: true,
      data: {
        items: ["2026", "2025"],
        catalogState: "connected",
        cached: false,
        reason: null,
      },
    });
    expect(String(intelFetch.mock.calls[0]?.[0])).toContain("/catalog/years");
    const init = intelFetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("x-tav-service-secret")).toBe("intel-secret-test-value");
  });

  it("GET catalog routes reject missing parent parameters before intel fetch", async () => {
    const intelFetch = vi.fn();
    const res = await worker.fetch(authedReq("/app/mmr/catalog/models?year=2026"), intelEnv(intelFetch), ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "invalid_filter" });
    expect(intelFetch).not.toHaveBeenCalled();
  });

  it("POST /app/mmr/ymm requires style and mileage before intel fetch", async () => {
    const intelFetch = vi.fn();
    const res = await worker.fetch(
      authedPost("/app/mmr/ymm", { year: 2026, make: "TESLA", model: "MODEL Y AWD", style: "" }),
      intelEnv(intelFetch),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("invalid_body");
    expect(intelFetch).not.toHaveBeenCalled();
  });

  it("POST /app/mmr/ymm forwards style as trim and surfaces distribution fields", async () => {
    const intelFetch = vi.fn().mockResolvedValue(intelOk({
      ok: true,
      mmr_value: 23900,
      mileage_used: 70740,
      is_inferred_mileage: false,
      cache_hit: false,
      source: "manheim",
      fetched_at: "2026-05-17T12:00:00.000Z",
      expires_at: "2026-05-18T12:00:00.000Z",
      error_code: null,
      error_message: null,
      mmr_payload: {
        items: [{
          averageOdometer: 70740,
          averageGrade: 3.9,
          sampleSize: "32",
          adjustedPricing: {
            wholesale: { below: 22700, average: 23900, above: 25100 },
            retail: { below: 23500, average: 26600, above: 29800 },
          },
        }],
      },
    }));
    const res = await worker.fetch(
      authedPost("/app/mmr/ymm", {
        year: 2026,
        make: "TESLA",
        model: "MODEL Y AWD",
        style: "4D SUV PERFORMANCE",
        mileage: 70740,
      }),
      intelEnv(intelFetch),
      ctx,
    );
    expect(res.status).toBe(200);
    const request = JSON.parse(String((intelFetch.mock.calls[0]?.[1] as RequestInit).body)) as Record<string, unknown>;
    expect(request).toEqual({
      year: 2026,
      make: "TESLA",
      model: "MODEL Y AWD",
      trim: "4D SUV PERFORMANCE",
      mileage: 70740,
    });
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      mmrValue: 23900,
      confidence: "medium",
      method: "year_make_model",
      mileageUsed: 70740,
      avgOdometer: 70740,
      avgCondition: 3.9,
      sampleCount: 32,
      rangeLow: 22700,
      rangeHigh: 25100,
      adjustedMmr: 23900,
      retailValue: 26600,
      retailRangeLow: 23500,
      retailRangeHigh: 29800,
    });
  });
});

// ── GET /app/ingest-runs ──────────────────────────────────────────────────────

const RUN_SUMMARY = {
  id: "11111111-1111-1111-1111-111111111111",
  source: "facebook",
  run_id: "4NyscgfxEA39sJcIY",
  region: "dallas_tx",
  status: "completed",
  item_count: 4,
  processed: 3,
  rejected: 1,
  created_leads: 0,
  scraped_at: "2026-05-16T20:11:42.247Z",
  created_at: "2026-05-16T20:11:49.596Z",
  error_message: null,
};

describe("GET /app/ingest-runs", () => {
  it("returns the run list in an { ok, data } envelope", async () => {
    vi.mocked(listSourceRuns).mockResolvedValue([RUN_SUMMARY]);
    const res = await worker.fetch(authedReq("/app/ingest-runs"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([RUN_SUMMARY]);
  });

  it("defaults limit to 20 and clamps to 100", async () => {
    await worker.fetch(authedReq("/app/ingest-runs"), makeEnv(), ctx);
    expect(vi.mocked(listSourceRuns).mock.calls[0]![1].limit).toBe(20);
    vi.mocked(listSourceRuns).mockClear();
    await worker.fetch(authedReq("/app/ingest-runs?limit=500"), makeEnv(), ctx);
    expect(vi.mocked(listSourceRuns).mock.calls[0]![1].limit).toBe(100);
  });

  it("passes valid source/region/status filters through", async () => {
    await worker.fetch(
      authedReq("/app/ingest-runs?source=facebook&region=dallas_tx&status=completed"),
      makeEnv(),
      ctx,
    );
    expect(vi.mocked(listSourceRuns).mock.calls[0]![1]).toMatchObject({
      source: "facebook",
      region: "dallas_tx",
      status: "completed",
    });
  });

  it("rejects an invalid filter value with 400 invalid_filter", async () => {
    const res = await worker.fetch(
      authedReq("/app/ingest-runs?status=bogus"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("invalid_filter");
    expect(vi.mocked(listSourceRuns)).not.toHaveBeenCalled();
  });

  it("returns 503 db_error when the query fails", async () => {
    vi.mocked(listSourceRuns).mockRejectedValue(new Error("db down"));
    const res = await worker.fetch(authedReq("/app/ingest-runs"), makeEnv(), ctx);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("requires auth (401 without bearer)", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/app/ingest-runs"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /app/ingest-runs/:id", () => {
  it("returns the detail in an { ok, data } envelope", async () => {
    vi.mocked(getSourceRunDetail).mockResolvedValue({
      run: RUN_SUMMARY,
      rawListingCount: 4,
      normalizedListingCount: 3,
      filteredOutByReason: { missing_identifier: 1 },
      valuationMissByReason: { trim_missing: 2 },
      schemaDriftByType: {},
      createdLeadCount: 0,
      createdLeadIds: [],
      listings: [],
    });
    const res = await worker.fetch(
      authedReq("/app/ingest-runs/11111111-1111-1111-1111-111111111111"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { rawListingCount: number } };
    expect(body.ok).toBe(true);
    expect(body.data.rawListingCount).toBe(4);
    expect(vi.mocked(getSourceRunDetail).mock.calls[0]![1]).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("returns 404 not_found when the run does not exist", async () => {
    vi.mocked(getSourceRunDetail).mockResolvedValue(null);
    const res = await worker.fetch(authedReq("/app/ingest-runs/missing-id"), makeEnv(), ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("returns 503 db_error when detail query fails", async () => {
    vi.mocked(getSourceRunDetail).mockRejectedValue(new Error("db down"));
    const res = await worker.fetch(authedReq("/app/ingest-runs/x"), makeEnv(), ctx);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("db_error");
  });
});

// ── GET /app/opportunities ────────────────────────────────────────────────────

const OPPORTUNITY_ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  type: "lead" as const,
  badges: ["First seen"],
  source: "facebook",
  region: "dallas_tx",
  sourceRunId: "11111111-1111-1111-1111-111111111111",
  normalizedListingId: "22222222-2222-2222-2222-222222222222",
  vehicleCandidateId: null,
  leadId: "33333333-3333-3333-3333-333333333333",
  title: "2019 Ford F-150",
  year: 2019,
  make: "Ford",
  model: "F-150",
  style: "XLT",
  vin: "1FT8W3BT1SEC27066",
  price: 25000,
  mmrValue: 28000,
  spread: 3000,
  finalScore: 72,
  grade: "good",
  status: "new",
  submittedBy: null,
  assignedTo: null,
  assignedCloserName: null,
  claimedBy: null,
  claimedAt: null,
  claimExpiresAt: null,
  lastEvaluatedBy: null,
  lastEvaluatedAt: null,
  firstSeenAt: "2026-05-20T10:00:00.000Z",
  lastSeenAt: "2026-05-21T10:00:00.000Z",
  seenCount: 1,
  listingUrl: "https://example.com/listing/1",
  entryMethod: null,
  estimateFlags: { mileage: false, style: false, mmr: false },
  maxbuySummary: null,
};

describe("GET /app/opportunities", () => {
  it("returns the opportunity list in an { ok, data } envelope", async () => {
    vi.mocked(listOpportunities).mockResolvedValue({
      items: [OPPORTUNITY_ROW],
      total: 1,
      offset: 0,
    });
    const res = await worker.fetch(authedReq("/app/opportunities"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([OPPORTUNITY_ROW]);
  });

  it("returns a paginated envelope when offset/sort/view params are present", async () => {
    vi.mocked(listOpportunities).mockResolvedValue({
      items: [OPPORTUNITY_ROW],
      total: 42,
      offset: 10,
    });
    const res = await worker.fetch(
      authedReq("/app/opportunities?offset=10&limit=20&sort=spread_desc&view=all"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { items: unknown[]; total: number; offset: number };
    };
    expect(body.data.total).toBe(42);
    expect(body.data.offset).toBe(10);
    expect(body.data.items).toEqual([OPPORTUNITY_ROW]);
    expect(vi.mocked(listOpportunities).mock.calls[0]![1]).toMatchObject({
      offset: 10,
      limit: 20,
      sort: "spread_desc",
      view: "all",
    });
  });

  it("passes valid filters through", async () => {
    vi.mocked(listOpportunities).mockResolvedValue({ items: [], total: 0, offset: 0 });
    await worker.fetch(
      authedReq("/app/opportunities?source=facebook&region=dallas_tx&type=lead&grade=good&status=new"),
      makeEnv(),
      ctx,
    );
    expect(vi.mocked(listOpportunities).mock.calls[0]![1]).toMatchObject({
      source: "facebook",
      region: "dallas_tx",
      type: "lead",
      grade: "good",
      status: "new",
    });
  });

  it("requires user identity for view=mine", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(null);
    const res = await worker.fetch(
      authedReq("/app/opportunities?view=mine&offset=0"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(vi.mocked(listOpportunities)).not.toHaveBeenCalled();
  });

  it("rejects an invalid filter with 400 invalid_filter", async () => {
    const res = await worker.fetch(
      authedReq("/app/opportunities?type=bogus"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(vi.mocked(listOpportunities)).not.toHaveBeenCalled();
  });

  it("rejects an invalid sort with 400 invalid_filter", async () => {
    const res = await worker.fetch(
      authedReq("/app/opportunities?sort=price_asc"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(vi.mocked(listOpportunities)).not.toHaveBeenCalled();
  });

  it("returns 503 db_error when the query fails", async () => {
    vi.mocked(listOpportunities).mockRejectedValue(new Error("db down"));
    const res = await worker.fetch(authedReq("/app/opportunities"), makeEnv(), ctx);
    expect(res.status).toBe(503);
  });
});

describe("GET /app/opportunities/:id", () => {
  it("returns opportunity detail", async () => {
    vi.mocked(getOpportunityDetail).mockResolvedValue({
      ...OPPORTUNITY_ROW,
      reasonCodes: ["strong_spread"],
      valuationMissingReason: null,
      scoreComponents: null,
      candidateListingCount: 1,
      mileage: 45000,
      actions: [],
    });
    const res = await worker.fetch(
      authedReq("/app/opportunities/22222222-2222-2222-2222-222222222222"),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { id: string } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(OPPORTUNITY_ROW.id);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(getOpportunityDetail).mockResolvedValue(null);
    const res = await worker.fetch(authedReq("/app/opportunities/missing"), makeEnv(), ctx);
    expect(res.status).toBe(404);
  });
});

describe("GET /app/me", () => {
  it("returns the resolved user profile", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue({
      id: "user-1",
      email: "alice@texasautovalue.com",
      displayName: "Alice Adams",
      role: "closer",
      isActive: true,
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
    });
    const res = await worker.fetch(
      authedReq("/app/me", {
        headers: { "X-TAV-Authenticated-User-Email": "alice@texasautovalue.com" },
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { email: string; role: string } };
    expect(body.ok).toBe(true);
    expect(body.data.email).toBe("alice@texasautovalue.com");
    expect(body.data.role).toBe("closer");
  });

  it("returns 401 when identity headers are missing", async () => {
    const res = await worker.fetch(authedReq("/app/me"), makeEnv(), ctx);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("user_required");
  });
});

describe("GET /app/users", () => {
  it("returns active users for assignment pickers", async () => {
    vi.mocked(listActiveUsers).mockResolvedValue([
      {
        id: "user-1",
        email: "alice@texasautovalue.com",
        displayName: "Alice Adams",
        role: "admin",
      },
    ]);
    const res = await worker.fetch(authedReq("/app/users"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: Array<{ id: string }> };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe("user-1");
  });
});

describe("POST /app/opportunities/manual", () => {
  const submitter = {
    id: "user-1",
    email: "alice@texasautovalue.com",
    displayName: "Alice Adams",
    role: "closer" as const,
    isActive: true,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  };

  it("creates a manual submission for an authenticated user", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(submitter);
    vi.mocked(submitManualOpportunity).mockResolvedValue({
      submissionId: "submission-1",
      normalizedListingId: "listing-1",
      isDuplicateUrl: false,
      warnings: [],
      opportunity: null,
    });

    const res = await worker.fetch(
      authedPost("/app/opportunities/manual", {
        listingUrl: "https://facebook.com/marketplace/item/123",
        region: "dallas_tx",
        year: 2020,
        make: "toyota",
        model: "camry",
        price: 15000,
      }),
      makeEnv(),
      ctx,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; data: { submissionId: string } };
    expect(body.ok).toBe(true);
    expect(body.data.submissionId).toBe("submission-1");
  });

  it("returns 401 when identity is missing", async () => {
    const res = await worker.fetch(
      authedPost("/app/opportunities/manual", {
        listingUrl: "https://facebook.com/marketplace/item/123",
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(submitter);
    const res = await worker.fetch(
      authedReq("/app/opportunities/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for validation errors from the submission layer", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(submitter);
    vi.mocked(submitManualOpportunity).mockRejectedValue(
      new ManualSubmissionValidationError("unsupported_listing_url", "bad url"),
    );
    const res = await worker.fetch(
      authedPost("/app/opportunities/manual", {
        listingUrl: "https://example.com/car/1",
        region: "dallas_tx",
        year: 2020,
        make: "toyota",
        model: "camry",
        price: 15000,
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("unsupported_listing_url");
  });

  it("returns 400 when required manual submit fields are missing", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(submitter);
    const res = await worker.fetch(
      authedPost("/app/opportunities/manual", {
        listingUrl: "https://facebook.com/marketplace/item/123",
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("validation_error");
    expect(vi.mocked(submitManualOpportunity)).not.toHaveBeenCalled();
  });

  it("returns 409 when the listing URL already exists", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(submitter);
    vi.mocked(submitManualOpportunity).mockRejectedValue(
      new ManualSubmissionValidationError("duplicate_listing_url", "duplicate", {
        normalizedListingId: "listing-existing",
      }),
    );
    const res = await worker.fetch(
      authedPost("/app/opportunities/manual", {
        listingUrl: "https://facebook.com/marketplace/item/existing",
        region: "dallas_tx",
        year: 2020,
        make: "toyota",
        model: "camry",
        price: 15000,
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      details?: { normalizedListingId: string };
    };
    expect(body.error).toBe("duplicate_listing_url");
    expect(body.details?.normalizedListingId).toBe("listing-existing");
  });
});

describe("POST /app/opportunities/parse", () => {
  const submitter = {
    id: "user-1",
    email: "alice@texasautovalue.com",
    displayName: "Alice Adams",
    role: "closer" as const,
    isActive: true,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  };

  it("returns 503 when parse is disabled", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(submitter);
    const res = await worker.fetch(
      authedPost("/app/opportunities/parse", {
        listingUrl: "https://www.facebook.com/marketplace/item/123",
      }),
      makeEnv({ OPPORTUNITIES_PARSE_ENABLED: "false" }),
      ctx,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("parse_disabled");
  });

  it("returns parsed fields when enabled", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(submitter);
    vi.mocked(parseListingUrl).mockResolvedValue({
      ok: true,
      data: {
        listingUrl: "https://www.facebook.com/marketplace/item/123",
        source: "facebook",
        year: 2019,
        make: "toyota",
        model: "camry",
        price: 18500,
        mileage: 62000,
        warnings: [],
      },
    });

    const res = await worker.fetch(
      authedPost("/app/opportunities/parse", {
        listingUrl: "https://www.facebook.com/marketplace/item/123",
      }),
      makeEnv({ OPPORTUNITIES_PARSE_ENABLED: "true" }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { make: string } };
    expect(body.ok).toBe(true);
    expect(body.data.make).toBe("toyota");
  });

  it("returns 401 when identity is missing", async () => {
    const res = await worker.fetch(
      authedPost("/app/opportunities/parse", {
        listingUrl: "https://www.facebook.com/marketplace/item/123",
      }),
      makeEnv({ OPPORTUNITIES_PARSE_ENABLED: "true" }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("returns parse failure payload without throwing", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(submitter);
    vi.mocked(parseListingUrl).mockResolvedValue({
      ok: false,
      error: "fetch_failed",
      warnings: [],
    });

    const res = await worker.fetch(
      authedPost("/app/opportunities/parse", {
        listingUrl: "https://www.facebook.com/marketplace/item/123",
      }),
      makeEnv({ OPPORTUNITIES_PARSE_ENABLED: "true" }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("fetch_failed");
  });
});

describe("POST /app/opportunities/:id/status", () => {
  const closer = {
    id: "user-1",
    email: "alice@texasautovalue.com",
    displayName: "Alice Adams",
    role: "closer" as const,
    isActive: true,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  };

  it("updates workflow status for an authenticated closer", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(closer);
    vi.mocked(updateOpportunityStatus).mockResolvedValue({
      ...OPPORTUNITY_ROW,
      status: "reviewed",
      reasonCodes: [],
      valuationMissingReason: null,
      scoreComponents: null,
      candidateListingCount: null,
      mileage: 45000,
      actions: [],
    });

    const res = await worker.fetch(
      authedPost("/app/opportunities/listing-1/status", { status: "reviewed" }),
      makeEnv(),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(updateOpportunityStatus)).toHaveBeenCalledWith(
      expect.anything(),
      "listing-1",
      closer,
      "reviewed",
    );
  });

  it("returns 401 when identity is missing", async () => {
    const res = await worker.fetch(
      authedPost("/app/opportunities/listing-1/status", { status: "reviewed" }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid status values", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(closer);
    const res = await worker.fetch(
      authedPost("/app/opportunities/listing-1/status", { status: "claimed" }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe("invalid_status");
  });

  it("maps workflow errors to HTTP status codes", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(closer);
    vi.mocked(updateOpportunityStatus).mockRejectedValue(
      new OpportunityWorkflowError("forbidden", "Viewers cannot change opportunity workflow"),
    );

    const res = await worker.fetch(
      authedPost("/app/opportunities/listing-1/status", { status: "passed" }),
      makeEnv(),
      ctx,
    );

    expect(res.status).toBe(403);
  });
});

describe("POST /app/opportunities/:id/notes", () => {
  const closer = {
    id: "user-1",
    email: "alice@texasautovalue.com",
    displayName: "Alice Adams",
    role: "closer" as const,
    isActive: true,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  };

  it("adds a note for an authenticated closer", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(closer);
    vi.mocked(addOpportunityNote).mockResolvedValue({
      ...OPPORTUNITY_ROW,
      reasonCodes: [],
      valuationMissingReason: null,
      scoreComponents: null,
      candidateListingCount: null,
      mileage: 45000,
      actions: [
        {
          id: "action-1",
          normalizedListingId: OPPORTUNITY_ROW.id,
          actorUserId: closer.id,
          actorName: closer.displayName,
          action: "note_added",
          notes: "Seller wants a callback",
          metadata: {},
          createdAt: "2026-05-23T00:00:00.000Z",
        },
      ],
    });

    const res = await worker.fetch(
      authedPost("/app/opportunities/listing-1/notes", { note: "Seller wants a callback" }),
      makeEnv(),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(addOpportunityNote)).toHaveBeenCalledWith(
      expect.anything(),
      "listing-1",
      closer,
      "Seller wants a callback",
      undefined,
    );
  });

  it("forwards maxbuy_recommendation_id in note metadata", async () => {
    const recId = "22222222-2222-2222-2222-222222222222";
    vi.mocked(resolveAppUser).mockResolvedValue(closer);
    vi.mocked(addOpportunityNote).mockResolvedValue({
      ...OPPORTUNITY_ROW,
      reasonCodes: [],
      valuationMissingReason: null,
      scoreComponents: null,
      candidateListingCount: null,
      mileage: 45000,
      actions: [],
    });

    const res = await worker.fetch(
      authedPost("/app/opportunities/listing-1/notes", {
        note: "Max buy work item",
        maxbuy_recommendation_id: recId,
      }),
      makeEnv(),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(addOpportunityNote)).toHaveBeenCalledWith(
      expect.anything(),
      "listing-1",
      closer,
      "Max buy work item",
      { maxbuy_recommendation_id: recId },
    );
  });

  it("returns 400 for empty notes", async () => {
    vi.mocked(resolveAppUser).mockResolvedValue(closer);
    const res = await worker.fetch(
      authedPost("/app/opportunities/listing-1/notes", { note: "   " }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(400);
  });
});

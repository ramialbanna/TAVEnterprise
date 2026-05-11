import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";
import { listImportBatches } from "../src/persistence/importBatches";

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

beforeEach(() => {
  dbState.throwOnInit = false;
  dbState.tables = {};
  vi.clearAllMocks();
  vi.mocked(listImportBatches).mockReset();
  vi.mocked(listImportBatches).mockResolvedValue([]);
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
  it("returns 200 with db.ok=true and source health when DB is reachable", async () => {
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
        staleSweep: { lastRunAt: null; missingReason: string };
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
    expect(body.data.staleSweep.lastRunAt).toBeNull();
    expect(body.data.staleSweep.missingReason).toBe("not_persisted");
  });

  it("still returns 200 with db.ok=false when the DB query errors", async () => {
    dbState.tables.v_source_health = { error: { message: "boom" } };
    const res = await worker.fetch(authedReq("/app/system-status"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { db: { ok: boolean; missingReason?: string }; sources: unknown[] };
    };
    expect(body.ok).toBe(true);
    expect(body.data.db.ok).toBe(false);
    expect(body.data.db.missingReason).toBe("db_error");
    expect(body.data.sources).toEqual([]);
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
    dbState.tables.v_outcome_summary = {
      data: [{ region: "dallas", total_outcomes: 12, avg_gross_profit: 1500 }],
    };
    dbState.tables.purchase_outcomes = { count: 12 };
    dbState.tables.leads = { count: 47 };
    dbState.tables.normalized_listings = { count: 880 };

    const res = await worker.fetch(authedReq("/app/kpis"), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: {
        outcomes: { value: { totalOutcomes: number; byRegion: unknown[] } | null; missingReason: string | null };
        leads: { value: { total: number } | null; missingReason: string | null };
        listings: { value: { normalizedTotal: number } | null; missingReason: string | null };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data.outcomes.missingReason).toBeNull();
    expect(body.data.outcomes.value).toEqual({
      totalOutcomes: 12,
      byRegion: [{ region: "dallas", total_outcomes: 12, avg_gross_profit: 1500 }],
    });
    expect(body.data.leads.value).toEqual({ total: 47 });
    expect(body.data.listings.value).toEqual({ normalizedTotal: 880 });
  });

  it("degrades a failing block to { value: null, missingReason } without failing the request", async () => {
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

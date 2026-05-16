/**
 * GET/POST /app/* — product API consumed by the TAV-owned frontend/dashboard.
 *
 * Auth: Bearer APP_API_SECRET (distinct from ADMIN_API_SECRET — the frontend
 * never holds an ops-grade credential). Unconfigured → 503, bad token → 401.
 *
 * Contract notes:
 *   - Every metric that cannot be computed is returned as `null` with a sibling
 *     `missingReason` string — the frontend never receives a fabricated number.
 *   - `GET /app/system-status` always returns 200; it *reports* unhealthy state
 *     in the body rather than failing the request.
 *   - This module never touches /ingest, /admin, or /health behaviour.
 *
 * Implemented here: GET /app/system-status, GET /app/kpis, GET /app/import-batches,
 * GET /app/historical-sales, POST /app/mmr/vin.
 * (See docs/adr/0002-frontend-app-api-layer.md for the full contract.)
 */
import { z } from "zod";
import type { Env } from "../types/env";
import { getSupabaseClient } from "../persistence/supabase";
import { listImportBatches } from "../persistence/importBatches";
import { listHistoricalSales } from "../persistence/historicalSales";
import type { HistoricalSalesFilter } from "../persistence/historicalSales";
import { getLastCronRun } from "../persistence/cronRuns";
import {
  getMmrValueFromWorker,
  WorkerTimeoutError,
  WorkerRateLimitError,
  WorkerUnavailableError,
} from "../valuation/workerClient";
import { isConfiguredSecret } from "../types/envValidation";
import { verifyBearer } from "../auth/bearerAuth";
import { log, serializeError } from "../logging/logger";
import { VERSION } from "../version";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

/**
 * Body schema for POST /app/mmr/vin. Deliberately narrower than the intelligence
 * layer's MmrVinLookupRequestSchema — the frontend supplies only the lookup key,
 * never `force_refresh` or requester identity (those are intel-worker internal).
 */
const AppMmrVinRequestSchema = z.object({
  vin: z.string().trim().min(11).max(17),
  year: z.number().int().min(1900).max(2100).optional(),
  mileage: z.number().int().nonnegative().max(2_000_000).optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Parse a `?limit` query param: default 20, clamp to 100. Anything that is not
 * a positive integer (missing, empty, zero, negative, fractional, non-numeric)
 * falls back to the default.
 */
function parseLimitParam(raw: string | null): number {
  if (raw === null) return DEFAULT_LIST_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(n, MAX_LIST_LIMIT);
}

function verifyAppAuth(request: Request, env: Env): boolean {
  return verifyBearer(request, env.APP_API_SECRET);
}

export async function handleApp(request: Request, env: Env): Promise<Response> {
  if (!isConfiguredSecret(env.APP_API_SECRET)) {
    return json({ ok: false, error: "app_auth_not_configured" }, 503);
  }
  if (!verifyAppAuth(request, env)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    if (request.method === "GET" && pathname === "/app/system-status") {
      return await handleSystemStatus(env);
    }
    if (request.method === "GET" && pathname === "/app/kpis") {
      return await handleKpis(env);
    }
    if (request.method === "GET" && pathname === "/app/import-batches") {
      return await handleImportBatches(env, url);
    }
    if (request.method === "GET" && pathname === "/app/historical-sales") {
      return await handleHistoricalSales(env, url);
    }
    if (request.method === "POST" && pathname === "/app/mmr/vin") {
      return await handleMmrVin(request, env);
    }
    return json({ ok: false, error: "not_found" }, 404);
  } catch (err) {
    log("app.error", {
      method: request.method,
      pathname,
      stage: "route_handler",
      error: serializeError(err),
    });
    return json({ ok: false, error: "internal_error" }, 503);
  }
}

/** `staleSweep` block of GET /app/system-status. */
type StaleSweepBlock =
  | { lastRunAt: string; status: "ok" | "failed"; updated: number | null }
  | { lastRunAt: null; missingReason: "never_run" | "db_error" };

/**
 * GET /app/system-status — health snapshot for the dashboard header.
 * Always 200. Reports DB connectivity, intelligence-worker wiring, recent
 * source-run health, and the last daily stale-sweep run (from tav.cron_runs).
 */
async function handleSystemStatus(env: Env): Promise<Response> {
  const intelWorker = {
    mode: env.MANHEIM_LOOKUP_MODE === "worker" ? "worker" : "direct",
    binding: env.INTEL_WORKER !== undefined,
    url: env.INTEL_WORKER_URL || null,
  };

  let client: ReturnType<typeof getSupabaseClient> | null = null;
  try {
    client = getSupabaseClient(env);
  } catch (err) {
    log("app.system_status.client_init_failed", { error: serializeError(err) });
    client = null;
  }

  let db: { ok: true } | { ok: false; missingReason: string };
  let sources: unknown[] = [];
  let staleSweep: StaleSweepBlock;

  if (client === null) {
    db = { ok: false, missingReason: "db_error" };
    staleSweep = { lastRunAt: null, missingReason: "db_error" };
  } else {
    try {
      const { data, error } = await client.from("v_source_health").select("*");
      if (error) throw error;
      db = { ok: true };
      sources = data ?? [];
    } catch (err) {
      log("app.system_status.db_unavailable", { error: serializeError(err) });
      db = { ok: false, missingReason: "db_error" };
    }

    // Last stale-sweep run — independent of the v_source_health query above.
    try {
      const last = await getLastCronRun(client, "stale_sweep");
      if (last === null) {
        staleSweep = { lastRunAt: null, missingReason: "never_run" };
      } else {
        const updated = typeof last.detail.updated === "number" ? last.detail.updated : null;
        staleSweep = { lastRunAt: last.finishedAt ?? last.startedAt, status: last.status, updated };
      }
    } catch (err) {
      log("app.system_status.stale_sweep_unavailable", { error: serializeError(err) });
      staleSweep = { lastRunAt: null, missingReason: "db_error" };
    }
  }

  return json({
    ok: true,
    data: {
      service: "tav-enterprise",
      version: VERSION,
      timestamp: new Date().toISOString(),
      db,
      intelWorker,
      sources,
      staleSweep,
    },
  });
}

/** A metric block: a computed value, or `null` with a `missingReason`. */
interface MetricBlock<T> {
  value: T | null;
  missingReason: string | null;
}

async function block<T>(name: string, fn: () => Promise<T>): Promise<MetricBlock<T>> {
  try {
    return { value: await fn(), missingReason: null };
  } catch (err) {
    log("app.kpis.block_failed", { block: name, error: serializeError(err) });
    return { value: null, missingReason: "db_error" };
  }
}

/**
 * GET /app/kpis — product KPIs sourced from Supabase.
 *
 * `outcomes.value` carries the global rollup from tav.v_outcome_summary_global
 * (a single-row view — a true global AVG, not a mean of per-region means) plus
 * the honest per-region breakdown in `byRegion` from tav.v_outcome_summary. Any
 * aggregate that is NULL in the view (e.g. empty `purchase_outcomes`) is passed
 * through as `null`, never fabricated.
 *
 * `sell_through_rate` exists in those views but is deliberately *not* surfaced
 * here: `tav.purchase_outcomes` currently holds only sold/imported outcome rows
 * (every row has a `sale_price`), so the ratio is tautologically 1.0. A real
 * sell-through metric needs acquisition-time `purchase_outcomes` rows written
 * before resale — see docs/followups.md.
 *
 * Returns 503 only if the Supabase client itself cannot be constructed;
 * individual KPI blocks degrade to `{ value: null, missingReason }`.
 */
async function handleKpis(env: Env): Promise<Response> {
  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.kpis.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  const outcomes = await block("outcomes", async () => {
    const { data: globalRows, error: globalErr } = await db
      .from("v_outcome_summary_global")
      .select("*");
    if (globalErr) throw globalErr;
    const { data: regionRows, error: regionErr } = await db
      .from("v_outcome_summary")
      .select("*");
    if (regionErr) throw regionErr;
    // v_outcome_summary_global has no GROUP BY → always exactly one row.
    const g = (globalRows?.[0] ?? {}) as Record<string, unknown>;
    return {
      totalOutcomes: (g.total_outcomes as number | null) ?? 0,
      avgGrossProfit: (g.avg_gross_profit as number | null) ?? null,
      avgHoldDays: (g.avg_hold_days as number | null) ?? null,
      lastOutcomeAt: (g.last_outcome_at as string | null) ?? null,
      byRegion: regionRows ?? [],
    };
  });

  const leads = await block("leads", async () => {
    const { count, error } = await db
      .from("leads")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    return { total: count ?? 0 };
  });

  const listings = await block("listings", async () => {
    const { count, error } = await db
      .from("normalized_listings")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    return { normalizedTotal: count ?? 0 };
  });

  return json({
    ok: true,
    data: {
      generatedAt: new Date().toISOString(),
      outcomes,
      leads,
      listings,
    },
  });
}

/**
 * GET /app/import-batches?limit=N — recent outcome-import batches, newest first.
 *
 * Thin read wrapper over persistence/importBatches.listImportBatches. `limit`
 * defaults to 20 and is clamped to 100; an invalid limit falls back to 20.
 * Returns 503 `db_error` if the Supabase client cannot be constructed or the
 * query fails.
 */
async function handleImportBatches(env: Env, url: URL): Promise<Response> {
  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.import_batches.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  const limit = parseLimitParam(url.searchParams.get("limit"));

  try {
    const data = await listImportBatches(db, limit);
    return json({ ok: true, data });
  } catch (err) {
    log("app.import_batches.query_failed", { limit, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * GET /app/historical-sales?limit=N&year=&make=&model=&since= — historical
 * sales, newest sale first.
 *
 * Thin read wrapper over persistence/historicalSales.listHistoricalSales.
 * `limit` defaults to 20 and is clamped to 100; an invalid limit falls back to
 * 20. `year` is included only if it parses to a finite number; `make`/`model`/
 * `since` are passed through verbatim (exact-match; `since` → `sale_date >=`).
 * Returns 503 `db_error` if the Supabase client cannot be constructed or the
 * query fails.
 */
async function handleHistoricalSales(env: Env, url: URL): Promise<Response> {
  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.historical_sales.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  const filter: HistoricalSalesFilter = {
    limit: parseLimitParam(url.searchParams.get("limit")),
  };
  const yearRaw = url.searchParams.get("year");
  if (yearRaw !== null) {
    const year = Number(yearRaw);
    if (Number.isFinite(year)) filter.year = year;
  }
  const make = url.searchParams.get("make");
  if (make !== null) filter.make = make;
  const model = url.searchParams.get("model");
  if (model !== null) filter.model = model;
  const since = url.searchParams.get("since");
  if (since !== null) filter.since = since;

  try {
    const data = await listHistoricalSales(db, filter);
    return json({ ok: true, data });
  } catch (err) {
    log("app.historical_sales.query_failed", { filter, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * POST /app/mmr/vin — on-demand MMR valuation by VIN, proxied to
 * tav-intelligence-worker via valuation/workerClient.getMmrValueFromWorker
 * (which already picks Service-Binding vs public-fetch transport).
 *
 * Body: { vin: string (11–17 chars), year?: number, mileage?: number }.
 * Malformed JSON or body → 400. Otherwise always 200 — an unavailable /
 * rate-limited / timed-out / unconfigured intelligence worker, or a worker
 * response with no value, is reported non-blockingly as
 * `{ ok: true, data: { mmrValue: null, missingReason: "<code>" } }`.
 */
async function handleMmrVin(request: Request, env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = AppMmrVinRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.slice(0, 5) }, 400);
  }
  const { vin, year, mileage } = parsed.data;

  // The intelligence worker can be reached over a public URL (`INTEL_WORKER_URL`) or a
  // Cloudflare Service Binding (`INTEL_WORKER`). Production runs binding-only with no
  // public URL (`workers_dev = false`); guarding on the URL alone misclassified that
  // configuration as "not configured". Treat as configured if either path is present.
  if (!env.INTEL_WORKER_URL && env.INTEL_WORKER === undefined) {
    return json({ ok: true, data: { mmrValue: null, missingReason: "intel_worker_not_configured" } });
  }

  try {
    const result = await getMmrValueFromWorker(
      {
        vin,
        ...(year !== undefined && { year }),
        ...(mileage !== undefined && { mileage }),
      },
      env,
    );

    if (result === null) {
      // negative cache, insufficient params, or unparseable envelope — non-blocking
      return json({ ok: true, data: { mmrValue: null, missingReason: "no_mmr_value" } });
    }

    return json({
      ok: true,
      data: {
        mmrValue: result.mmrValue,
        confidence: result.confidence,
        method: result.method ?? null,
      },
    });
  } catch (err) {
    let missingReason: string;
    if (err instanceof WorkerTimeoutError) missingReason = "intel_worker_timeout";
    else if (err instanceof WorkerRateLimitError) missingReason = "intel_worker_rate_limited";
    else if (err instanceof WorkerUnavailableError) missingReason = "intel_worker_unavailable";
    else throw err; // unexpected — let handleApp's catch surface it as 503 internal_error
    log("app.mmr_vin.worker_error", { missingReason, error: serializeError(err) });
    return json({ ok: true, data: { mmrValue: null, missingReason } });
  }
}

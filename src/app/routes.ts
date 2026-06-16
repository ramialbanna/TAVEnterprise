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
 * GET /app/historical-sales, POST /app/mmr/vin, GET /app/ingest-runs,
 * GET /app/ingest-runs/:id, GET /app/opportunities, GET /app/opportunities/:id,
 * GET /app/me, GET /app/users, POST /app/opportunities/parse,
 * POST /app/opportunities/manual,
 * POST /app/opportunities/:id/assign, POST /app/opportunities/:id/claim,
 * POST /app/opportunities/:id/evaluate, POST /app/opportunities/:id/status,
 * POST /app/opportunities/:id/notes.
 * POST /app/maxbuy/evaluate, POST /app/maxbuy/overrides, POST /app/maxbuy/passes,
 * GET /app/maxbuy/recommendations/:id.
 * (See docs/01-architecture/adr/0002-frontend-app-api-layer.md for the full contract.)
 */
import { z } from "zod";
import type { Env } from "../types/env";
import { getSupabaseClient } from "../persistence/supabase";
import { listImportBatches } from "../persistence/importBatches";
import { listHistoricalSales } from "../persistence/historicalSales";
import type { HistoricalSalesFilter } from "../persistence/historicalSales";
import { getLastCronRun } from "../persistence/cronRuns";
import { listSourceRuns, getSourceRunDetail } from "../persistence/ingestRuns";
import type { IngestRunListFilter } from "../persistence/ingestRuns";
import { listOpportunities, getOpportunityDetail } from "../persistence/opportunities";
import type { OpportunityListFilter, OpportunityType, OpportunitySort, OpportunityView } from "../persistence/opportunities";
import { listActiveUsers } from "../persistence/users";
import { resolveAppUser } from "../auth/resolveAppUser";
import type { AppUser } from "../persistence/users";
import {
  submitManualOpportunity,
  ManualSubmissionValidationError,
} from "../persistence/manualOpportunities";
import { parseListingUrl } from "../intake/parseListingUrl";
import { ManualOpportunitySubmissionSchema } from "../manual/manualSubmissionSchema";
import {
  assignOpportunity,
  claimOpportunity,
  recordOpportunityEvaluation,
  updateOpportunityStatus,
  addOpportunityNote,
  normalizeMutatableWorkflowStatus,
  OpportunityWorkflowError,
} from "../persistence/opportunityWorkflow";
import { SOURCE_NAMES } from "../validate";
import { REGION_KEYS } from "../types/domain";
import { classifyIntelHttpError } from "../valuation/workerClient";
import { MmrLookupAdjustmentsSchema, MmrResponseEnvelopeSchema } from "../types/intelligence";
import type { MmrResponseEnvelope } from "../types/intelligence";
import { extractManheimAdjustmentBreakdown, extractManheimDistribution } from "../valuation/manheimResponseParser";
import { extractManheimMarketContext } from "../valuation/manheimMarketContextParser";
import { extractManheimVehicleIdentity } from "../valuation/manheimVehicleIdentityParser";
import { selectMmrPayloadItem } from "../valuation/manheimPayloadItem";
import { isConfiguredSecret } from "../types/envValidation";
import { verifyBearer } from "../auth/bearerAuth";
import { handleMaxbuyAppRoute, maxbuySystemStatus, fireMaxbuyEvaluateBackground } from "./maxbuyProxy";
import { MAXBUY_CONTRACT_VERSION } from "../maxbuy/api/schemas";
import { log, serializeError } from "../logging/logger";
import { VERSION } from "../version";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const INTEL_SERVICE_BINDING_BASE = "https://tav-intelligence-worker.internal";

/**
 * Body schema for POST /app/mmr/vin. Deliberately narrower than the intelligence
 * layer's MmrVinLookupRequestSchema — the frontend supplies only the lookup key,
 * never `force_refresh` or requester identity (those are intel-worker internal).
 */
const AppMmrVinRequestSchema = z.object({
  vin: z.string().trim().min(11).max(17),
  year: z.number().int().min(1900).max(2100).optional(),
  mileage: z.number().int().nonnegative().max(2_000_000).optional(),
  adjustments: MmrLookupAdjustmentsSchema.optional(),
});
const AppMmrYmmRequestSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  make: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(128),
  style: z.string().trim().min(1).max(128),
  mileage: z.number().int().nonnegative().max(2_000_000).optional(),
  adjustments: MmrLookupAdjustmentsSchema.optional(),
});
const IntelCatalogEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(z.string()),
    catalogState: z.enum(["connected", "not_connected"]),
    cached: z.boolean(),
    reason: z.string().nullable(),
  }),
});
const IntelMmrEnvelopeSchema = z.object({
  success: z.literal(true),
  data: MmrResponseEnvelopeSchema,
});

const ParseListingUrlSchema = z.object({
  listingUrl: z.string().trim().min(1).max(2048),
});

const AssignOpportunitySchema = z.object({
  assignedToUserId: z.string().uuid().nullable(),
});

const UpdateOpportunityStatusSchema = z.object({
  status: z.string().trim().min(1).max(32),
});

const AddOpportunityNoteSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  maxbuy_recommendation_id: z.string().uuid().optional(),
});

const OPPORTUNITY_ACTION_RE = /^\/app\/opportunities\/([^/]+)\/(assign|claim|evaluate|status|notes)$/;

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
function parseOffsetParam(raw: string | null): number {
  if (raw === null) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

function parseLimitParam(raw: string | null): number {
  if (raw === null) return DEFAULT_LIST_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(n, MAX_LIST_LIMIT);
}

function verifyAppAuth(request: Request, env: Env): boolean {
  return verifyBearer(request, env.APP_API_SECRET);
}

export async function handleApp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    if (request.method === "POST" && pathname === "/app/mmr/ymm") {
      return await handleMmrYmm(request, env);
    }
    if (request.method === "GET" && pathname === "/app/mmr/catalog/years") {
      return await handleMmrCatalog(env, "/catalog/years");
    }
    if (request.method === "GET" && pathname === "/app/mmr/catalog/makes") {
      const year = url.searchParams.get("year");
      return await handleMmrCatalog(env, year ? `/catalog/years/${encodeURIComponent(year)}/makes` : null);
    }
    if (request.method === "GET" && pathname === "/app/mmr/catalog/models") {
      const year = url.searchParams.get("year");
      const make = url.searchParams.get("make");
      return await handleMmrCatalog(
        env,
        year && make
          ? `/catalog/years/${encodeURIComponent(year)}/makes/${encodeURIComponent(make)}/models`
          : null,
      );
    }
    if (request.method === "GET" && pathname === "/app/mmr/catalog/styles") {
      const year = url.searchParams.get("year");
      const make = url.searchParams.get("make");
      const model = url.searchParams.get("model");
      return await handleMmrCatalog(
        env,
        year && make && model
          ? `/catalog/years/${encodeURIComponent(year)}` +
            `/makes/${encodeURIComponent(make)}` +
            `/models/${encodeURIComponent(model)}/styles`
          : null,
      );
    }
    if (request.method === "GET" && pathname === "/app/ingest-runs") {
      return await handleIngestRunsList(env, url);
    }
    if (request.method === "GET" && pathname.startsWith("/app/ingest-runs/")) {
      const id = decodeURIComponent(pathname.slice("/app/ingest-runs/".length));
      return await handleIngestRunDetail(env, id);
    }
    if (request.method === "GET" && pathname === "/app/me") {
      return await handleMe(request, env);
    }
    if (request.method === "GET" && pathname === "/app/users") {
      return await handleUsersList(env);
    }
    if (request.method === "GET" && pathname === "/app/opportunities") {
      return await handleOpportunitiesList(request, env, url);
    }
    const opportunityActionMatch = pathname.match(OPPORTUNITY_ACTION_RE);
    if (request.method === "POST" && opportunityActionMatch) {
      const id = opportunityActionMatch[1];
      const action = opportunityActionMatch[2];
      if (!id || !action) {
        return json({ ok: false, error: "not_found" }, 404);
      }
      if (action === "assign") {
        return await handleOpportunityAssign(request, env, decodeURIComponent(id));
      }
      if (action === "claim") {
        return await handleOpportunityClaim(request, env, decodeURIComponent(id));
      }
      if (action === "evaluate") {
        return await handleOpportunityEvaluate(request, env, decodeURIComponent(id));
      }
      if (action === "status") {
        return await handleOpportunityStatus(request, env, decodeURIComponent(id));
      }
      if (action === "notes") {
        return await handleOpportunityNotes(request, env, decodeURIComponent(id));
      }
      return json({ ok: false, error: "not_found" }, 404);
    }
    if (request.method === "GET" && pathname.startsWith("/app/opportunities/")) {
      const id = decodeURIComponent(pathname.slice("/app/opportunities/".length));
      if (id.includes("/")) {
        return json({ ok: false, error: "not_found" }, 404);
      }
      return await handleOpportunityDetail(env, id);
    }
    if (request.method === "POST" && pathname === "/app/opportunities/parse") {
      return await handleParseListingUrl(request, env);
    }
    if (request.method === "POST" && pathname === "/app/opportunities/manual") {
      return await handleManualOpportunitySubmit(request, env, ctx);
    }
    if (pathname.startsWith("/app/maxbuy/")) {
      return await handleMaxbuyAppRoute(request, env, pathname);
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
      maxbuy: maxbuySystemStatus(env),
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
 * before resale — see docs/05-process/followups.md.
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

function mapIntelMmrEnvelopeToAppData(
  envelope: MmrResponseEnvelope,
  method: "vin" | "year_make_model",
  confidence: "high" | "medium",
): Record<string, unknown> {
  if (!envelope.ok || envelope.mmr_value === null) {
    return { mmrValue: null, missingReason: envelope.error_code ?? "no_mmr_value" };
  }

  const distribution = extractManheimDistribution(envelope.mmr_payload ?? {});
  const adjustmentBreakdown = extractManheimAdjustmentBreakdown(
    envelope.mmr_payload ?? {},
    envelope.mileage_used,
  );
  const marketContext = extractManheimMarketContext(envelope.mmr_payload ?? {});
  const vehicleIdentity = extractManheimVehicleIdentity(envelope.mmr_payload ?? {});
  const payloadItem = selectMmrPayloadItem(envelope.mmr_payload);
  const baseMmr =
    distribution.wholesaleBaseAvg ??
    distribution.wholesaleAvg ??
    envelope.mmr_value;
  const adjustedMmr = distribution.wholesaleAvg ?? envelope.mmr_value;
  return {
    mmrValue: baseMmr,
    confidence,
    method,
    mileageUsed: envelope.mileage_used,
    ...(vehicleIdentity.year !== null ? { year: vehicleIdentity.year } : {}),
    ...(vehicleIdentity.make !== null ? { make: vehicleIdentity.make } : {}),
    ...(vehicleIdentity.model !== null ? { model: vehicleIdentity.model } : {}),
    ...(vehicleIdentity.trim !== null ? { trim: vehicleIdentity.trim } : {}),
    avgOdometer: readNumericField(payloadItem, "averageOdometer"),
    avgCondition: readNumericField(payloadItem, "averageGrade"),
    sampleCount: distribution.sampleCount,
    rangeLow: distribution.wholesaleRough,
    rangeHigh: distribution.wholesaleClean,
    adjustedMmr,
    buildOptionsIncluded: adjustmentBreakdown.buildOptionsIncluded,
    buildOptionsAdjustment: adjustmentBreakdown.buildOptionsAdjustment,
    odometerAdjustment: adjustmentBreakdown.odometerAdjustment,
    gradeAdjustment: adjustmentBreakdown.gradeAdjustment,
    colorAdjustment: adjustmentBreakdown.colorAdjustment,
    regionAdjustment: adjustmentBreakdown.regionAdjustment,
    retailValue: distribution.retailAvg,
    retailRangeLow: distribution.retailRough,
    retailRangeHigh: distribution.retailClean,
    ...(marketContext.historicalAverages !== null
      ? { historicalAverages: marketContext.historicalAverages }
      : {}),
    ...(marketContext.projectedAverage !== null
      ? { projectedAverage: marketContext.projectedAverage }
      : {}),
    ...(marketContext.transactions.length > 0
      ? { transactions: marketContext.transactions }
      : {}),
  };
}

async function fetchIntelMmrLookup(
  env: Env,
  intelPath: string,
  body: Record<string, unknown>,
  logLabel: "mmr_vin" | "mmr_ymm",
  method: "vin" | "year_make_model",
  confidence: "high" | "medium",
): Promise<Response> {
  if (!env.INTEL_WORKER_URL && env.INTEL_WORKER === undefined) {
    return json({ ok: true, data: { mmrValue: null, missingReason: "intel_worker_not_configured" } });
  }

  let res: Response | null;
  try {
    res = await fetchIntelWorker(env, intelPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    log(`app.${logLabel}.worker_fetch_failed`, { error: serializeError(err) });
    return json({ ok: true, data: { mmrValue: null, missingReason: "intel_worker_unavailable" } });
  }

  if (res === null) {
    return json({ ok: true, data: { mmrValue: null, missingReason: "intel_worker_not_configured" } });
  }

  const responseText = await res.text();
  const responseJson = parseJsonText(responseText);
  if (!res.ok) {
    const missingReason = classifyIntelHttpError(res.status, responseText);
    log(`app.${logLabel}.worker_error`, {
      status: res.status,
      missingReason,
      body_keys: Object.keys(body).sort(),
    });
    return json({ ok: true, data: { mmrValue: null, missingReason } });
  }

  const wrapped = IntelMmrEnvelopeSchema.safeParse(responseJson);
  if (!wrapped.success) {
    log(`app.${logLabel}.worker_envelope_invalid`, {
      issues: wrapped.error.issues.slice(0, 5),
    });
    return json({ ok: true, data: { mmrValue: null, missingReason: "envelope_invalid" } });
  }

  return json({
    ok: true,
    data: mapIntelMmrEnvelopeToAppData(wrapped.data.data, method, confidence),
  });
}

/**
 * POST /app/mmr/vin — on-demand MMR valuation by VIN, proxied to
 * tav-intelligence-worker. Optional `adjustments` recompute adjusted MMR (P3).
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

  const { vin, year, mileage, adjustments } = parsed.data;
  const body: Record<string, unknown> = { vin };
  if (year !== undefined) body.year = year;
  if (mileage !== undefined) body.mileage = mileage;
  if (adjustments !== undefined) body.adjustments = adjustments;

  return fetchIntelMmrLookup(env, "/mmr/vin", body, "mmr_vin", "vin", "high");
}

type AppCatalogData = z.infer<typeof IntelCatalogEnvelopeSchema>["data"];

function catalogNotConnected(reason: string): Response {
  return json({
    ok: true,
    data: {
      items: [],
      catalogState: "not_connected",
      cached: false,
      reason,
    } satisfies AppCatalogData,
  });
}

function intelWorkerEndpoint(env: Env, path: string): { endpoint: string; useServiceBinding: boolean } | null {
  const useServiceBinding = env.INTEL_WORKER !== undefined;
  const baseUrl =
    env.INTEL_WORKER_URL || (useServiceBinding ? INTEL_SERVICE_BINDING_BASE : "");
  if (!baseUrl || !isConfiguredSecret(env.INTEL_WORKER_SECRET)) return null;
  return {
    endpoint: `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
    useServiceBinding,
  };
}

async function fetchIntelWorker(
  env: Env,
  path: string,
  init: RequestInit,
): Promise<Response | null> {
  const target = intelWorkerEndpoint(env, path);
  if (target === null) return null;

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("x-tav-service-secret", env.INTEL_WORKER_SECRET);

  const requestInit: RequestInit = { ...init, headers };
  return target.useServiceBinding
    ? await env.INTEL_WORKER!.fetch(target.endpoint, requestInit)
    : await fetch(target.endpoint, requestInit);
}

async function handleMmrCatalog(env: Env, intelPath: string | null): Promise<Response> {
  if (intelPath === null) {
    return json({ ok: false, error: "invalid_filter" }, 400);
  }

  let res: Response | null;
  try {
    res = await fetchIntelWorker(env, intelPath, { method: "GET" });
  } catch (err) {
    log("app.mmr_catalog.worker_fetch_failed", {
      path: intelPath.split("?")[0],
      error: serializeError(err),
    });
    return catalogNotConnected("intel_worker_unavailable");
  }

  if (res === null) {
    return catalogNotConnected("intel_worker_not_configured");
  }

  const body = await readResponseJson(res);
  if (!res.ok) {
    log("app.mmr_catalog.worker_error", {
      path: intelPath.split("?")[0],
      status: res.status,
    });
    return catalogNotConnected(
      res.status === 401 || res.status === 403 ? "intel_worker_auth_failed" : "intel_worker_unavailable",
    );
  }

  const parsed = IntelCatalogEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    log("app.mmr_catalog.worker_envelope_invalid", {
      path: intelPath.split("?")[0],
      issues: parsed.error.issues.slice(0, 5),
    });
    return catalogNotConnected("envelope_invalid");
  }

  return json({ ok: true, data: parsed.data.data });
}

async function handleMmrYmm(request: Request, env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = AppMmrYmmRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.slice(0, 5) }, 400);
  }

  const { year, make, model, style, mileage, adjustments } = parsed.data;
  const body: Record<string, unknown> = { year, make, model, trim: style };
  if (mileage !== undefined) body.mileage = mileage;
  if (adjustments !== undefined) body.adjustments = adjustments;

  return fetchIntelMmrLookup(
    env,
    "/mmr/year-make-model",
    body,
    "mmr_ymm",
    "year_make_model",
    "medium",
  );
}

async function readResponseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readNumericField(record: Record<string, unknown> | null, key: string): number | null {
  if (record === null) return null;
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Valid source_run statuses — mirrors the CHECK in supabase/schema.sql. */
const SOURCE_RUN_STATUSES = ["running", "completed", "failed", "truncated"] as const;

/**
 * GET /app/ingest-runs?limit=&source=&region=&status= — recent source runs,
 * newest first. Read-only. `limit` defaults to 20, clamped to 100. Optional
 * source/region/status filters are validated against the schema enums; an
 * unknown value → 400 `invalid_filter`. 503 `db_error` on client/query failure.
 */
async function handleIngestRunsList(env: Env, url: URL): Promise<Response> {
  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.ingest_runs.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  const filter: IngestRunListFilter = {
    limit: parseLimitParam(url.searchParams.get("limit")),
  };
  const source = url.searchParams.get("source");
  const region = url.searchParams.get("region");
  const status = url.searchParams.get("status");
  if (source !== null) {
    if (!(SOURCE_NAMES as readonly string[]).includes(source)) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.source = source;
  }
  if (region !== null) {
    if (!(REGION_KEYS as readonly string[]).includes(region)) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.region = region;
  }
  if (status !== null) {
    if (!(SOURCE_RUN_STATUSES as readonly string[]).includes(status)) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.status = status;
  }

  try {
    const data = await listSourceRuns(db, filter);
    return json({ ok: true, data });
  } catch (err) {
    log("app.ingest_runs.query_failed", { filter, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * GET /app/ingest-runs/:id — one source run plus diagnostic detail that
 * already exists in the current schema. Read-only. 404 `not_found` when the
 * run id is unknown; 503 `db_error` on client/query failure.
 */
async function handleIngestRunDetail(env: Env, id: string): Promise<Response> {
  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.ingest_run_detail.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {
    const data = await getSourceRunDetail(db, id);
    if (data === null) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, data });
  } catch (err) {
    log("app.ingest_run_detail.query_failed", { id, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

const OPPORTUNITY_SORTS = ["spread_desc", "score_desc", "last_seen_desc"] as const satisfies readonly OpportunitySort[];
const OPPORTUNITY_VIEWS = ["needs_action", "mine", "worth_a_look", "all"] as const satisfies readonly OpportunityView[];

const OPPORTUNITY_TYPES = ["lead", "near_miss"] as const satisfies readonly OpportunityType[];
const LEAD_GRADES = ["excellent", "good", "fair", "pass"] as const;
const LEAD_STATUSES = [
  "new",
  "assigned",
  "claimed",
  "contacted",
  "negotiating",
  "passed",
  "duplicate",
  "stale",
  "sold",
  "purchased",
  "archived",
] as const;

/**
 * GET /app/opportunities?limit=&offset=&sort=&view=&source=&region=&type=&grade=&status=
 * Read-only buyer queue. Returns camelCase product rows.
 * Classic callers (no offset/sort/view) receive a plain array; paginated callers receive
 * `{ items, total, offset }`.
 */
async function handleOpportunitiesList(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.opportunities.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  const hasOffset = url.searchParams.has("offset");
  const sortParam = url.searchParams.get("sort");
  const viewParam = url.searchParams.get("view");
  const paginatedResponse = hasOffset || sortParam !== null || viewParam !== null;

  const filter: OpportunityListFilter = {
    limit: parseLimitParam(url.searchParams.get("limit")),
  };

  if (hasOffset) {
    filter.offset = parseOffsetParam(url.searchParams.get("offset"));
  }

  if (sortParam !== null) {
    if (!(OPPORTUNITY_SORTS as readonly string[]).includes(sortParam)) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.sort = sortParam as OpportunitySort;
  }

  if (viewParam !== null) {
    if (!(OPPORTUNITY_VIEWS as readonly string[]).includes(viewParam)) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.view = viewParam as OpportunityView;
    if (filter.view === "mine") {
      const user = await resolveAppUser(request, env);
      if (!user) {
        return json({ ok: false, error: "user_required" }, 401);
      }
      filter.viewerUserId = user.id;
    }
  }

  const source = url.searchParams.get("source");
  const region = url.searchParams.get("region");
  const type = url.searchParams.get("type");
  const grade = url.searchParams.get("grade");
  const status = url.searchParams.get("status");

  if (source !== null) {
    if (!(SOURCE_NAMES as readonly string[]).includes(source)) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.source = source;
  }
  if (region !== null) {
    if (!(REGION_KEYS as readonly string[]).includes(region)) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.region = region;
  }
  if (type !== null) {
    if (!(OPPORTUNITY_TYPES as readonly string[]).includes(type as OpportunityType)) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.type = type as OpportunityType;
  }
  if (grade !== null) {
    if (!(LEAD_GRADES as readonly string[]).includes(grade as (typeof LEAD_GRADES)[number])) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.grade = grade;
  }
  if (status !== null) {
    if (!(LEAD_STATUSES as readonly string[]).includes(status as (typeof LEAD_STATUSES)[number])) {
      return json({ ok: false, error: "invalid_filter" }, 400);
    }
    filter.status = status;
  }

  try {
    const page = await listOpportunities(db, filter);
    if (paginatedResponse) {
      return json({ ok: true, data: page });
    }
    return json({ ok: true, data: page.items });
  } catch (err) {
    log("app.opportunities.query_failed", { filter, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * GET /app/opportunities/:id — one opportunity detail. 404 when unknown or not
 * reviewable (no lead and no MMR hit).
 */
async function handleOpportunityDetail(env: Env, id: string): Promise<Response> {
  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.opportunity_detail.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {
    const data = await getOpportunityDetail(db, id);
    if (data === null) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, data });
  } catch (err) {
    log("app.opportunity_detail.query_failed", { id, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * GET /app/me — current authenticated staff profile.
 * Requires identity headers from the trusted Next.js proxy (or Cf-Access).
 * Auto-provisions tav.users on first request.
 */
async function handleMe(request: Request, env: Env): Promise<Response> {
  try {
    const user = await resolveAppUser(request, env);
    if (!user) return json({ ok: false, error: "user_required" }, 401);
    return json({
      ok: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    log("app.me.resolve_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * GET /app/users — active staff directory for assignment pickers.
 */
async function handleUsersList(env: Env): Promise<Response> {
  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.users.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {
    const data = await listActiveUsers(db);
    return json({ ok: true, data });
  } catch (err) {
    log("app.users.query_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

async function requireAppUser(request: Request, env: Env): Promise<AppUser | Response> {
  try {
    const user = await resolveAppUser(request, env);
    if (!user) return json({ ok: false, error: "user_required" }, 401);
    return user;
  } catch (err) {
    log("app.user.resolve_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * POST /app/opportunities/parse — server-side listing URL parse (Facebook v1).
 * Does not persist rows; returns prefilled fields for the submit form.
 */
async function handleParseListingUrl(request: Request, env: Env): Promise<Response> {
  if (env.OPPORTUNITIES_PARSE_ENABLED !== "true") {
    return json({ ok: false, error: "parse_disabled" }, 503);
  }

  const userOrResponse = await requireAppUser(request, env);
  if (userOrResponse instanceof Response) return userOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = ParseListingUrlSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const result = await parseListingUrl(parsed.data.listingUrl);
  if (result.ok) {
    log("app.parse_listing.ok", {
      source: result.data.source,
      submitterId: userOrResponse.id,
      warningCount: result.data.warnings.length,
    });
    return json({ ok: true, data: result.data });
  }

  log("app.parse_listing.failed", {
    error: result.error,
    submitterId: userOrResponse.id,
    warnings: result.warnings,
  });
  return json({
    ok: false,
    error: result.error,
    warnings: result.warnings,
    ...(result.supportedSources ? { supportedSources: result.supportedSources } : {}),
  });
}

/**
 * POST /app/opportunities/manual — finder submits a listing URL into the queue.
 */
async function handleManualOpportunitySubmit(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const userOrResponse = await requireAppUser(request, env);
  if (userOrResponse instanceof Response) return userOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = ManualOpportunitySubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "validation_error", issues: parsed.error.issues }, 400);
  }

  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.manual_submit.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {
    const data = await submitManualOpportunity(db, userOrResponse, parsed.data);
    log("app.manual_submit.created", {
      submissionId: data.submissionId,
      normalizedListingId: data.normalizedListingId,
      submitterId: userOrResponse.id,
      isDuplicateUrl: data.isDuplicateUrl,
    });

    // MB-1 (OPEN-5): background evaluate after manual submit.
    // Fires on VIN when present; falls back to YMM when year+make+model are available.
    const opp = data.opportunity;
    const vin = opp?.vin;
    const hasYmm = opp?.year && opp?.make && opp?.model;
    if ((vin || hasYmm) && maxbuySystemStatus(env).enabled) {
      const evalBody: Record<string, unknown> = {
        contract_version: MAXBUY_CONTRACT_VERSION,
        mileage: opp?.mileage ?? undefined,
        asking_price: opp?.price ?? undefined,
        normalized_listing_id: data.normalizedListingId,
      };
      if (vin) {
        evalBody.vin = vin;
      } else {
        evalBody.year = opp!.year;
        evalBody.make = opp!.make;
        evalBody.model = opp!.model;
      }
      ctx.waitUntil(fireMaxbuyEvaluateBackground(env, userOrResponse.id, evalBody));
    }

    return json({ ok: true, data }, 201);
  } catch (err) {
    if (err instanceof ManualSubmissionValidationError) {
      return mapManualSubmissionError(err);
    }
    log("app.manual_submit.failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

function mapManualSubmissionError(err: ManualSubmissionValidationError): Response {
  const status = err.code === "duplicate_listing_url" ? 409 : 400;
  return json(
    {
      ok: false,
      error: err.code,
      ...(err.details ? { details: err.details } : {}),
    },
    status,
  );
}

function mapWorkflowError(err: OpportunityWorkflowError): Response {
  const status =
    err.code === "claim_conflict"
      ? 409
      : err.code === "forbidden"
        ? 403
        : err.code === "opportunity_not_found"
          ? 404
          : err.code === "invalid_status_transition"
            ? 409
            : 400;
  return json(
    {
      ok: false,
      error: err.code,
      ...(err.details ? { details: err.details } : {}),
    },
    status,
  );
}

/**
 * POST /app/opportunities/:id/assign — admin assigns or unassigns a closer.
 */
async function handleOpportunityAssign(
  request: Request,
  env: Env,
  normalizedListingId: string,
): Promise<Response> {
  const userOrResponse = await requireAppUser(request, env);
  if (userOrResponse instanceof Response) return userOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = AssignOpportunitySchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "validation_error", issues: parsed.error.issues }, 400);
  }

  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.opportunity_assign.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {
    const data = await assignOpportunity(
      db,
      normalizedListingId,
      userOrResponse,
      parsed.data.assignedToUserId,
    );
    log("app.opportunity_assign.ok", {
      normalizedListingId,
      actorId: userOrResponse.id,
      assignedToUserId: parsed.data.assignedToUserId,
    });
    return json({ ok: true, data });
  } catch (err) {
    if (err instanceof OpportunityWorkflowError) return mapWorkflowError(err);
    log("app.opportunity_assign.failed", { normalizedListingId, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * POST /app/opportunities/:id/claim — closer claims an opportunity for 24 hours.
 */
async function handleOpportunityClaim(
  request: Request,
  env: Env,
  normalizedListingId: string,
): Promise<Response> {
  const userOrResponse = await requireAppUser(request, env);
  if (userOrResponse instanceof Response) return userOrResponse;

  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.opportunity_claim.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {
    const data = await claimOpportunity(db, normalizedListingId, userOrResponse);
    log("app.opportunity_claim.ok", {
      normalizedListingId,
      actorId: userOrResponse.id,
      claimExpiresAt: data.claimExpiresAt,
    });
    return json({ ok: true, data });
  } catch (err) {
    if (err instanceof OpportunityWorkflowError) return mapWorkflowError(err);
    log("app.opportunity_claim.failed", { normalizedListingId, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * POST /app/opportunities/:id/evaluate — record that the current user opened/evaluated.
 */
async function handleOpportunityEvaluate(
  request: Request,
  env: Env,
  normalizedListingId: string,
): Promise<Response> {
  const userOrResponse = await requireAppUser(request, env);
  if (userOrResponse instanceof Response) return userOrResponse;

  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.opportunity_evaluate.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {
    const data = await recordOpportunityEvaluation(db, normalizedListingId, userOrResponse);
    return json({ ok: true, data });
  } catch (err) {
    if (err instanceof OpportunityWorkflowError) return mapWorkflowError(err);
    log("app.opportunity_evaluate.failed", { normalizedListingId, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * POST /app/opportunities/:id/status — closer/admin updates workflow status.
 */
async function handleOpportunityStatus(
  request: Request,
  env: Env,
  normalizedListingId: string,
): Promise<Response> {
  const userOrResponse = await requireAppUser(request, env);
  if (userOrResponse instanceof Response) return userOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = UpdateOpportunityStatusSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const nextStatus = normalizeMutatableWorkflowStatus(parsed.data.status);
  if (!nextStatus) {
    return json({ ok: false, error: "invalid_status" }, 400);
  }

  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.opportunity_status.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {
    const data = await updateOpportunityStatus(db, normalizedListingId, userOrResponse, nextStatus);
    log("app.opportunity_status.ok", {
      normalizedListingId,
      actorId: userOrResponse.id,
      status: nextStatus,
    });
    return json({ ok: true, data });
  } catch (err) {
    if (err instanceof OpportunityWorkflowError) return mapWorkflowError(err);
    log("app.opportunity_status.failed", { normalizedListingId, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

/**
 * POST /app/opportunities/:id/notes — closer/admin adds an auditable note.
 */
async function handleOpportunityNotes(
  request: Request,
  env: Env,
  normalizedListingId: string,
): Promise<Response> {
  const userOrResponse = await requireAppUser(request, env);
  if (userOrResponse instanceof Response) return userOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = AddOpportunityNoteSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "validation_error", issues: parsed.error.issues }, 400);
  }

  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("app.opportunity_notes.client_init_failed", { error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {
    const metadata = parsed.data.maxbuy_recommendation_id
      ? { maxbuy_recommendation_id: parsed.data.maxbuy_recommendation_id }
      : undefined;
    const data = await addOpportunityNote(
      db,
      normalizedListingId,
      userOrResponse,
      parsed.data.note,
      metadata,
    );
    log("app.opportunity_notes.ok", {
      normalizedListingId,
      actorId: userOrResponse.id,
    });
    return json({ ok: true, data });
  } catch (err) {
    if (err instanceof OpportunityWorkflowError) return mapWorkflowError(err);
    log("app.opportunity_notes.failed", { normalizedListingId, error: serializeError(err) });
    return json({ ok: false, error: "db_error" }, 503);
  }
}

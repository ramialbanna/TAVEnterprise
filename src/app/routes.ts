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
 * Implemented here: GET /app/system-status, GET /app/kpis, GET /app/import-batches.
 * Planned (see docs/adr/0002-frontend-app-api-layer.md): GET /app/historical-sales,
 * POST /app/mmr/vin.
 */
import type { Env } from "../types/env";
import { getSupabaseClient } from "../persistence/supabase";
import { listImportBatches } from "../persistence/importBatches";
import { isConfiguredSecret } from "../types/envValidation";
import { log, serializeError } from "../logging/logger";
import { VERSION } from "../version";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

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
  const auth = request.headers.get("Authorization") ?? "";
  if (!isConfiguredSecret(env.APP_API_SECRET)) return false;
  return auth === `Bearer ${env.APP_API_SECRET}`;
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

/**
 * GET /app/system-status — health snapshot for the dashboard header.
 * Always 200. Reports DB connectivity, intelligence-worker wiring, recent
 * source-run health, and (not yet persisted) last stale-sweep time.
 */
async function handleSystemStatus(env: Env): Promise<Response> {
  const intelWorker = {
    mode: env.MANHEIM_LOOKUP_MODE === "worker" ? "worker" : "direct",
    binding: env.INTEL_WORKER !== undefined,
    url: env.INTEL_WORKER_URL || null,
  };

  let db: { ok: true } | { ok: false; missingReason: string };
  let sources: unknown[] = [];
  try {
    const client = getSupabaseClient(env);
    const { data, error } = await client.from("v_source_health").select("*");
    if (error) throw error;
    db = { ok: true };
    sources = data ?? [];
  } catch (err) {
    log("app.system_status.db_unavailable", { error: serializeError(err) });
    db = { ok: false, missingReason: "db_error" };
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
      // Cron run times are not persisted yet — see docs/followups.md.
      staleSweep: { lastRunAt: null, missingReason: "not_persisted" },
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
 * `outcomes.byRegion` comes straight from tav.v_outcome_summary (honest
 * per-region rollup). A correct *global* rollup view is a follow-up; until
 * then only `totalOutcomes` (an exact COUNT) is exposed at the top level —
 * no weighted-average estimate is fabricated.
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
    const { data, error } = await db.from("v_outcome_summary").select("*");
    if (error) throw error;
    const { count, error: countErr } = await db
      .from("purchase_outcomes")
      .select("*", { count: "exact", head: true });
    if (countErr) throw countErr;
    return { totalOutcomes: count ?? 0, byRegion: data ?? [] };
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

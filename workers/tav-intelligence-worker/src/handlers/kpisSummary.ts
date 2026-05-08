import { okResponse } from "../types/api";
import { AuthError, ValidationError, PersistenceError } from "../errors";
import { getSupabaseClient } from "../persistence/supabase";
import { MMR_LOOKUP_TYPES } from "../validate";
import type { HandlerArgs } from "./types";

const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS     = 90;

export interface KpisSummaryData {
  total_lookups:      number;
  successful_lookups: number;
  failed_lookups:     number;
  cache_hit_rate:     number | null;
  avg_latency_ms:     number | null;
  p95_latency_ms:     number | null;
  lookups_by_type:    Record<string, number>;
  lookups_by_outcome: Record<string, number>;
  top_requesters:     Array<{ email: string; count: number }>;
  recent_error_count: number;
  time_window:        { from: string; to: string };
}

/**
 * GET /kpis/summary — aggregate KPIs from tav.mmr_queries.
 *
 * Query params:
 *   from         ISO 8601 timestamp, default: 7 days ago
 *   to           ISO 8601 timestamp, default: now
 *   email        filter to a single requester
 *   lookup_type  "vin" | "year_make_model"
 *
 * Aggregation is done in Postgres via tav.get_mmr_kpis() (migration 0032).
 * p95 latency uses percentile_cont — window must stay bounded to keep
 * the scan time acceptable.
 */
export async function handleKpisSummary(args: HandlerArgs): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const params = new URL(args.request.url).searchParams;

  // --- time window ---
  const now   = new Date();
  const toStr = params.get("to");
  const toTs  = toStr ? new Date(toStr) : now;
  if (isNaN(toTs.getTime())) {
    throw new ValidationError("Invalid 'to' — must be ISO 8601");
  }

  const fromStr = params.get("from");
  const fromTs  = fromStr
    ? new Date(fromStr)
    : new Date(toTs.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (isNaN(fromTs.getTime())) {
    throw new ValidationError("Invalid 'from' — must be ISO 8601");
  }

  if (fromTs >= toTs) {
    throw new ValidationError("'from' must be before 'to'");
  }

  const windowDays = (toTs.getTime() - fromTs.getTime()) / (24 * 60 * 60 * 1000);
  if (windowDays > MAX_WINDOW_DAYS) {
    throw new ValidationError(
      `Time window exceeds maximum of ${MAX_WINDOW_DAYS} days`,
      { max_days: MAX_WINDOW_DAYS, requested_days: Math.ceil(windowDays) },
    );
  }

  // --- optional filters ---
  const email      = params.get("email")       ?? undefined;
  const lookupType = params.get("lookup_type") ?? undefined;

  if (lookupType !== undefined && !(MMR_LOOKUP_TYPES as readonly string[]).includes(lookupType)) {
    throw new ValidationError("Invalid lookup_type", {
      allowed:  MMR_LOOKUP_TYPES,
      received: lookupType,
    });
  }

  // --- RPC ---
  const db = getSupabaseClient(args.env);
  const { data, error } = await db.rpc("get_mmr_kpis", {
    p_from:        fromTs.toISOString(),
    p_to:          toTs.toISOString(),
    p_email:       email      ?? null,
    p_lookup_type: lookupType ?? null,
  });

  if (error) {
    throw new PersistenceError("kpis rpc failed", {
      code:    error.code,
      message: error.message,
    });
  }

  const kpis = data as Omit<KpisSummaryData, "time_window">;

  return okResponse<KpisSummaryData>(
    {
      ...kpis,
      time_window: { from: fromTs.toISOString(), to: toTs.toISOString() },
    },
    args.requestId,
  );
}

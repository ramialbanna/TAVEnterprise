import { okResponse } from "../types/api";
import { AuthError, ValidationError, PersistenceError } from "../errors";
import { getSupabaseClient } from "../persistence/supabase";
import { MMR_LOOKUP_TYPES } from "../validate";
import type { HandlerArgs } from "./types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 250;

// Explicit allowlist — mmr_payload (large) and error_message (may leak
// Manheim internals) and requested_by_user_id (internal mirror of email)
// are intentionally excluded.
const FIELDS = [
  "id", "request_id", "created_at",
  "lookup_type", "outcome", "cache_hit", "source", "force_refresh",
  "vin", "year", "make", "model", "trim",
  "mileage_used", "is_inferred_mileage",
  "latency_ms", "retry_count",
  "mmr_value", "error_code",
  "requested_by_email", "requested_by_name",
].join(", ");

export interface MmrQueryItem {
  id:                   string;
  request_id:           string | null;
  created_at:           string;
  lookup_type:          string;
  outcome:              string | null;
  cache_hit:            boolean;
  source:               string;
  force_refresh:        boolean;
  vin:                  string | null;
  year:                 number | null;
  make:                 string | null;
  model:                string | null;
  trim:                 string | null;
  mileage_used:         number | null;
  is_inferred_mileage:  boolean;
  latency_ms:           number | null;
  retry_count:          number;
  mmr_value:            number | null;
  error_code:           string | null;
  requested_by_email:   string | null;
  requested_by_name:    string | null;
}

export interface MmrQueriesResponse {
  items:       MmrQueryItem[];
  total_count: number;
  limit:       number;
  offset:      number;
  has_more:    boolean;
  filters:     Record<string, string | boolean | null>;
}

/**
 * GET /intel/mmr/queries — paginated audit/query history for ops and debugging.
 *
 * Filters (all optional):
 *   email        requester email
 *   vin          exact VIN match
 *   outcome      "hit" | "miss" | "error"
 *   lookup_type  "vin" | "year_make_model"
 *   cache_hit    "true" | "false"
 *   from         ISO 8601 lower bound on created_at
 *   to           ISO 8601 upper bound on created_at
 *
 * Pagination:
 *   limit   1–250, default 50
 *   offset  default 0
 *
 * Results ordered newest-first. mmr_payload and error_message excluded.
 */
export async function handleIntelMmrQueries(args: HandlerArgs): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const params = new URL(args.request.url).searchParams;

  // --- pagination ---
  const limitRaw  = params.get("limit");
  const offsetRaw = params.get("offset");
  const limit     = Math.min(Math.max(limitRaw  ? parseInt(limitRaw,  10) : DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset    = Math.max(offsetRaw ? parseInt(offsetRaw, 10) : 0, 0);

  // --- filters ---
  const email      = params.get("email")       ?? undefined;
  const vin        = params.get("vin")         ?? undefined;
  const outcome    = params.get("outcome")     ?? undefined;
  const lookupType = params.get("lookup_type") ?? undefined;
  const cacheHitP  = params.get("cache_hit")  ?? undefined;
  const fromStr    = params.get("from")        ?? undefined;
  const toStr      = params.get("to")          ?? undefined;

  if (lookupType !== undefined && !(MMR_LOOKUP_TYPES as readonly string[]).includes(lookupType)) {
    throw new ValidationError("Invalid lookup_type", { allowed: MMR_LOOKUP_TYPES, received: lookupType });
  }

  if (outcome !== undefined && !["hit", "miss", "error"].includes(outcome)) {
    throw new ValidationError("Invalid outcome", { allowed: ["hit", "miss", "error"], received: outcome });
  }

  let cacheHit: boolean | undefined;
  if (cacheHitP !== undefined) {
    if (cacheHitP !== "true" && cacheHitP !== "false") {
      throw new ValidationError("cache_hit must be 'true' or 'false'");
    }
    cacheHit = cacheHitP === "true";
  }

  if (fromStr !== undefined && isNaN(new Date(fromStr).getTime())) {
    throw new ValidationError("Invalid 'from' — must be ISO 8601");
  }
  if (toStr !== undefined && isNaN(new Date(toStr).getTime())) {
    throw new ValidationError("Invalid 'to' — must be ISO 8601");
  }

  // --- query ---
  const db = getSupabaseClient(args.env);

  let query = db
    .from("mmr_queries")
    .select(FIELDS, { count: "exact" })
    .order("created_at", { ascending: false });

  if (email)              query = query.eq("requested_by_email", email);
  if (vin)                query = query.eq("vin", vin.trim().toUpperCase());
  if (outcome)            query = query.eq("outcome", outcome);
  if (lookupType)         query = query.eq("lookup_type", lookupType);
  if (cacheHit !== undefined) query = query.eq("cache_hit", cacheHit);
  if (fromStr)            query = query.gte("created_at", new Date(fromStr).toISOString());
  if (toStr)              query = query.lt("created_at",  new Date(toStr).toISOString());

  const { data, count, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    throw new PersistenceError("mmr_queries fetch failed", {
      code:    error.code,
      message: error.message,
    });
  }

  const total     = count ?? 0;
  const items     = (data ?? []) as unknown as MmrQueryItem[];
  const appliedFilters: Record<string, string | boolean | null> = {};
  if (email      !== undefined) appliedFilters.email       = email;
  if (vin        !== undefined) appliedFilters.vin         = vin.trim().toUpperCase();
  if (outcome    !== undefined) appliedFilters.outcome     = outcome;
  if (lookupType !== undefined) appliedFilters.lookup_type = lookupType;
  if (cacheHit   !== undefined) appliedFilters.cache_hit   = cacheHit;
  if (fromStr    !== undefined) appliedFilters.from        = fromStr;
  if (toStr      !== undefined) appliedFilters.to          = toStr;

  return okResponse<MmrQueriesResponse>(
    {
      items,
      total_count: total,
      limit,
      offset,
      has_more:    offset + items.length < total,
      filters:     appliedFilters,
    },
    args.requestId,
  );
}

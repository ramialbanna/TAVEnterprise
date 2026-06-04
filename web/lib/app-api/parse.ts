import type { z } from "zod";
import {
  normalizeOpportunityListPagePayload,
} from "@/lib/opportunities/list-page";
import {
  HistoricalSaleListSchema,
  ImportBatchListSchema,
  IngestRunSummaryListSchema,
  IngestRunDetailSchema,
  OpportunityRowListSchema,
  OpportunityListPageSchema,
  OpportunityDetailSchema,
  ManualSubmissionResultSchema,
  AppUserSummaryListSchema,
  AppUserSchema,
  KpisSchema,
  MmrCatalogSchema,
  MmrVinOkSchema,
  SystemStatusSchema,
  MaxbuyEvaluateOkSchema,
  MaxbuyOverrideOkSchema,
  MaxbuyPassOkSchema,
  type HistoricalSale,
  type ImportBatch,
  type IngestRunSummary,
  type IngestRunDetail,
  type OpportunityRow,
  type OpportunityListPage,
  type OpportunityDetail,
  type ManualSubmissionResult,
  type AppUserSummary,
  type AppUser,
  type Kpis,
  type MmrCatalog,
  type MmrVinOk,
  type SystemStatus,
  type MaxbuyEvaluateOk,
  type MaxbuyOverrideOk,
  type MaxbuyPassOk,
} from "./schemas";
import { codeMessage } from "./missing-reason";

/**
 * Frontend-facing result type for every /app/* call. A discriminated union so UI
 * components can branch uniformly on `result.ok` and then on `result.kind`.
 *
 * Error `kind`s:
 *   - "unauthorized" — the session is gone (401); prompt re-sign-in.
 *   - "unavailable"  — transient backend issue (Worker `db_error`, `/web` `upstream_unavailable`,
 *                      or a metric/MMR `missingReason`) — generally retryable.
 *   - "invalid"      — the *request* or *response* is malformed (Worker `invalid_body`/`invalid_json`,
 *                      `not_found`, a Zod schema mismatch, or non-object JSON). Not retryable
 *                      without a code change.
 *   - "server"       — a server-side fault (Worker `internal_error`, `app_auth_not_configured`,
 *                      or any unknown error with status ≥ 500).
 *   - "proxy"        — a /web (Next/Vercel) proxy/infra issue, NOT a Worker `/app/*` error
 *                      (`proxy_misconfigured`, `upstream_non_json`).
 *   - "unknown"      — an unrecognised error code with status < 500.
 */
export type ErrorKind = "unauthorized" | "unavailable" | "invalid" | "server" | "proxy" | "unknown";

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | {
      ok: false;
      kind: ErrorKind;
      error: string;
      status: number;
      message: string;
      /** Forwarded from `{ error, details }` (e.g. duplicate_listing_url). */
      details?: Record<string, unknown>;
      /** Forwarded from `{ error:"invalid_body", issues:[...] }` (Worker Zod issues). */
      issues?: unknown[];
    };

// ── error envelope mapping ─────────────────────────────────────────────────────
function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Map a documented error code to its `ErrorKind`. Unknown codes return `null` so the
 * caller can fall back based on HTTP status.
 */
function classifyError(code: string): ErrorKind | null {
  switch (code) {
    // Worker /app/*
    case "unauthorized":
      return "unauthorized";
    case "db_error":
      return "unavailable";
    case "app_auth_not_configured":
    case "internal_error":
      return "server";
    case "not_found":
    case "invalid_json":
    case "invalid_body":
    case "validation_error":
    case "invalid_listing_url":
    case "unsupported_listing_url":
    case "invalid_assignee":
    case "invalid_status":
    case "duplicate_listing_url":
    case "parse_disabled":
    case "unsupported_source":
    case "fetch_failed":
    case "fetch_timeout":
    case "parse_failed":
      return "invalid";
    case "forbidden":
    case "claim_conflict":
    case "invalid_status_transition":
    case "opportunity_not_found":
      return "invalid";
    case "user_required":
      return "unauthorized";
    case "maxbuy_disabled":
    case "maxbuy_not_configured":
    case "maxbuy_unavailable":
      return "unavailable";
    case "invalid_vin":
    case "vehicle_context_missing":
      return "invalid";
    // /web proxy (NOT Worker errors — see codeMessage)
    case "proxy_misconfigured":
    case "upstream_non_json":
      return "proxy";
    case "upstream_unavailable":
      return "unavailable";
    default:
      return null;
  }
}

function mapErrorEnvelope(status: number, body: Record<string, unknown>): Extract<ApiResult<never>, { ok: false }> {
  const error = typeof body.error === "string" ? body.error : null;
  if (error === null) {
    return {
      ok: false,
      kind: "invalid",
      error: "bad_response",
      status,
      message: codeMessage("bad_response"),
    };
  }
  const kind = classifyError(error) ?? (status >= 500 ? "server" : "unknown");
  const issues = Array.isArray(body.issues) ? body.issues : undefined;
  const details = isObject(body.details) ? body.details : undefined;
  return {
    ok: false,
    kind,
    error,
    status,
    message: codeMessage(error),
    ...(issues ? { issues } : {}),
    ...(details ? { details } : {}),
  };
}

/** Core: turn (status, json) + a data Zod schema into an `ApiResult<T>`. */
function interpret<T>(status: number, json: unknown, dataSchema: z.ZodType<T>): ApiResult<T> {
  if (!isObject(json)) {
    return {
      ok: false,
      kind: "invalid",
      error: "bad_response",
      status,
      message: codeMessage("bad_response"),
    };
  }
  if (json.ok === false) {
    return mapErrorEnvelope(status, json);
  }
  if (json.ok !== true) {
    return {
      ok: false,
      kind: "invalid",
      error: "bad_response",
      status,
      message: codeMessage("bad_response"),
    };
  }
  const parsed = dataSchema.safeParse(json.data);
  if (!parsed.success) {
    return {
      ok: false,
      kind: "invalid",
      error: "schema_mismatch",
      status,
      message: codeMessage("schema_mismatch"),
      issues: parsed.error.issues.slice(0, 5),
    };
  }
  return { ok: true, data: parsed.data, status };
}

// ── per-endpoint parsers ───────────────────────────────────────────────────────
export function parseSystemStatus(status: number, json: unknown): ApiResult<SystemStatus> {
  return interpret(status, json, SystemStatusSchema);
}

export function parseMaxbuyEvaluate(status: number, json: unknown): ApiResult<MaxbuyEvaluateOk> {
  return interpret(status, json, MaxbuyEvaluateOkSchema);
}

export function parseMaxbuyOverride(status: number, json: unknown): ApiResult<MaxbuyOverrideOk> {
  return interpret(status, json, MaxbuyOverrideOkSchema);
}

export function parseMaxbuyPass(status: number, json: unknown): ApiResult<MaxbuyPassOk> {
  return interpret(status, json, MaxbuyPassOkSchema);
}

export function parseKpis(status: number, json: unknown): ApiResult<Kpis> {
  return interpret(status, json, KpisSchema);
}

export function parseImportBatches(status: number, json: unknown): ApiResult<ImportBatch[]> {
  return interpret(status, json, ImportBatchListSchema);
}

export function parseHistoricalSales(status: number, json: unknown): ApiResult<HistoricalSale[]> {
  return interpret(status, json, HistoricalSaleListSchema);
}

export function parseIngestRuns(status: number, json: unknown): ApiResult<IngestRunSummary[]> {
  return interpret(status, json, IngestRunSummaryListSchema);
}

export function parseIngestRunDetail(status: number, json: unknown): ApiResult<IngestRunDetail> {
  return interpret(status, json, IngestRunDetailSchema);
}

export function parseOpportunities(status: number, json: unknown): ApiResult<OpportunityRow[]> {
  return interpret(status, json, OpportunityRowListSchema);
}

export function parseOpportunitiesPage(
  status: number,
  json: unknown,
): ApiResult<OpportunityListPage> {
  const normalizedJson =
    isObject(json) && json.ok === true
      ? { ...json, data: normalizeOpportunityListPagePayload(json.data) }
      : json;

  const pageResult = interpret(status, normalizedJson, OpportunityListPageSchema);
  if (pageResult.ok) return pageResult;

  // Backward compat: pre-Phase-1 Worker returns a plain array even when sort/offset/view
  // params are present. Wrap it as a single page so New mode still loads.
  if (
    pageResult.error === "schema_mismatch" &&
    isObject(json) &&
    json.ok === true &&
    Array.isArray(json.data)
  ) {
    const rows = OpportunityRowListSchema.safeParse(json.data);
    if (rows.success) {
      return {
        ok: true,
        status,
        data: { items: rows.data, total: rows.data.length, offset: 0 },
      };
    }
  }

  return pageResult;
}

export function parseOpportunityDetail(status: number, json: unknown): ApiResult<OpportunityDetail> {
  return interpret(status, json, OpportunityDetailSchema);
}

export function parseManualSubmission(
  status: number,
  json: unknown,
): ApiResult<ManualSubmissionResult> {
  return interpret(status, json, ManualSubmissionResultSchema);
}

export function parseAppUsers(status: number, json: unknown): ApiResult<AppUserSummary[]> {
  return interpret(status, json, AppUserSummaryListSchema);
}

export function parseAppMe(status: number, json: unknown): ApiResult<AppUser> {
  return interpret(status, json, AppUserSchema);
}

/**
 * POST /app/mmr/vin — the `data` payload is bimodal:
 *   - `{ mmrValue: number, confidence, method }` → ok with data
 *   - `{ mmrValue: null, missingReason }`        → unavailable (NOT an error envelope —
 *     the call succeeded; the lookup just couldn't be performed/cached/etc.)
 */
export function parseMmrVin(status: number, json: unknown): ApiResult<MmrVinOk> {
  if (!isObject(json)) {
    return {
      ok: false,
      kind: "invalid",
      error: "bad_response",
      status,
      message: codeMessage("bad_response"),
    };
  }
  if (json.ok === false) {
    return mapErrorEnvelope(status, json);
  }
  if (json.ok !== true || !isObject(json.data)) {
    return {
      ok: false,
      kind: "invalid",
      error: "bad_response",
      status,
      message: codeMessage("bad_response"),
    };
  }
  if (json.data.mmrValue === null) {
    const reason = typeof json.data.missingReason === "string" ? json.data.missingReason : "unavailable";
    return {
      ok: false,
      kind: "unavailable",
      error: reason,
      status,
      message: codeMessage(reason),
    };
  }
  const parsed = MmrVinOkSchema.safeParse(json.data);
  if (!parsed.success) {
    return {
      ok: false,
      kind: "invalid",
      error: "schema_mismatch",
      status,
      message: codeMessage("schema_mismatch"),
      issues: parsed.error.issues.slice(0, 5),
    };
  }
  return { ok: true, data: parsed.data, status };
}

export function parseMmrYmm(status: number, json: unknown): ApiResult<MmrVinOk> {
  return parseMmrVin(status, json);
}

export function parseMmrCatalog(status: number, json: unknown): ApiResult<MmrCatalog> {
  return interpret(status, json, MmrCatalogSchema);
}

// ── metric-block helper (KPI: outcomes/leads/listings) ─────────────────────────
/**
 * Convert one `{ value: T | null, missingReason: string | null }` KPI block into an
 * `ApiResult<T>` the UI can render uniformly. The overall `/app/kpis` call may be `ok`
 * while individual blocks are independently unavailable — this helper is how each tile
 * branches.
 */
export function metricBlockResult<T>(
  block: { value: T | null; missingReason: string | null },
  status = 200,
): ApiResult<T> {
  if (block.value !== null) {
    return { ok: true, data: block.value, status };
  }
  const reason = block.missingReason ?? "unavailable";
  return {
    ok: false,
    kind: "unavailable",
    error: reason,
    status,
    message: codeMessage(reason),
  };
}

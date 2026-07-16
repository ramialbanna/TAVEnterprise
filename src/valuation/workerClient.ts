import { z } from "zod";
import type { Env } from "../types/env";
import type { MmrParams, MmrResult } from "./mmr";
import { MmrResponseEnvelopeSchema } from "../types/intelligence";
import type { ValuationConfidence, ValuationMethod, NormalizationConfidence } from "../types/domain";
import { getSupabaseClient } from "../persistence/supabase";
import { loadMmrReferenceData } from "./loadMmrReferenceData";
import { normalizeMmrParams } from "./normalizeMmrParams";
import { log } from "../logging/logger";
import { isConfiguredSecret } from "../types/envValidation";
import { extractTitleTrim } from "./extractTitleTrim";
import { resolveListingToCatalogForIngest } from "./resolveListingToCatalog";
import type { CatalogMatchSuggestion } from "./resolveListingToCatalog";
import { buildIngestCatalogOfflineDeps } from "./buildIngestCatalogOfflineDeps";

/**
 * Diagnostic reason an MMR lookup did not produce a value. Caller-visible
 * via the MmrLookupOutcome miss branch — never inferred from a null result.
 *
 *   not_configured       — neither INTEL_WORKER binding nor INTEL_WORKER_URL set
 *   insufficient_params  — no VIN and incomplete YMM (year/make/model missing)
 *   mileage_missing      — legacy reason (pre–item 54 invent gate); unused for
 *                          new lookups — miles are optional; omit odometer instead
 *   model_variant_missing — Cox catalog splits the model (e.g. AWD/FWD), but
 *                          listing evidence is insufficient to choose safely
 *   trim_missing         — Cox YMMT requires bodyname (trim) as path segment
 *   cox_no_data          — worker returned a negative envelope (ok=false or mmr_value=null)
 *   cox_bad_request      — intel rejected our request body (400 / validation_error):
 *                          actionable on OUR side (payload/shape)
 *   cox_auth             — intel auth gate (401/403 / auth_error): service identity
 *   cox_vendor_auth      — Cox/Manheim rejected intel's credentials (manheim_auth_error)
 *   cox_vendor_bad_response — Cox returned a non-404 unusable response
 *                          (manheim_response_error) — e.g. trim sent as bodyname
 *   cox_unavailable      — intel/vendor is down (5xx / manheim_unavailable /
 *                          unclassified non-2xx)
 *   cox_rate_limited     — worker/vendor rate limited (429 / manheim_rate_limited)
 *   cox_timeout          — request exceeded TIMEOUT_MS
 *   envelope_invalid     — worker returned 2xx but body did not match the contract
 */
export type MmrMissReason =
  | "not_configured"
  | "insufficient_params"
  | "mileage_missing"
  | "model_variant_missing"
  | "trim_missing"
  | "cox_no_data"
  | "cox_bad_request"
  | "cox_auth"
  | "cox_vendor_auth"
  | "cox_vendor_bad_response"
  | "cox_unavailable"
  | "cox_rate_limited"
  | "cox_timeout"
  | "envelope_invalid";

/**
 * Map an intel non-2xx response to a specific, actionable miss reason.
 * Prefers the structured `error.code` from intel's error envelope
 * (`{ success:false, error:{ code } }` — non-secret, see
 * tav-intelligence-worker/src/types/api.ts); falls back to HTTP status when
 * the body is absent/unparseable. Never inspects secrets.
 */
export function classifyIntelHttpError(
  status: number,
  responseText: string,
): MmrMissReason {
  let code: string | undefined;
  try {
    const parsed = JSON.parse(responseText) as { error?: { code?: unknown } };
    if (parsed && typeof parsed.error === "object" && parsed.error !== null) {
      const c = (parsed.error as { code?: unknown }).code;
      if (typeof c === "string") code = c;
    }
  } catch {
    /* unparseable / empty → status-based fallback below */
  }

  switch (code) {
    case "validation_error":     return "cox_bad_request";
    case "auth_error":           return "cox_auth";
    case "manheim_auth_error":   return "cox_vendor_auth";
    case "manheim_response_error": return "cox_vendor_bad_response";
    case "manheim_rate_limited":
    case "rate_limited":         return "cox_rate_limited";
    case "manheim_unavailable":
    case "external_api_error":   return "cox_unavailable";
  }

  if (status === 400) return "cox_bad_request";
  if (status === 401 || status === 403) return "cox_auth";
  if (status === 429) return "cox_rate_limited";
  return "cox_unavailable";
}

export type MmrLookupOutcome =
  | { kind: "hit"; result: MmrResult; catalogMatchSuggestions?: CatalogMatchSuggestion[] }
  | {
      kind: "miss";
      reason: MmrMissReason;
      method: ValuationMethod | null;
      normalizationConfidence?: NormalizationConfidence;
      mileageUsed?: number | null;
      isInferredMileage?: boolean;
      catalogMatchSuggestions?: CatalogMatchSuggestion[];
    };

// tav-intelligence-worker wraps every successful response as
//   { success: true, data: <MmrResponseEnvelope>, requestId, timestamp }
// (see workers/tav-intelligence-worker/src/types/api.ts okResponse). The
// inner envelope matches MmrResponseEnvelopeSchema. Parse the wrapper here
// and drill into `data` so getMmrValueFromWorker sees the documented shape.
const IntelOkEnvelopeSchema = z.object({
  success: z.literal(true),
  data:    MmrResponseEnvelopeSchema,
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

const TIMEOUT_MS = 5_000;

export class WorkerTimeoutError extends Error {
  constructor() {
    super("tav-intelligence-worker call timed out");
    this.name = "WorkerTimeoutError";
  }
}

export class WorkerRateLimitError extends Error {
  constructor() {
    super("tav-intelligence-worker returned 429 rate limit");
    this.name = "WorkerRateLimitError";
  }
}

export class WorkerUnavailableError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`tav-intelligence-worker returned HTTP ${status}`);
    this.name = "WorkerUnavailableError";
    this.status = status;
  }
}

/**
 * Internal placeholder host used when only the `INTEL_WORKER` service binding is wired
 * and `INTEL_WORKER_URL` is empty. Cloudflare's Service Binding `Fetcher.fetch` requires
 * a parseable absolute URL but ignores the host portion — the request is dispatched to
 * the bound worker directly by name. Any reserved-looking host works; this one is
 * obviously internal so it doesn't get mistaken for a real production URL in logs.
 */
const SERVICE_BINDING_PLACEHOLDER_BASE = "https://tav-intelligence-worker.internal";

interface CatalogFetchResult {
  catalogState: "connected" | "not_connected";
  items: string[];
}

async function fetchCatalogItems(args: {
  baseUrl: string;
  env: Env;
  useServiceBinding: boolean;
  path: string;
  eventLabel: string;
  serviceSecretConfigured: boolean;
}): Promise<CatalogFetchResult | null> {
  const endpoint = `${args.baseUrl}${args.path}`;
  const requestInit: RequestInit = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-tav-service-secret": args.env.INTEL_WORKER_SECRET,
    },
  };

  try {
    const res = args.useServiceBinding
      ? await args.env.INTEL_WORKER!.fetch(endpoint, requestInit)
      : await fetch(endpoint, requestInit);
    if (!res.ok) {
      log(`ingest.mmr_catalog_${args.eventLabel}_http_error`, {
        endpoint,
        status: res.status,
        service_secret_header_present: args.serviceSecretConfigured,
      });
      return null;
    }
    const raw = await res.json();
    const parsed = IntelCatalogEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      log(`ingest.mmr_catalog_${args.eventLabel}_envelope_invalid`, {
        endpoint,
        issues: parsed.error.issues.slice(0, 5),
      });
      return null;
    }
    return {
      catalogState: parsed.data.data.catalogState,
      items: parsed.data.data.items,
    };
  } catch (err) {
    log(`ingest.mmr_catalog_${args.eventLabel}_fetch_failed`, {
      endpoint,
      error: err instanceof Error ? err.name : String(err),
    });
    return null;
  }
}

/**
 * Call tav-intelligence-worker for an MMR valuation lookup.
 *
 * Tries the VIN endpoint first if a VIN is present (bypasses normalization).
 * Falls back to the YMM endpoint when year+make+model+mileage are available;
 * normalizes make/model against reference data before sending.
 *
 * Transport selection:
 *   - `INTEL_WORKER` (Service Binding) present → dispatched via the binding; the
 *     `baseUrl` host is ignored by Cloudflare's `Fetcher.fetch`, so an internal
 *     placeholder is used when `INTEL_WORKER_URL` is empty.
 *   - No Service Binding but `INTEL_WORKER_URL` set → public fetch with that base.
 *   - Neither present → not configured; return null.
 *
 * Returns null when:
 *   - both INTEL_WORKER_URL and INTEL_WORKER are absent (not configured)
 *   - params are insufficient to form any request
 *   - the worker returns a negative-cache envelope (ok=false or mmr_value=null)
 *   - the response body cannot be parsed as MmrResponseEnvelope
 *
 * Throws WorkerTimeoutError, WorkerRateLimitError, or WorkerUnavailableError
 * for error conditions — callers must catch and treat as non-blocking.
 */
/**
 * Internal shape: outcome plus optional HTTP status carried out of the wire
 * call so the legacy throw-on-error adapter can build a WorkerUnavailableError
 * with the right status. The exported `MmrLookupOutcome` strips httpStatus.
 */
type MmrLookupOutcomeInternal = MmrLookupOutcome & { httpStatus?: number };

async function performMmrCall(
  params: MmrParams,
  env: Env,
): Promise<MmrLookupOutcomeInternal> {
  const hasServiceBinding = env.INTEL_WORKER !== undefined;
  const baseUrl =
    env.INTEL_WORKER_URL || (hasServiceBinding ? SERVICE_BINDING_PLACEHOLDER_BASE : "");
  if (!baseUrl) return { kind: "miss", reason: "not_configured", method: null };

  const { vin, year, make, model, mileage } = params;
  const useServiceBinding = hasServiceBinding;
  const serviceSecretConfigured = isConfiguredSecret(env.INTEL_WORKER_SECRET);

  let endpoint: string;
  let body: Record<string, unknown>;
  let confidence: ValuationConfidence;
  let method: ValuationMethod;
  let normalizationMeta:
    | {
        lookupMake: string | null;
        lookupModel: string | null;
        lookupTrim: string | null;
        normalizationConfidence: NormalizationConfidence;
      }
    | undefined;
  let catalogMatchSuggestions: CatalogMatchSuggestion[] | undefined;
  // Item 54: never invent odometer. Only forward listing-actual miles to intel;
  // when absent, omit mileage so Cox prices at segment average.
  const actualMileage =
    typeof mileage === "number" && Number.isFinite(mileage) && mileage > 0
      ? Math.round(mileage)
      : undefined;
  const mileageMeta =
    actualMileage !== undefined
      ? { mileageUsed: actualMileage, isInferredMileage: false as const }
      : { mileageUsed: null as number | null, isInferredMileage: false as const };

  if (vin) {
    // VIN path — normalization does not apply
    endpoint = `${baseUrl}/mmr/vin`;
    body = {
      vin,
      ...(year !== undefined && { year }),
      ...(actualMileage !== undefined && { mileage: actualMileage }),
    };
    confidence = "high";
    method = "vin";
  } else if (year !== undefined && make && model) {
    // YMM path — Cox YMMT requires bodyname (trim/style). Odometer is optional:
    // omit when listing miles are unknown (intel → Cox average). Do not invent
    // 15k×age miles (item 54).
    //
    // Item 55 Phase B: resolve listing → Cox catalog Y/M/M/S (item 46) before
    // MMR lookup so ingest sends the same tokens closers get on detail.
    const catalogFetch = (path: string, eventLabel: string) =>
      fetchCatalogItems({
        baseUrl,
        env,
        useServiceBinding,
        path,
        eventLabel,
        serviceSecretConfigured,
      });

    const db = getSupabaseClient(env);
    const offlineDeps = buildIngestCatalogOfflineDeps(db);

    const catalogResolved = await resolveListingToCatalogForIngest(
      {
        year,
        make,
        model,
        trim: params.trim,
        title: params.title,
      },
      catalogFetch,
      offlineDeps,
    );
    catalogMatchSuggestions = catalogResolved.catalogMatchSuggestions;
    const ref = await loadMmrReferenceData(db);
    const normalized = normalizeMmrParams(
      { make, model, trim: params.trim?.trim() || extractTitleTrim(params.title) || "" },
      ref,
    );

    if (catalogResolved.modelVariantAmbiguous && !catalogResolved.model) {
      log("ingest.mmr_catalog_model_variant_unmatched", {
        year,
        make: catalogResolved.make,
        model,
        title_present: typeof params.title === "string" && params.title.trim().length > 0,
        suggestion_count: catalogResolved.catalogMatchSuggestions?.length ?? 0,
        suggestions: catalogResolved.catalogMatchSuggestions?.slice(0, 3),
      });
      return {
        kind: "miss",
        reason: "model_variant_missing",
        method: "year_make_model",
        normalizationConfidence: normalized.normalizationConfidence,
        catalogMatchSuggestions,
        ...mileageMeta,
      };
    }

    const sendMake = catalogResolved.make ?? normalized.canonicalMake ?? make;
    const sendModel = catalogResolved.model ?? normalized.canonicalModel ?? model;
    let sendTrim =
      catalogResolved.style ??
      params.trim?.trim() ??
      normalized.trim?.trim() ??
      "";
    const lookupTrimEstimated = catalogResolved.style ? catalogResolved.styleEstimated : false;

    if (!sendTrim) {
      const derived = extractTitleTrim(params.title);
      if (derived) {
        sendTrim = derived;
        log("ingest.mmr_trim_from_title", { derived_trim: derived });
      }
    }

    if (!sendTrim) {
      return {
        kind: "miss",
        reason: "trim_missing",
        method: "year_make_model",
        normalizationConfidence: normalized.normalizationConfidence,
        catalogMatchSuggestions,
        ...mileageMeta,
      };
    }

    endpoint = `${baseUrl}/mmr/year-make-model`;
    body = {
      year,
      make: sendMake,
      model: sendModel,
      trim: sendTrim,
      ...(actualMileage !== undefined && { mileage: actualMileage }),
    };

    if (lookupTrimEstimated) {
      log("ingest.mmr_catalog_style_estimated", {
        year,
        make: sendMake,
        model: sendModel,
        style: sendTrim,
      });
    } else if (catalogResolved.variantEstimated) {
      log("ingest.mmr_catalog_variant_estimated", {
        year,
        make: sendMake,
        model: sendModel,
        style: sendTrim,
        suggestion_count: catalogResolved.catalogMatchSuggestions?.length ?? 0,
      });
    } else if (catalogResolved.style) {
      log("ingest.mmr_catalog_style_selected", {
        year,
        make: sendMake,
        model: sendModel,
        style: sendTrim,
      });
    }

    // exact and alias both yield "medium"; partial/none degrades to "low"
    confidence =
      lookupTrimEstimated ||
      normalized.normalizationConfidence === "partial" ||
      normalized.normalizationConfidence === "none"
        ? "low"
        : "medium";
    method = "year_make_model";

    normalizationMeta = {
      lookupMake: sendMake,
      lookupModel: sendModel,
      lookupTrim: sendTrim,
      normalizationConfidence: lookupTrimEstimated
        ? "partial"
        : normalized.normalizationConfidence,
    };
  } else {
    return { kind: "miss", reason: "insufficient_params", method: null };
  }

  // Prefer Cloudflare Service Binding when configured (avoids CF 1042 between
  // same-account Workers on public URLs).
  log("ingest.mmr_worker_called", {
    endpoint,
    http_method: "POST",
    method,
    vin_present:                   !!vin,
    body_keys:                     Object.keys(body).sort(),
    service_secret_header_present: serviceSecretConfigured,
    transport:                     useServiceBinding ? "service_binding" : "public_fetch",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tav-service-secret": env.INTEL_WORKER_SECRET,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  };

  let res: Response;
  try {
    res = useServiceBinding
      ? await env.INTEL_WORKER!.fetch(endpoint, requestInit)
      : await fetch(endpoint, requestInit);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        kind: "miss",
        reason: "cox_timeout",
        method,
        ...(normalizationMeta && { normalizationConfidence: normalizationMeta.normalizationConfidence }),
        ...mileageMeta,
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    return {
      kind: "miss",
      reason: "cox_rate_limited",
      method,
      ...mileageMeta,
    };
  }

  if (!res.ok) {
    // Read response body so the failure log captures intel's error envelope.
    // Capped at 500 chars to keep log lines bounded; truncation is explicit.
    let responseText = "";
    try {
      responseText = await res.text();
      if (responseText.length > 500) responseText = responseText.slice(0, 500) + "...[truncated]";
    } catch { /* body unreadable, log empty string */ }

    log("ingest.mmr_worker_http_error", {
      endpoint,
      http_method:                   "POST",
      status:                        res.status,
      body_keys:                     Object.keys(body).sort(),
      service_secret_header_present: serviceSecretConfigured,
      response_text:                 responseText,
    });

    return {
      kind: "miss",
      reason: classifyIntelHttpError(res.status, responseText),
      method,
      httpStatus: res.status,
      ...mileageMeta,
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return {
      kind: "miss",
      reason: "envelope_invalid",
      method,
      ...mileageMeta,
    };
  }

  const wrapped = IntelOkEnvelopeSchema.safeParse(data);
  if (!wrapped.success) {
    log("ingest.mmr_worker_envelope_invalid", {
      endpoint,
      issues: wrapped.error.issues.slice(0, 5),
    });
    return {
      kind: "miss",
      reason: "envelope_invalid",
      method,
      ...mileageMeta,
    };
  }

  const envelope = wrapped.data.data;
  if (!envelope.ok || envelope.mmr_value === null) {
    return {
      kind: "miss",
      reason: "cox_no_data",
      method,
      ...(normalizationMeta && { normalizationConfidence: normalizationMeta.normalizationConfidence }),
      mileageUsed: envelope.mileage_used ?? mileageMeta.mileageUsed,
      isInferredMileage: envelope.is_inferred_mileage ?? false,
    };
  }

  const result: MmrResult = {
    mmrValue: envelope.mmr_value,
    confidence,
    method,
    rawResponse: envelope.mmr_payload ?? {},
    ...normalizationMeta,
    mileageUsed: envelope.mileage_used ?? mileageMeta.mileageUsed,
    isInferredMileage: envelope.is_inferred_mileage ?? false,
    ...(envelope.is_inferred_mileage
      ? { mileageMethod: "estimated_annual_average" as const }
      : actualMileage !== undefined
        ? { mileageMethod: "actual" as const }
        : {}),
  };
  return {
    kind: "hit",
    result,
    ...(catalogMatchSuggestions && { catalogMatchSuggestions }),
  };
}

/**
 * Outcome-shaped MMR lookup. Returns a discriminated union of hit or miss
 * with a structured reason — never throws for expected non-blocking
 * failures (timeouts, 429, 5xx, envelope mismatch). Used by ingest for
 * per-listing valuation-miss observability so misses can be persisted
 * with a `missing_reason` instead of disappearing silently.
 */
export async function getMmrLookupOutcome(
  params: MmrParams,
  env: Env,
): Promise<MmrLookupOutcome> {
  const raw = await performMmrCall(params, env);
  if (raw.kind === "hit") {
    return {
      kind: "hit",
      result: raw.result,
      ...(raw.catalogMatchSuggestions && { catalogMatchSuggestions: raw.catalogMatchSuggestions }),
    };
  }
  // Strip the internal httpStatus from the exported outcome shape.
  return {
    kind: "miss",
    reason: raw.reason,
    method: raw.method,
    ...(raw.normalizationConfidence && { normalizationConfidence: raw.normalizationConfidence }),
    ...(raw.mileageUsed !== undefined && { mileageUsed: raw.mileageUsed }),
    ...(raw.isInferredMileage !== undefined && { isInferredMileage: raw.isInferredMileage }),
    ...(raw.catalogMatchSuggestions && { catalogMatchSuggestions: raw.catalogMatchSuggestions }),
  };
}

/**
 * Legacy null/throw-shape adapter preserved for /app/mmr/vin and any caller
 * that has not adopted the outcome shape. Internally delegates to
 * performMmrCall; translates miss reasons cox_timeout / cox_rate_limited /
 * cox_unavailable back into the historical thrown errors so the public
 * contract is unchanged.
 */
export async function getMmrValueFromWorker(
  params: MmrParams,
  env: Env,
): Promise<MmrResult | null> {
  const outcome = await performMmrCall(params, env);
  if (outcome.kind === "hit") return outcome.result;
  switch (outcome.reason) {
    case "cox_timeout":      throw new WorkerTimeoutError();
    case "cox_rate_limited": throw new WorkerRateLimitError();
    case "cox_bad_request":
    case "cox_auth":
    case "cox_vendor_auth":
    case "cox_vendor_bad_response":
    case "cox_unavailable":  throw new WorkerUnavailableError(outcome.httpStatus ?? 0);
    default:                 return null;
  }
}

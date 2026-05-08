import type { Env } from "../types/env";
import type { MmrParams, MmrResult } from "./mmr";
import { MmrResponseEnvelopeSchema } from "../types/intelligence";
import type { ValuationConfidence, ValuationMethod, NormalizationConfidence } from "../types/domain";
import { getSupabaseClient } from "../persistence/supabase";
import { loadMmrReferenceData } from "./loadMmrReferenceData";
import { normalizeMmrParams } from "./normalizeMmrParams";
import { log } from "../logging/logger";

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
 * Call tav-intelligence-worker for an MMR valuation lookup.
 *
 * Tries the VIN endpoint first if a VIN is present (bypasses normalization).
 * Falls back to the YMM endpoint when year+make+model+mileage are available;
 * normalizes make/model against reference data before sending.
 *
 * Returns null when:
 *   - INTEL_WORKER_URL is empty (not configured)
 *   - params are insufficient to form any request
 *   - the worker returns a negative-cache envelope (ok=false or mmr_value=null)
 *   - the response body cannot be parsed as MmrResponseEnvelope
 *
 * Throws WorkerTimeoutError, WorkerRateLimitError, or WorkerUnavailableError
 * for error conditions — callers must catch and treat as non-blocking.
 */
export async function getMmrValueFromWorker(
  params: MmrParams,
  env: Env,
): Promise<MmrResult | null> {
  const baseUrl = env.INTEL_WORKER_URL;
  if (!baseUrl) return null;

  const { vin, year, make, model, mileage } = params;

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

  if (vin) {
    // VIN path — normalization does not apply
    endpoint = `${baseUrl}/mmr/vin`;
    body = {
      vin,
      ...(year !== undefined && { year }),
      ...(mileage !== undefined && { mileage }),
    };
    confidence = "high";
    method = "vin";
  } else if (year !== undefined && make && model && mileage !== undefined) {
    // YMM path — normalize make/model via reference data before sending
    const db = getSupabaseClient(env);
    const ref = await loadMmrReferenceData(db);
    const normalized = normalizeMmrParams(
      { make, model, trim: params.trim ?? null },
      ref,
    );

    // Use canonical values when resolved; fall back to raw on partial/none
    const sendMake = normalized.canonicalMake ?? make;
    const sendModel = normalized.canonicalModel ?? model;

    endpoint = `${baseUrl}/mmr/year-make-model`;
    body = { year, make: sendMake, model: sendModel, mileage };
    // Cox MMR 1.4 YMMT requires bodyname (trim) as a path segment, so trim
    // must cross the boundary when present. normalized.trim is pass-through
    // today (no trim alias table); when alias work lands, it plugs in here
    // without changing the wire format.
    const sendTrim = normalized.trim?.trim();
    if (sendTrim) body.trim = sendTrim;

    // exact and alias both yield "medium"; partial/none degrades to "low"
    confidence =
      normalized.normalizationConfidence === "partial" ||
      normalized.normalizationConfidence === "none"
        ? "low"
        : "medium";
    method = "year_make_model";

    normalizationMeta = {
      lookupMake: normalized.canonicalMake,
      lookupModel: normalized.canonicalModel,
      lookupTrim: params.trim ?? null,
      normalizationConfidence: normalized.normalizationConfidence,
    };
  } else {
    return null;
  }

  log("ingest.mmr_worker_called", { endpoint, method, vin_present: !!vin });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tav-service-secret": env.INTEL_WORKER_SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new WorkerTimeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new WorkerRateLimitError();
  if (!res.ok) throw new WorkerUnavailableError(res.status);

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  const parsed = MmrResponseEnvelopeSchema.safeParse(data);
  if (!parsed.success) return null;

  const envelope = parsed.data;
  if (!envelope.ok || envelope.mmr_value === null) return null;

  return {
    mmrValue: envelope.mmr_value,
    confidence,
    method,
    rawResponse: envelope.mmr_payload ?? {},
    ...normalizationMeta,
  };
}

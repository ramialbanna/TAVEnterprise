import type { Env } from "../types/env";
import type { MmrParams, MmrResult } from "./mmr";
import { MmrResponseEnvelopeSchema } from "../types/intelligence";
import type { ValuationConfidence, ValuationMethod } from "../types/domain";

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
 * Tries the VIN endpoint first if a VIN is present; falls back to the
 * YMM endpoint when year+make+model+mileage are all available.
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

  if (vin) {
    endpoint = `${baseUrl}/mmr/vin`;
    body = {
      vin,
      ...(year !== undefined && { year }),
      ...(mileage !== undefined && { mileage }),
    };
    confidence = "high";
    method = "vin";
  } else if (year !== undefined && make && model && mileage !== undefined) {
    endpoint = `${baseUrl}/mmr/year-make-model`;
    body = { year, make, model, mileage };
    confidence = "medium";
    method = "year_make_model";
  } else {
    return null;
  }

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
  };
}

import { z } from "zod";

import { MmrResponseEnvelopeSchema } from "../../types/intelligence";
import { isConfiguredSecret } from "../../types/envValidation";
import type { MmrProvenance } from "../scoring/types";
import type { MaxbuyWorkerEnv } from "../types/env";
import { MAXBUY_INTELLIGENCE_CONTRACT_VERSION } from "../constants";

const INTEL_SERVICE_BINDING_BASE = "https://tav-intelligence-worker.internal";

const IntelOkEnvelopeSchema = z.object({
  success: z.literal(true),
  data: MmrResponseEnvelopeSchema,
});

export type MmrLookupResult =
  | { ok: true; envelope: z.infer<typeof MmrResponseEnvelopeSchema>; method: "vin" | "ymm" }
  | { ok: false; missingReason: string; method: "vin" | "ymm" | null };

function cacheAgeSeconds(fetchedAt: string): number | null {
  const fetched = new Date(fetchedAt).getTime();
  if (Number.isNaN(fetched)) return null;
  return Math.max(0, Math.round((Date.now() - fetched) / 1000));
}

export function mmrEnvelopeToProvenance(
  envelope: z.infer<typeof MmrResponseEnvelopeSchema>,
  method: "vin" | "ymm",
): MmrProvenance {
  return {
    value: envelope.mmr_value,
    method,
    source: envelope.source,
    cacheAgeSeconds: cacheAgeSeconds(envelope.fetched_at),
    missingReason: envelope.ok ? envelope.error_code : envelope.error_code ?? "not_found",
    observedAt: envelope.fetched_at,
  };
}

export async function lookupMmrByVin(
  env: MaxbuyWorkerEnv,
  input: { vin: string; mileage?: number; year?: number },
): Promise<MmrLookupResult> {
  const hasBinding = env.INTEL_WORKER !== undefined;
  const baseUrl =
    env.INTEL_WORKER_URL || (hasBinding ? INTEL_SERVICE_BINDING_BASE : "");
  if (!baseUrl || !isConfiguredSecret(env.INTEL_WORKER_SECRET)) {
    return { ok: false, missingReason: "not_configured", method: null };
  }

  const body: Record<string, unknown> = { vin: input.vin };
  if (input.mileage !== undefined) body.mileage = input.mileage;
  if (input.year !== undefined) body.year = input.year;

  const headers = new Headers({
    "Content-Type": "application/json",
    "x-tav-service-secret": env.INTEL_WORKER_SECRET,
    "x-tav-intelligence-contract-version": MAXBUY_INTELLIGENCE_CONTRACT_VERSION,
  });

  const init: RequestInit = { method: "POST", headers, body: JSON.stringify(body) };
  const response = hasBinding
    ? await env.INTEL_WORKER!.fetch(`${baseUrl}/mmr/vin`, init)
    : await fetch(`${baseUrl}/mmr/vin`, init);

  if (!response.ok) {
    return { ok: false, missingReason: `intel_http_${response.status}`, method: "vin" };
  }

  let parsed: z.infer<typeof IntelOkEnvelopeSchema>;
  try {
    parsed = IntelOkEnvelopeSchema.parse(await response.json());
  } catch {
    return { ok: false, missingReason: "envelope_invalid", method: "vin" };
  }

  return { ok: true, envelope: parsed.data, method: "vin" };
}

export async function lookupMmrByYmm(
  env: MaxbuyWorkerEnv,
  input: { year: number; make: string; model: string; trim?: string; mileage?: number },
): Promise<MmrLookupResult> {
  const hasBinding = env.INTEL_WORKER !== undefined;
  const baseUrl =
    env.INTEL_WORKER_URL || (hasBinding ? INTEL_SERVICE_BINDING_BASE : "");
  if (!baseUrl || !isConfiguredSecret(env.INTEL_WORKER_SECRET)) {
    return { ok: false, missingReason: "not_configured", method: null };
  }

  const body: Record<string, unknown> = {
    year: input.year,
    make: input.make,
    model: input.model,
    trim: input.trim ?? undefined,
  };
  if (input.mileage !== undefined) body.mileage = input.mileage;

  const headers = new Headers({
    "Content-Type": "application/json",
    "x-tav-service-secret": env.INTEL_WORKER_SECRET,
    "x-tav-intelligence-contract-version": MAXBUY_INTELLIGENCE_CONTRACT_VERSION,
  });

  const init: RequestInit = { method: "POST", headers, body: JSON.stringify(body) };
  const response = hasBinding
    ? await env.INTEL_WORKER!.fetch(`${baseUrl}/mmr/year-make-model`, init)
    : await fetch(`${baseUrl}/mmr/year-make-model`, init);

  if (!response.ok) {
    return { ok: false, missingReason: `intel_http_${response.status}`, method: "ymm" };
  }

  let parsed: z.infer<typeof IntelOkEnvelopeSchema>;
  try {
    parsed = IntelOkEnvelopeSchema.parse(await response.json());
  } catch {
    return { ok: false, missingReason: "envelope_invalid", method: "ymm" };
  }

  return { ok: true, envelope: parsed.data, method: "ymm" };
}

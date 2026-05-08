/**
 * @deprecated Legacy direct Manheim client for the main worker.
 *
 * This module performs Manheim MMR lookups inline within the ingest pipeline.
 * It predates the tav-intelligence-worker and will be retired once the worker
 * path (MANHEIM_LOOKUP_MODE="worker") is fully implemented.
 *
 * DO NOT add new Manheim/Cox fields or valuation logic here. New work belongs
 * in workers/tav-intelligence-worker and src/types/domain.ts (ValuationResult).
 */
import type { Env } from "../types/env";
import type { ValuationConfidence, ValuationMethod, NormalizationConfidence } from "../types/domain";

export interface MmrResult {
  mmrValue: number;
  confidence: ValuationConfidence;
  method?: ValuationMethod; // absent on KV-cached entries written before this field existed
  rawResponse: unknown;
  // G.5.3: normalization metadata — present on YMM-path results only
  lookupMake?: string | null;
  lookupModel?: string | null;
  lookupTrim?: string | null;
  normalizationConfidence?: NormalizationConfidence;
}

export interface MmrParams {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
}

const TOKEN_KV_KEY = "manheim:token";
const TOKEN_TTL_S = 86000;  // Manheim tokens expire at ~86399s (≈24h); cache slightly shorter
const VIN_TTL_S = 86400;    // 24h — VIN values are stable
const YMM_TTL_S = 21600;    // 6h  — YMM bucket values drift more with market

// Rounds mileage to the nearest 10,000-mile floor for YMM cache keys.
// e.g. 82_400 → 80_000, giving good hit rates without sacrificing accuracy.
export function mileageBucket(mileage: number): number {
  return Math.floor(mileage / 10_000) * 10_000;
}

export function kvKeyForVin(vin: string): string {
  return `mmr:vin:${vin.toUpperCase()}`;
}

export function kvKeyForYmm(year: number, make: string, model: string, mileage: number): string {
  return `mmr:ymm:${year}:${make.toLowerCase()}:${model.toLowerCase()}:${mileageBucket(mileage)}`;
}

async function getManheimToken(env: Env, kv: KVNamespace): Promise<string> {
  const cached = await kv.get(TOKEN_KV_KEY);
  if (cached) return cached;

  const body = new URLSearchParams({
    grant_type: "password",
    username: env.MANHEIM_USERNAME,
    password: env.MANHEIM_PASSWORD,
    client_id: env.MANHEIM_CLIENT_ID,
    client_secret: env.MANHEIM_CLIENT_SECRET,
  });

  const res = await fetch(env.MANHEIM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Manheim token fetch failed: HTTP ${res.status}`);
  }

  const data = await res.json() as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Manheim token response missing access_token");
  }

  await kv.put(TOKEN_KV_KEY, data.access_token, { expirationTtl: TOKEN_TTL_S });
  return data.access_token;
}

// Extracts the wholesale mileage-adjusted MMR value from Manheim API responses.
// Field names vary by endpoint and API version — checked in priority order.
function extractMmrValue(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  const candidate = Array.isArray(d.items) ? d.items[0] : d;
  if (!candidate || typeof candidate !== "object") return null;

  const t = candidate as Record<string, unknown>;

  // Preferred: mileage+build adjusted wholesale (VIN endpoint response shape)
  if (t.adjustedPricing && typeof t.adjustedPricing === "object") {
    const ap = t.adjustedPricing as Record<string, unknown>;
    if (ap.wholesale && typeof ap.wholesale === "object") {
      const w = ap.wholesale as Record<string, unknown>;
      if (typeof w.average === "number" && w.average > 0) return Math.round(w.average);
    }
  }

  // Flat numeric fields (some search responses)
  for (const key of ["adjustedWholesaleAverage", "wholesaleMileageAdjusted", "wholesaleAverage", "mmrValue", "average", "value"]) {
    const v = t[key];
    if (typeof v === "number" && v > 0) return Math.round(v);
  }

  // Base wholesale object fallback (unadjusted — used when no mileage was passed)
  if (t.wholesale && typeof t.wholesale === "object") {
    const w = t.wholesale as Record<string, unknown>;
    if (typeof w.average === "number" && w.average > 0) return Math.round(w.average);
  }

  return null;
}

async function getMmrByVin(
  vin: string,
  mileage: number | undefined,
  token: string,
  baseUrl: string,
): Promise<MmrResult | null> {
  const url = new URL(`/valuations/vin/${encodeURIComponent(vin)}`, baseUrl);
  if (mileage !== undefined) url.searchParams.set("odometer", String(mileage));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error(JSON.stringify({ event: "mmr.vin_http_error", status: res.status }));
    return null;
  }

  const data: unknown = await res.json();
  const mmrValue = extractMmrValue(data);
  if (!mmrValue) return null;

  return { mmrValue, confidence: "high", method: "vin", rawResponse: data };
}

async function getMmrByYmm(
  year: number,
  make: string,
  model: string,
  mileage: number,
  token: string,
  baseUrl: string,
): Promise<MmrResult | null> {
  // Manheim MMR search uses path segments, not query params:
  //   GET /valuations/search/{year}/{make}/{model}?odometer=N&include=ci
  // Passing year/make/model as query params returns HTTP 596 ("URL may be malformed").
  const url = new URL(
    `/valuations/search/${encodeURIComponent(year)}/${encodeURIComponent(make)}/${encodeURIComponent(model)}`,
    baseUrl,
  );
  url.searchParams.set("odometer", String(mileage));
  url.searchParams.set("include", "ci");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error(JSON.stringify({ event: "mmr.ymm_http_error", status: res.status }));
    return null;
  }

  const data: unknown = await res.json();
  const mmrValue = extractMmrValue(data);
  if (!mmrValue) return null;

  return { mmrValue, confidence: "medium", method: "year_make_model", rawResponse: data };
}

/**
 * @deprecated Use MANHEIM_LOOKUP_MODE="worker" to route through tav-intelligence-worker.
 * Called only when MANHEIM_LOOKUP_MODE is "direct" (or absent). Tries VIN first
 * (high confidence), falls back to YMM. Returns null if neither path yields a value.
 */
export async function getMmrValue(params: MmrParams, env: Env, kv: KVNamespace): Promise<MmrResult | null> {
  const { vin, year, make, model, mileage } = params;

  if (vin) {
    const vinKey = kvKeyForVin(vin);
    const cached = await kv.get(vinKey);
    if (cached) return JSON.parse(cached) as MmrResult;

    try {
      const token = await getManheimToken(env, kv);
      const result = await getMmrByVin(vin, mileage, token, env.MANHEIM_MMR_URL);
      if (result) {
        await kv.put(vinKey, JSON.stringify(result), { expirationTtl: VIN_TTL_S });
        return result;
      }
    } catch (err) {
      // VIN lookup failed — fall through to YMM
      console.error(JSON.stringify({ event: "mmr.vin_failed", error: err instanceof Error ? err.message : String(err) }));
    }
  }

  if (year !== undefined && make && model && mileage !== undefined) {
    const ymmKey = kvKeyForYmm(year, make, model, mileage);
    const cached = await kv.get(ymmKey);
    if (cached) return JSON.parse(cached) as MmrResult;

    try {
      const token = await getManheimToken(env, kv);
      const result = await getMmrByYmm(year, make, model, mileage, token, env.MANHEIM_MMR_URL);
      if (result) {
        await kv.put(ymmKey, JSON.stringify(result), { expirationTtl: YMM_TTL_S });
        return result;
      }
      // Token obtained but no extractable MMR value in response
      console.error(JSON.stringify({ event: "mmr.ymm_no_value", year, make, model, mileage }));
    } catch (err) {
      // Log the real error so it surfaces in wrangler tail
      console.error(JSON.stringify({ event: "mmr.ymm_failed", error: err instanceof Error ? err.message : String(err), year, make, model }));
    }
  }

  return null;
}

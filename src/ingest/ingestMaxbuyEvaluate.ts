import type { Env } from "../types/env";
import type { RegionKey, NormalizedListingInput } from "../types/domain";
import type { MmrResult } from "../valuation/mmr";
import { MAXBUY_CONTRACT_VERSION } from "../maxbuy/api/schemas";
import { fireMaxbuyEvaluateBackground, INGEST_MAXBUY_USER_ID } from "../app/maxbuyProxy";

export { INGEST_MAXBUY_USER_ID };

export type IngestMaxbuyEvaluateInput = {
  normalizedListingId: string;
  listing: Pick<
    NormalizedListingInput,
    "vin" | "year" | "make" | "model" | "trim" | "mileage" | "price" | "region"
  >;
  mmrResult: MmrResult;
};

/**
 * Build a Max buy evaluate body from ingest MMR hit + listing fields.
 * Uses Cox lookup tokens from the MMR result when present (item 59).
 * Returns null when identity or asking price is insufficient.
 */
export function buildIngestMaxbuyEvaluateBody(
  input: IngestMaxbuyEvaluateInput,
): Record<string, unknown> | null {
  const { listing, mmrResult, normalizedListingId } = input;
  if (listing.price == null || listing.price < 0) return null;

  const region = listing.region;
  if (!region) return null;

  const providedMmr = {
    mmr_value: mmrResult.mmrValue,
    mmr_method: mmrResult.method === "vin" ? "vin" : "ymm",
  };

  const vin = listing.vin?.trim();
  if (vin) {
    const year = listing.year;
    const make = mmrResult.lookupMake ?? listing.make;
    const model = mmrResult.lookupModel ?? listing.model;
    const trim = mmrResult.lookupTrim ?? listing.trim;
    return {
      contract_version: MAXBUY_CONTRACT_VERSION,
      vin,
      mileage: listing.mileage ?? undefined,
      asking_price: listing.price,
      region,
      normalized_listing_id: normalizedListingId,
      ...providedMmr,
      ...(year != null ? { year } : {}),
      ...(make?.trim() ? { make } : {}),
      ...(model?.trim() ? { model } : {}),
      ...(trim?.trim() ? { trim: trim.trim() } : {}),
    };
  }

  const year = listing.year;
  const make = mmrResult.lookupMake ?? listing.make;
  const model = mmrResult.lookupModel ?? listing.model;
  if (year == null || !make?.trim() || !model?.trim()) return null;

  const trim = mmrResult.lookupTrim ?? listing.trim ?? undefined;
  const body: Record<string, unknown> = {
    contract_version: MAXBUY_CONTRACT_VERSION,
    year,
    make,
    model,
    mileage: listing.mileage ?? undefined,
    asking_price: listing.price,
    region: region as RegionKey,
    normalized_listing_id: normalizedListingId,
    ...providedMmr,
  };
  if (trim?.trim()) body.trim = trim.trim();
  return body;
}

/** Non-blocking Max buy evaluate after ingest MMR hit (item 59). */
export function scheduleIngestMaxbuyEvaluate(
  execCtx: ExecutionContext,
  env: Env,
  body: Record<string, unknown>,
): void {
  if (env.MAXBUY_EVALUATE_ENABLED !== "true") return;
  execCtx.waitUntil(fireMaxbuyEvaluateBackground(env, INGEST_MAXBUY_USER_ID, body));
}

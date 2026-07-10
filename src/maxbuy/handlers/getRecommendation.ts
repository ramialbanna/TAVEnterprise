import { buildEvaluateResponse } from "../evaluateRun";
import { getRecommendationById } from "../persistence/recommendations";
import { fetchHistoricalSummary } from "../persistence/vehicleContext";
import type { ScoreMaxBuyResult, SegmentKey } from "../scoring/types";
import type { MaxbuyWorkerEnv } from "../types/env";
import { getSupabaseClient } from "../../persistence/supabase";
import { json } from "./http";

export async function handleGetRecommendation(
  env: MaxbuyWorkerEnv,
  recommendationId: string,
): Promise<Response> {
  const db = getSupabaseClient(env);
  const row = await getRecommendationById(db, recommendationId);
  if (!row) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  const lookup = Array.isArray(row.maxbuy_lookups)
    ? row.maxbuy_lookups[0]
    : row.maxbuy_lookups;

  if (!lookup) {
    return json({ ok: false, error: "lookup_missing" }, 404);
  }

  const featureVector = row.feature_vector as Record<string, unknown>;
  const segment = featureVector.segment as SegmentKey | undefined;
  const askingPrice = lookup.asking_price != null ? Number(lookup.asking_price) : null;

  const historical = segment
    ? await fetchHistoricalSummary(db, segment)
    : {
        nUnits: 0,
        avgBuy: null,
        avgSale: null,
        avgGross: null,
        avgRecon: null,
        avgDaysToSale: null,
        outcomeDistribution: {},
      };

  const score: ScoreMaxBuyResult = {
    displayState: askingPrice != null ? "deal_fit" : "vehicle_fit",
    verdict: row.verdict as ScoreMaxBuyResult["verdict"],
    expectedSalePrice: Number(row.expected_sale_price),
    expectedTransport: Number(featureVector.expected_transport ?? 0),
    expectedExpenses: Number(featureVector.expected_expenses ?? 0),
    expectedNetGross: row.expected_net_gross != null ? Number(row.expected_net_gross) : null,
    recommendedMaxBuy: Number(row.recommended_max_buy),
    deltaToAsk:
      askingPrice != null ? Number(row.recommended_max_buy) - askingPrice : null,
    dataStrength: row.data_strength as ScoreMaxBuyResult["dataStrength"],
    reasonCodes: row.reason_codes as string[],
    estimatedBadges: row.estimated_badges as string[],
    hardGateTriggered: (row.reason_codes as string[]).find((code) => code.startsWith("GATE_")) ?? null,
    featureVector,
  };

  const data = buildEvaluateResponse(
    row.id,
    lookup.vin,
    {
      year: segment?.year ?? null,
      make: segment?.make ?? null,
      model: segment?.model ?? null,
      trim: segment?.trim ?? null,
      mileage: lookup.mileage != null ? Number(lookup.mileage) : null,
      mileageEstimated: Boolean(lookup.is_estimated_miles),
    },
    {
      value: row.mmr_value != null ? Number(row.mmr_value) : null,
      method: (row.mmr_method as "vin" | "ymm" | null) ?? null,
      source: row.mmr_source,
      cacheAgeSeconds: row.mmr_cache_age_seconds,
      missingReason: row.mmr_missing_reason,
      observedAt: row.mmr_observed_at,
    },
    historical,
    score,
    row.benchmark_version,
    row.policy_version,
  );

  if (!segment) {
    data.vehicle.mileage = lookup.mileage != null ? Number(lookup.mileage) : null;
    data.vehicle.mileage_estimated = Boolean(lookup.is_estimated_miles);
    data.vehicle.trim = data.vehicle.trim ?? "base";
  }

  return json({ ok: true, data });
}

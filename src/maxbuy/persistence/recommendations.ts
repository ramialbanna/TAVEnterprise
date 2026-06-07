import type { SupabaseClient } from "../../persistence/supabase";
import type { ScoreMaxBuyResult } from "../scoring/types";
import {
  MAXBUY_FEATURE_VIEW_VERSION,
  MAXBUY_INTELLIGENCE_CONTRACT_VERSION,
  MAXBUY_SCORING_VERSION,
} from "../constants";
import type { MmrProvenance } from "../scoring/types";

export type PersistRecommendationInput = {
  userId: string;
  /** null for YMM-only evaluations (OPEN-5) */
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string;
  mileage: number | null;
  mileageEstimated: boolean;
  askingPrice: number | null;
  normalizedListingId?: string;
  leadId?: string;
  score: ScoreMaxBuyResult;
  mmr: MmrProvenance;
  benchmarkVersion: string;
  policyVersion: string;
  workerVersion: string;
};

export type PersistedRecommendation = {
  lookupId: string;
  recommendationId: string;
};

export async function persistRecommendation(
  db: SupabaseClient,
  input: PersistRecommendationInput,
): Promise<PersistedRecommendation> {
  const { data: lookup, error: lookupError } = await db
    .from("maxbuy_lookups")
    .insert({
      user_id: input.userId,
      vin: input.vin ?? null,
      year: input.year,
      make: input.make,
      model: input.model,
      trim: input.trim,
      mileage: input.mileage,
      is_estimated_miles: input.mileageEstimated,
      asking_price: input.askingPrice,
    })
    .select("id")
    .single();

  if (lookupError) throw lookupError;

  const verdictForDb = input.score.verdict ?? "PASS";

  const { data: rec, error: recError } = await db
    .from("maxbuy_recommendations")
    .insert({
      lookup_id: lookup.id,
      normalized_listing_id: input.normalizedListingId ?? null,
      lead_id: input.leadId ?? null,
      expected_sale_price: input.score.expectedSalePrice,
      expected_net_gross: input.score.expectedNetGross ?? 0,
      recommended_max_buy: input.score.recommendedMaxBuy,
      verdict: verdictForDb,
      data_strength: input.score.dataStrength,
      reason_codes: input.score.reasonCodes,
      estimated_badges: input.score.estimatedBadges,
      benchmark_version: input.benchmarkVersion,
      feature_view_version: MAXBUY_FEATURE_VIEW_VERSION,
      feature_vector: input.score.featureVector,
      policy_version: input.policyVersion,
      scoring_version: MAXBUY_SCORING_VERSION,
      worker_version: input.workerVersion,
      intelligence_worker_contract_version: MAXBUY_INTELLIGENCE_CONTRACT_VERSION,
      mmr_value: input.mmr.value,
      mmr_method: input.mmr.method,
      mmr_source: input.mmr.source,
      mmr_cache_age_seconds: input.mmr.cacheAgeSeconds,
      mmr_missing_reason: input.mmr.missingReason,
      mmr_observed_at: input.mmr.observedAt,
    })
    .select("id")
    .single();

  if (recError) throw recError;

  return { lookupId: lookup.id, recommendationId: rec.id };
}

export async function insertOverride(
  db: SupabaseClient,
  input: {
    recommendationId: string;
    buyerUserId: string;
    overrideType: string;
    overrideNote?: string;
    actedPrice?: number;
  },
): Promise<string> {
  const { data, error } = await db
    .from("maxbuy_overrides")
    .insert({
      recommendation_id: input.recommendationId,
      buyer_user_id: input.buyerUserId,
      override_type: input.overrideType,
      override_note: input.overrideNote ?? null,
      acted_price: input.actedPrice ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function insertPass(
  db: SupabaseClient,
  input: {
    /** null for YMM-only passes (OPEN-5) */
    vin: string | null;
    year?: number;
    make?: string;
    model?: string;
    recommendationId?: string;
    askingPrice?: number;
    bidPrice?: number;
    mmrValue?: number;
    buyerUserId: string;
    passReason: string;
  },
): Promise<string> {
  const { data, error } = await db
    .from("maxbuy_evaluated_passes")
    .insert({
      vin: input.vin ?? null,
      year: input.year ?? null,
      make: input.make ?? null,
      model: input.model ?? null,
      recommendation_id: input.recommendationId ?? null,
      asking_price: input.askingPrice ?? null,
      bid_price: input.bidPrice ?? null,
      mmr_value: input.mmrValue ?? null,
      buyer_user_id: input.buyerUserId,
      pass_reason: input.passReason,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function getRecommendationById(
  db: SupabaseClient,
  recommendationId: string,
) {
  const { data, error } = await db
    .from("maxbuy_recommendations")
    .select(`
      id,
      lookup_id,
      expected_sale_price,
      expected_net_gross,
      recommended_max_buy,
      verdict,
      data_strength,
      reason_codes,
      estimated_badges,
      benchmark_version,
      feature_view_version,
      feature_vector,
      policy_version,
      scoring_version,
      worker_version,
      intelligence_worker_contract_version,
      mmr_value,
      mmr_method,
      mmr_source,
      mmr_cache_age_seconds,
      mmr_missing_reason,
      mmr_observed_at,
      created_at,
      maxbuy_lookups (
        vin,
        mileage,
        is_estimated_miles,
        asking_price
      )
    `)
    .eq("id", recommendationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

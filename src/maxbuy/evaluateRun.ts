import type { MaxbuyEvaluateRequest } from "./api/schemas";
import { MAXBUY_CONTRACT_VERSION } from "./api/schemas";
import {
  lookupMmrByVin,
  lookupMmrByYmm,
  mmrEnvelopeToProvenance,
} from "./clients/intelligence";
import {
  MAXBUY_FEATURE_VIEW_VERSION,
  MAXBUY_SCORING_VERSION,
  MAXBUY_WORKER_VERSION,
} from "./constants";
import { runHardGates } from "./gates/runGates";
import {
  fetchExpenseBenchmarkRows,
  fetchPricingBenchmarkRows,
  fetchTransportBenchmarkRows,
  pickBenchmarkVersion,
} from "./persistence/benchmarks";
import { getCurrentTargetNetGross } from "./persistence/policy";
import { persistRecommendation } from "./persistence/recommendations";
import {
  fetchHistoricalSummary,
  resolveVehicleContext,
  type VehicleContext,
} from "./persistence/vehicleContext";
import { estimateMileage, mileageBand, resolveBenchmarks, scoreMaxBuy } from "./scoring";
import type { ScoreMaxBuyResult, SegmentKey } from "./scoring/types";
import type { MaxbuyWorkerEnv } from "./types/env";
import { decodeVinModelYear, isValidVinCheckDigit, normalizeVin } from "./vin";
import { getSupabaseClient } from "../persistence/supabase";

export type EvaluateRunError =
  | { code: "invalid_vin"; message: string }
  | { code: "vehicle_context_missing"; message: string }
  | { code: "ymm_required"; message: string }
  | { code: "internal_error"; message: string };

export type MaxbuyEvaluateResponse = {
  contract_version: typeof MAXBUY_CONTRACT_VERSION;
  recommendation_id: string;
  vehicle: {
    vin: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    mileage: number;
    mileage_estimated: boolean;
  };
  mmr: {
    value: number | null;
    method: "vin" | "ymm" | null;
    source: string | null;
    cache_age_seconds: number | null;
    missing_reason: string | null;
    observed_at: string | null;
  };
  tav_historical: {
    n_units: number;
    avg_buy: number | null;
    avg_sale: number | null;
    avg_gross: number | null;
    avg_recon: number | null;
    avg_days_to_sale: number | null;
    outcome_distribution: Record<string, number>;
  };
  economics: {
    expected_sale_price: number;
    expected_transport: number;
    expected_expenses: number;
    expected_net_gross: number | null;
  };
  verdict: {
    display_state: "deal_fit" | "vehicle_fit";
    verdict: "STRONG_BUY" | "BUY" | "REVIEW" | "PASS" | null;
    recommended_max_buy: number;
    delta_to_ask: number | null;
    data_strength: "low" | "medium" | "high";
    reason_codes: string[];
    estimated_badges: string[];
    hard_gate_triggered: string | null;
  };
  versions: {
    benchmark_version: string;
    feature_view_version: string;
    policy_version: string;
    scoring_version: string;
    model_artifact_hash: null;
  };
};

export function buildEvaluateResponse(
  recommendationId: string,
  vin: string | null,
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    mileage: number;
    mileageEstimated: boolean;
  },
  mmr: ReturnType<typeof mmrEnvelopeToProvenance>,
  historical: Awaited<ReturnType<typeof fetchHistoricalSummary>>,
  score: ScoreMaxBuyResult,
  benchmarkVersion: string,
  policyVersion: string,
): MaxbuyEvaluateResponse {
  return {
    contract_version: MAXBUY_CONTRACT_VERSION,
    recommendation_id: recommendationId,
    vehicle: {
      vin,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      mileage: vehicle.mileage,
      mileage_estimated: vehicle.mileageEstimated,
    },
    mmr: {
      value: mmr.value,
      method: mmr.method,
      source: mmr.source,
      cache_age_seconds: mmr.cacheAgeSeconds,
      missing_reason: mmr.missingReason,
      observed_at: mmr.observedAt,
    },
    tav_historical: {
      n_units: historical.nUnits,
      avg_buy: historical.avgBuy,
      avg_sale: historical.avgSale,
      avg_gross: historical.avgGross,
      avg_recon: historical.avgRecon,
      avg_days_to_sale: historical.avgDaysToSale,
      outcome_distribution: historical.outcomeDistribution,
    },
    economics: {
      expected_sale_price: score.expectedSalePrice,
      expected_transport: score.expectedTransport,
      expected_expenses: score.expectedExpenses,
      expected_net_gross: score.expectedNetGross,
    },
    verdict: {
      display_state: score.displayState,
      verdict: score.verdict,
      recommended_max_buy: score.recommendedMaxBuy,
      delta_to_ask: score.deltaToAsk,
      data_strength: score.dataStrength,
      reason_codes: score.reasonCodes,
      estimated_badges: score.estimatedBadges,
      hard_gate_triggered: score.hardGateTriggered,
    },
    versions: {
      benchmark_version: benchmarkVersion,
      feature_view_version: MAXBUY_FEATURE_VIEW_VERSION,
      policy_version: policyVersion,
      scoring_version: MAXBUY_SCORING_VERSION,
      model_artifact_hash: null,
    },
  };
}

export async function runEvaluate(
  env: MaxbuyWorkerEnv,
  userId: string,
  request: MaxbuyEvaluateRequest,
): Promise<{ ok: true; data: MaxbuyEvaluateResponse } | { ok: false; error: EvaluateRunError }> {
  const rawVin = request.vin?.trim();
  const hasVin = Boolean(rawVin);

  const db = getSupabaseClient(env);

  let vin: string | null = null;
  let vehicleCtx: VehicleContext | null = null;
  let vinAbsent = false;

  if (hasVin) {
    // ── VIN path ──────────────────────────────────────────────────────────────
    vin = normalizeVin(rawVin!);
    if (!isValidVinCheckDigit(vin)) {
      return { ok: false, error: { code: "invalid_vin", message: "VIN must be 17 characters with valid check digit" } };
    }

    const vinModelYear = decodeVinModelYear(vin);
    vehicleCtx = await resolveVehicleContext(
      db,
      { vin, region: request.region, normalizedListingId: request.normalized_listing_id },
      vinModelYear,
    );

    if (!vehicleCtx) {
      return {
        ok: false,
        error: {
          code: "vehicle_context_missing",
          message: "Unable to resolve year/make/model for VIN — provide normalized_listing_id or region with decodable VIN",
        },
      };
    }
  } else {
    // ── YMM path (OPEN-5) ─────────────────────────────────────────────────────
    vinAbsent = true;

    // year/make/model are guaranteed by the schema refinement
    const baseCtx: VehicleContext = {
      year: request.year!,
      make: request.make!.toLowerCase(),
      model: request.model!.toLowerCase(),
      trim: (request.trim ?? "base").toLowerCase(),
      region: (request.region ?? "unknown").toLowerCase(),
      cotCity: null,
      cotState: null,
    };

    // Optionally enrich region/cotCity/cotState from the linked normalized listing
    if (request.normalized_listing_id) {
      const listingCtx = await resolveVehicleContext(
        db,
        { normalizedListingId: request.normalized_listing_id, region: request.region },
        null,
      );
      if (listingCtx) {
        baseCtx.region = listingCtx.region !== "unknown" ? listingCtx.region : baseCtx.region;
        baseCtx.cotCity = listingCtx.cotCity;
        baseCtx.cotState = listingCtx.cotState;
      }
    }

    vehicleCtx = baseCtx;
  }

  let mileage = request.mileage ?? null;
  let mileageEstimated = false;
  if (mileage == null) {
    mileage = estimateMileage(vehicleCtx.year);
    mileageEstimated = true;
  }

  const segment: SegmentKey = {
    year: vehicleCtx.year,
    make: vehicleCtx.make,
    model: vehicleCtx.model,
    trim: vehicleCtx.trim,
    region: vehicleCtx.region,
    mileageBand: mileageBand(mileage),
  };

  // ── MMR lookup ───────────────────────────────────────────────────────────────
  let mmrLookup = hasVin && vin
    ? await lookupMmrByVin(env, { vin, mileage, year: vehicleCtx.year })
    : { ok: false as const, missingReason: "vin_absent", method: null as null };

  if (!hasVin || !mmrLookup.ok || (mmrLookup.ok && mmrLookup.envelope.mmr_value == null)) {
    mmrLookup = await lookupMmrByYmm(env, {
      year: vehicleCtx.year,
      make: vehicleCtx.make,
      model: vehicleCtx.model,
      trim: vehicleCtx.trim === "base" ? undefined : vehicleCtx.trim,
      mileage,
    });
  }

  const mmr = mmrLookup.ok
    ? mmrEnvelopeToProvenance(mmrLookup.envelope, mmrLookup.method)
    : {
        value: null,
        method: null as null,
        source: null,
        cacheAgeSeconds: null,
        missingReason: mmrLookup.missingReason,
        observedAt: null,
      };

  // Title/condition gates require a VIN — not evaluated on YMM-only runs.
  const hardGate = vin ? runHardGates({ vin }) : null;

  const [pricingRows, transportRows, expenseRows, policy, historical] = await Promise.all([
    fetchPricingBenchmarkRows(db, segment),
    fetchTransportBenchmarkRows(db, segment, vehicleCtx.cotCity, vehicleCtx.cotState),
    fetchExpenseBenchmarkRows(db, segment),
    getCurrentTargetNetGross(db),
    fetchHistoricalSummary(db, segment),
  ]);

  const benchmarkVersion = pickBenchmarkVersion(pricingRows, transportRows, expenseRows);
  const benchmarks = resolveBenchmarks(
    pricingRows,
    transportRows,
    expenseRows,
    segment,
    vehicleCtx.cotCity,
    vehicleCtx.cotState,
  );

  const score = scoreMaxBuy({
    segment,
    mmr,
    askingPrice: request.asking_price ?? null,
    mileageEstimated,
    benchmarks,
    targetNetGross: policy.targetNetGross,
    hardGate,
    cotCity: vehicleCtx.cotCity,
    cotState: vehicleCtx.cotState,
    vinAbsent,
  });

  const persisted = await persistRecommendation(db, {
    userId,
    vin,
    year: vehicleCtx.year,
    make: vehicleCtx.make,
    model: vehicleCtx.model,
    trim: vehicleCtx.trim,
    mileage,
    mileageEstimated,
    askingPrice: request.asking_price ?? null,
    normalizedListingId: request.normalized_listing_id,
    leadId: request.lead_id,
    score,
    mmr,
    benchmarkVersion,
    policyVersion: policy.policyVersion,
    workerVersion: MAXBUY_WORKER_VERSION,
  });

  return {
    ok: true,
    data: buildEvaluateResponse(
      persisted.recommendationId,
      vin,
      {
        year: vehicleCtx.year,
        make: vehicleCtx.make,
        model: vehicleCtx.model,
        trim: vehicleCtx.trim,
        mileage,
        mileageEstimated,
      },
      mmr,
      historical,
      score,
      benchmarkVersion,
      policy.policyVersion,
    ),
  };
}

/** Replay scoring from a pinned feature vector (for CI). */
export function replayFromFeatureVector(
  featureVector: Record<string, unknown>,
  input: {
    segment: SegmentKey;
    mmr: { value: number | null; method: "vin" | "ymm" | null };
    askingPrice: number | null;
    mileageEstimated: boolean;
    benchmarks: ReturnType<typeof resolveBenchmarks>;
    targetNetGross: number;
    hardGate: string | null;
  },
): ScoreMaxBuyResult {
  const score = scoreMaxBuy({
    segment: input.segment,
    mmr: {
      value: input.mmr.value,
      method: input.mmr.method,
      source: "manheim",
      cacheAgeSeconds: null,
      missingReason: null,
      observedAt: null,
    },
    askingPrice: input.askingPrice,
    mileageEstimated: input.mileageEstimated,
    benchmarks: input.benchmarks,
    targetNetGross: input.targetNetGross,
    hardGate: input.hardGate,
  });

  const expectedMaxBuy = featureVector.recommended_max_buy;
  if (typeof expectedMaxBuy === "number" && score.recommendedMaxBuy !== expectedMaxBuy) {
    throw new Error(`replay max_buy mismatch: ${score.recommendedMaxBuy} !== ${expectedMaxBuy}`);
  }

  return score;
}

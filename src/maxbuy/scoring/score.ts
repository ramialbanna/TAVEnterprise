import { capVerdictForDataStrength, dataStrengthFromEffectiveN } from "./dataStrength";
import {
  expectedSalePrice,
  recommendedMaxBuy,
} from "./benchmarks";
import type {
  MaxbuyVerdict,
  ScoreMaxBuyInput,
  ScoreMaxBuyResult,
} from "./types";

const STRONG_BUY_DELTA = 1_500;
const REVIEW_FLOOR_DELTA = -1_500;

function dealVerdict(deltaToAsk: number): MaxbuyVerdict {
  if (deltaToAsk >= STRONG_BUY_DELTA) return "STRONG_BUY";
  if (deltaToAsk >= 0) return "BUY";
  if (deltaToAsk >= REVIEW_FLOOR_DELTA) return "REVIEW";
  return "PASS";
}

export function scoreMaxBuy(input: ScoreMaxBuyInput): ScoreMaxBuyResult {
  const { mmr, askingPrice, benchmarks, targetNetGross, hardGate } = input;
  const vinAbsent = input.vinAbsent === true;
  const reasonCodes: string[] = [];
  const estimatedBadges: string[] = [];
  if (input.mileageEstimated) estimatedBadges.push("ESTIMATED_MILES");
  if (input.mileageUnknown) estimatedBadges.push("MILEAGE_UNKNOWN");

  if (vinAbsent) {
    estimatedBadges.push("NO_VIN");
  }

  const sale = expectedSalePrice(mmr.value, benchmarks.pricing);
  const transport = Math.round(benchmarks.transport.weightedTransportCost);
  const expenses = Math.round(benchmarks.expense.weightedExpenseTotal);
  const maxBuy = recommendedMaxBuy(sale, transport, expenses, targetNetGross);

  const strength = dataStrengthFromEffectiveN(benchmarks.pricing.effectiveN);
  if (benchmarks.pricing.resolution !== "exact") {
    reasonCodes.push(`benchmark_${benchmarks.pricing.resolution}_fallback`);
  }
  if (vinAbsent) {
    // YMM-only primary path — MMR and benchmarks are YMM-based; no VIN history
    reasonCodes.push("ymm_primary_no_vin");
  } else if (mmr.method === "ymm") {
    // VIN path fell back to YMM MMR
    reasonCodes.push("ymm_fallback");
  }
  if (sale > 0 && mmr.value != null && mmr.value > 0) {
    reasonCodes.push("segment_clears_against_mmr");
  }

  if (hardGate) {
    reasonCodes.push(hardGate);
    return {
      displayState: askingPrice != null ? "deal_fit" : "vehicle_fit",
      verdict: "PASS",
      expectedSalePrice: sale,
      expectedTransport: transport,
      expectedExpenses: expenses,
      expectedNetGross: askingPrice != null ? sale - askingPrice - transport - expenses : null,
      recommendedMaxBuy: maxBuy,
      deltaToAsk: askingPrice != null ? maxBuy - askingPrice : null,
      dataStrength: strength,
      reasonCodes,
      estimatedBadges,
      hardGateTriggered: hardGate,
      featureVector: buildFeatureVector(input, sale, transport, expenses, maxBuy),
    };
  }

  if (mmr.value == null || mmr.value <= 0) {
    reasonCodes.push("GATE_MMR_MISSING");
    return {
      displayState: askingPrice != null ? "deal_fit" : "vehicle_fit",
      verdict: "PASS",
      expectedSalePrice: sale,
      expectedTransport: transport,
      expectedExpenses: expenses,
      expectedNetGross: askingPrice != null ? sale - askingPrice - transport - expenses : null,
      recommendedMaxBuy: maxBuy,
      deltaToAsk: askingPrice != null ? maxBuy - askingPrice : null,
      dataStrength: strength,
      reasonCodes,
      estimatedBadges,
      hardGateTriggered: "GATE_MMR_MISSING",
      featureVector: buildFeatureVector(input, sale, transport, expenses, maxBuy),
    };
  }

  if (askingPrice == null) {
    return {
      displayState: "vehicle_fit",
      verdict: null,
      expectedSalePrice: sale,
      expectedTransport: transport,
      expectedExpenses: expenses,
      expectedNetGross: null,
      recommendedMaxBuy: maxBuy,
      deltaToAsk: null,
      dataStrength: strength,
      reasonCodes,
      estimatedBadges,
      hardGateTriggered: null,
      featureVector: buildFeatureVector(input, sale, transport, expenses, maxBuy),
    };
  }

  const delta = maxBuy - askingPrice;
  let verdict = dealVerdict(delta);
  // VIN-absent runs cap at REVIEW regardless of data_strength (OPEN-5 charter)
  verdict = capVerdictForDataStrength(verdict, vinAbsent ? "low" : strength);

  return {
    displayState: "deal_fit",
    verdict,
    expectedSalePrice: sale,
    expectedTransport: transport,
    expectedExpenses: expenses,
    expectedNetGross: sale - askingPrice - transport - expenses,
    recommendedMaxBuy: maxBuy,
    deltaToAsk: delta,
    dataStrength: strength,
    reasonCodes,
    estimatedBadges,
    hardGateTriggered: null,
    featureVector: buildFeatureVector(input, sale, transport, expenses, maxBuy),
  };
}

function buildFeatureVector(
  input: ScoreMaxBuyInput,
  sale: number,
  transport: number,
  expenses: number,
  maxBuy: number,
): Record<string, unknown> {
  return {
    segment: input.segment,
    mmr_value: input.mmr.value,
    mmr_method: input.mmr.method,
    asking_price: input.askingPrice,
    pricing_resolution: input.benchmarks.pricing.resolution,
    pricing_effective_n: input.benchmarks.pricing.effectiveN,
    sale_pct_mmr: input.benchmarks.pricing.weightedSalePctMmr,
    transport_resolution: input.benchmarks.transport.resolution,
    expense_resolution: input.benchmarks.expense.resolution,
    expected_sale_price: sale,
    expected_transport: transport,
    expected_expenses: expenses,
    recommended_max_buy: maxBuy,
    target_net_gross: input.targetNetGross,
  };
}

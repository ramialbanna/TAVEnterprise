import { describe, expect, it } from "vitest";

import type { MaxbuyEvaluateOk } from "@/lib/app-api/schemas";

import { mapMaxbuyEvaluateToSnapshot } from "./map-snapshot";

const sample: MaxbuyEvaluateOk = {
  contract_version: "1.0.0",
  recommendation_id: "11111111-1111-1111-1111-111111111111",
  vehicle: {
    vin: "1FTFW1ET5DFA12345",
    year: 2015,
    make: "ford",
    model: "f-150",
    trim: null,
    mileage: 80000,
    mileage_estimated: false,
  },
  mmr: {
    value: 22000,
    method: "vin",
    source: "cox",
    cache_age_seconds: 0,
    missing_reason: null,
    observed_at: "2026-06-01T00:00:00.000Z",
  },
  tav_historical: {
    n_units: 12,
    avg_buy: 18000,
    avg_sale: 21000,
    avg_gross: 900,
    avg_recon: 500,
    avg_days_to_sale: 14,
    outcome_distribution: {},
  },
  economics: {
    expected_sale_price: 21000,
    expected_transport: 400,
    expected_expenses: 600,
    expected_net_gross: 800,
  },
  verdict: {
    display_state: "deal_fit",
    verdict: "BUY",
    recommended_max_buy: 19200,
    delta_to_ask: 800,
    data_strength: "medium",
    reason_codes: ["segment_n_adequate"],
    estimated_badges: [],
    hard_gate_triggered: null,
  },
  versions: {
    benchmark_version: "bm-2026w22-180d",
    feature_view_version: "fv-v1",
    policy_version: "global-v1",
    scoring_version: "maxbuy-scoring-v1",
    model_artifact_hash: null,
  },
};

describe("mapMaxbuyEvaluateToSnapshot", () => {
  it("maps API verdict enums to card snapshot", () => {
    const snap = mapMaxbuyEvaluateToSnapshot(sample, 20000);
    expect(snap.verdict).toBe("buy");
    expect(snap.displayState).toBe("deal_fit");
    expect(snap.recommendedMaxBuy).toBe(19200);
    expect(snap.mmrWholesale).toBe(22000);
    expect(snap.askingPrice).toBe(20000);
    expect(snap.recommendationId).toBe(sample.recommendation_id);
    expect(snap.vin).toBe(sample.vehicle.vin);
  });
});

import { describe, expect, it } from "vitest";
import {
  MAXBUY_DEFAULT_TARGET_NET_GROSS,
  dataStrengthFromEffectiveN,
  expectedSalePrice,
  mileageBand,
  recommendedMaxBuy,
  resolveBenchmarks,
  scoreMaxBuy,
} from "../src/maxbuy/scoring";

const SEGMENT = {
  year: 2018,
  make: "ford",
  model: "f-150",
  trim: "xlt",
  region: "dallas_tx",
  mileageBand: "60-90k",
};

describe("maxbuy scoring", () => {
  it("maps mileage to bands matching SQL function", () => {
    expect(mileageBand(45_000)).toBe("30-60k");
    expect(mileageBand(null)).toBe("unknown");
  });

  it("computes expected sale from sale_pct_mmr × MMR", () => {
    const sale = expectedSalePrice(20_000, {
      resolution: "exact",
      effectiveN: 40,
      weightedSalePrice: 18_000,
      weightedSalePctMmr: 0.97,
    });
    expect(sale).toBe(19_400);
  });

  it("computes recommended max buy with $800 target", () => {
    const maxBuy = recommendedMaxBuy(20_000, 450, 700, MAXBUY_DEFAULT_TARGET_NET_GROSS);
    expect(maxBuy).toBe(18_050);
  });

  it("falls back exact → ymm → mm → global for pricing", () => {
    const resolved = resolveBenchmarks(
      [
        {
          resolution: "ymm",
          year: 2018,
          make: "ford",
          model: "f-150",
          region: "dallas_tx",
          effectiveN: 22,
          weightedSalePrice: 19_000,
          weightedSalePctMmr: 0.95,
        },
      ],
      [{ resolution: "global", effectiveN: 100, weightedTransportCost: 500 }],
      [{ resolution: "global", effectiveN: 100, weightedExpenseTotal: 650 }],
      SEGMENT,
    );
    expect(resolved.pricing.resolution).toBe("ymm");
    expect(resolved.transport.resolution).toBe("global");
  });

  it("returns vehicle_fit with null verdict when asking price absent", () => {
    const result = scoreMaxBuy({
      segment: SEGMENT,
      mmr: {
        value: 20_000,
        method: "vin",
        source: "manheim",
        cacheAgeSeconds: 120,
        missingReason: null,
        observedAt: "2026-05-20T12:00:00.000Z",
      },
      askingPrice: null,
      mileageEstimated: false,
      targetNetGross: 800,
      hardGate: null,
      benchmarks: resolveBenchmarks(
        [{
          resolution: "exact",
          ...SEGMENT,
          effectiveN: 35,
          weightedSalePrice: 19_400,
          weightedSalePctMmr: 0.97,
        }],
        [{ resolution: "global", effectiveN: 50, weightedTransportCost: 450 }],
        [{ resolution: "global", effectiveN: 50, weightedExpenseTotal: 700 }],
        SEGMENT,
      ),
    });

    expect(result.displayState).toBe("vehicle_fit");
    expect(result.verdict).toBeNull();
    expect(result.deltaToAsk).toBeNull();
    expect(result.recommendedMaxBuy).toBeGreaterThan(0);
  });

  it("returns deal_fit verdict and caps low data strength at REVIEW", () => {
    const result = scoreMaxBuy({
      segment: SEGMENT,
      mmr: {
        value: 20_000,
        method: "vin",
        source: "manheim",
        cacheAgeSeconds: 120,
        missingReason: null,
        observedAt: "2026-05-20T12:00:00.000Z",
      },
      askingPrice: 17_000,
      mileageEstimated: false,
      targetNetGross: 800,
      hardGate: null,
      benchmarks: resolveBenchmarks(
        [{
          resolution: "exact",
          ...SEGMENT,
          effectiveN: 5,
          weightedSalePrice: 19_400,
          weightedSalePctMmr: 0.97,
        }],
        [{ resolution: "global", effectiveN: 50, weightedTransportCost: 450 }],
        [{ resolution: "global", effectiveN: 50, weightedExpenseTotal: 700 }],
        SEGMENT,
      ),
    });

    expect(result.displayState).toBe("deal_fit");
    expect(dataStrengthFromEffectiveN(5)).toBe("low");
    expect(result.dataStrength).toBe("low");
    expect(result.verdict).toBe("REVIEW");
  });

  it("forces PASS when MMR missing (GATE_MMR_MISSING)", () => {
    const result = scoreMaxBuy({
      segment: SEGMENT,
      mmr: {
        value: null,
        method: null,
        source: null,
        cacheAgeSeconds: null,
        missingReason: "not_found",
        observedAt: null,
      },
      askingPrice: 17_000,
      mileageEstimated: true,
      targetNetGross: 800,
      hardGate: null,
      benchmarks: resolveBenchmarks(
        [{ resolution: "global", effectiveN: 100, weightedSalePrice: 18_000, weightedSalePctMmr: null }],
        [{ resolution: "global", effectiveN: 100, weightedTransportCost: 450 }],
        [{ resolution: "global", effectiveN: 100, weightedExpenseTotal: 700 }],
        SEGMENT,
      ),
    });

    expect(result.verdict).toBe("PASS");
    expect(result.hardGateTriggered).toBe("GATE_MMR_MISSING");
    expect(result.estimatedBadges).toContain("ESTIMATED_MILES");
  });
});

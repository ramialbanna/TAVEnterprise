import { describe, expect, it } from "vitest";

import { replayFromFeatureVector } from "../src/maxbuy/evaluateRun";
import { resolveBenchmarks, scoreMaxBuy } from "../src/maxbuy/scoring";

const SEGMENT = {
  year: 2018,
  make: "ford",
  model: "f-150",
  trim: "xlt",
  region: "dallas_tx",
  mileageBand: "60-90k",
};

describe("maxbuy replay", () => {
  it("reproduces recommended_max_buy from pinned feature vector inputs", () => {
    const benchmarks = resolveBenchmarks(
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
    );

    const score = scoreMaxBuy({
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
      benchmarks,
    });

    const replayed = replayFromFeatureVector(score.featureVector, {
      segment: SEGMENT,
      mmr: { value: 20_000, method: "vin" },
      askingPrice: 17_000,
      mileageEstimated: false,
      benchmarks,
      targetNetGross: 800,
      hardGate: null,
    });

    expect(replayed.recommendedMaxBuy).toBe(score.recommendedMaxBuy);
    expect(replayed.verdict).toBe(score.verdict);
    expect(replayed.displayState).toBe(score.displayState);
  });
});

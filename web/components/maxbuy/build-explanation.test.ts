import { describe, expect, it } from "vitest";

import {
  buildMaxbuyExplanation,
  labelMaxbuyReasonCode,
  type MaxbuyExplanationInput,
} from "./build-explanation";

function baseInput(overrides?: {
  snapshot?: Partial<MaxbuyExplanationInput["snapshot"]>;
  economics?: Partial<MaxbuyExplanationInput["economics"]>;
  tavHistorical?: Partial<MaxbuyExplanationInput["tavHistorical"]>;
}): MaxbuyExplanationInput {
  return {
    snapshot: {
      recommendedMaxBuy: 37_336,
      displayState: "deal_fit",
      verdict: "buy",
      dataStrength: "medium",
      reasonCodes: ["segment_clears_against_mmr"],
      deltaToAsk: 2_336,
      askingPrice: 35_000,
      mmrWholesale: 38_500,
      ...overrides?.snapshot,
    },
    economics: {
      expectedSalePrice: 40_083,
      expectedTransport: 0,
      expectedExpenses: 1_847,
      ...overrides?.economics,
    },
    tavHistorical: {
      nUnits: 500,
      ...overrides?.tavHistorical,
    },
  };
}

describe("buildMaxbuyExplanation", () => {
  it("builds segment narrative and math chain from economics", () => {
    const result = buildMaxbuyExplanation(baseInput());

    expect(result.narrative).toBe(
      "Based on 500 similar TAV outcomes in this segment, we expect to sell around $40,083.",
    );
    expect(result.math).toEqual({
      expectedSale: 40_083,
      transport: 0,
      expenses: 1_847,
      targetNet: 900,
      maxBuy: 37_336,
    });
    expect(result.cautionLine).toBeNull();
  });

  it("appends low data strength caution", () => {
    const result = buildMaxbuyExplanation(
      baseInput({ snapshot: { dataStrength: "low" } }),
    );

    expect(result.cautionLine).toBe("Limited segment data — treat this as a rough guide.");
  });

  it("uses MMR-missing narrative when gate is present", () => {
    const result = buildMaxbuyExplanation(
      baseInput({
        snapshot: {
          reasonCodes: ["GATE_MMR_MISSING"],
          verdict: "pass",
          mmrWholesale: null,
        },
      }),
    );

    expect(result.narrative).toContain("wholesale MMR anchor");
  });

  it("uses hard-gate narrative for pass verdicts", () => {
    const result = buildMaxbuyExplanation(
      baseInput({
        snapshot: {
          reasonCodes: ["GATE_SALVAGE"],
          verdict: "pass",
        },
      }),
    );

    expect(result.narrative).toBe(
      "Salvage history on file — we can't recommend bidding on this vehicle.",
    );
  });

  it("explains vehicle ceiling when no lane ask", () => {
    const result = buildMaxbuyExplanation(
      baseInput({
        snapshot: {
          displayState: "vehicle_fit",
          verdict: null,
          deltaToAsk: null,
          askingPrice: null,
        },
      }),
    );

    expect(result.narrative).toContain("Enter a lane ask above");
  });

  it("explains pass when ask exceeds recommended max", () => {
    const result = buildMaxbuyExplanation(
      baseInput({
        snapshot: {
          verdict: "pass",
          deltaToAsk: -1_500,
          askingPrice: 38_836,
        },
      }),
    );

    expect(result.narrative).toContain("lane ask is above our recommended max");
  });
});

describe("labelMaxbuyReasonCode", () => {
  it("labels benchmark fallbacks", () => {
    expect(labelMaxbuyReasonCode("benchmark_ymm_fallback")).toContain("year/make/model");
  });

  it("labels gate codes", () => {
    expect(labelMaxbuyReasonCode("GATE_MMR_MISSING")).toContain("MMR");
  });
});

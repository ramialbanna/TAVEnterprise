import { describe, expect, it } from "vitest";

import { EMPTY_MMR_ADJUSTMENTS } from "./mmr-adjustments";
import {
  applyAttributeMarginalDelta,
  buildMmrAdjustmentBaseline,
  deriveMmrAdjustmentDeltas,
  detectAttributeMarginalChanges,
  EMPTY_MMR_ATTRIBUTE_MARGINALS,
} from "./mmr-adjustment-display";

describe("buildMmrAdjustmentBaseline", () => {
  it("captures baseline at average odometer with build options", () => {
    expect(
      buildMmrAdjustmentBaseline({
        mmrValue: 20200,
        adjustedMmr: 20400,
        avgOdometer: 66981,
        mileageUsed: 66981,
        buildOptionsIncluded: true,
        buildOptionsAdjustment: 200,
        odometerAdjustment: null,
      }),
    ).toEqual({
      adjustedAtAvgOdometer: 20400,
      buildOptionsAdjustment: 200,
    });
  });

  it("captures baseline from base vs adjusted when API omits buildOptionsIncluded", () => {
    expect(
      buildMmrAdjustmentBaseline({
        mmrValue: 20200,
        adjustedMmr: 20400,
        avgOdometer: 66981,
        mileageUsed: null,
        buildOptionsAdjustment: null,
        odometerAdjustment: null,
      }),
    ).toEqual({
      adjustedAtAvgOdometer: 20400,
      buildOptionsAdjustment: 200,
    });
  });
});

describe("detectAttributeMarginalChanges", () => {
  it("detects grade, color, and region changes", () => {
    expect(
      detectAttributeMarginalChanges(EMPTY_MMR_ADJUSTMENTS, {
        ...EMPTY_MMR_ADJUSTMENTS,
        grade: "4.0",
        exteriorColor: "Black",
        region: "West",
      }),
    ).toEqual(["grade", "color", "region"]);
  });
});

describe("applyAttributeMarginalDelta", () => {
  it("stores delta when exactly one attribute changed", () => {
    expect(
      applyAttributeMarginalDelta(
        EMPTY_MMR_ATTRIBUTE_MARGINALS,
        ["grade"],
        23600,
        23720,
      ),
    ).toEqual({
      grade: 120,
      color: null,
      region: null,
    });
  });

  it("ignores delta when multiple attributes changed at once", () => {
    expect(
      applyAttributeMarginalDelta(
        EMPTY_MMR_ATTRIBUTE_MARGINALS,
        ["grade", "color"],
        23600,
        23700,
      ),
    ).toEqual(EMPTY_MMR_ATTRIBUTE_MARGINALS);
  });
});

describe("deriveMmrAdjustmentDeltas", () => {
  const baseline = {
    adjustedAtAvgOdometer: 20400,
    buildOptionsAdjustment: 200,
  };

  it("derives odometer and build deltas at non-average mileage", () => {
    expect(
      deriveMmrAdjustmentDeltas({
        baseMmr: 20200,
        adjustedMmr: 23800,
        buildOptionsIncluded: true,
        buildOptionsAdjustment: null,
        odometerAdjustment: null,
        adjustments: { ...EMPTY_MMR_ADJUSTMENTS, odometer: "40000", buildOptions: true },
        baseline,
      }),
    ).toEqual({
      odometerAdjustment: 3400,
      buildOptionsAdjustment: 200,
      gradeAdjustment: null,
      colorAdjustment: null,
      regionAdjustment: null,
    });
  });

  it("subtracts grade and color marginals from baseline-derived odometer delta", () => {
    // adjustedMmr = baseline(20400) + grade(400) + color(600) + odometer(-3400) = 18000 (hypothetical)
    // odoAdj should be 18000 - 20400 - 400 - 600 = -3400 (not -3400 - 1000 without marginal subtraction)
    expect(
      deriveMmrAdjustmentDeltas({
        baseMmr: 20200,
        adjustedMmr: 17000,
        buildOptionsAdjustment: null,
        odometerAdjustment: null,
        adjustments: {
          ...EMPTY_MMR_ADJUSTMENTS,
          odometer: "80000",
          grade: "5.0",
          exteriorColor: "Black",
          buildOptions: true,
        },
        baseline,
        attributeMarginals: { grade: 400, color: 600, region: null },
      }),
    ).toMatchObject({
      odometerAdjustment: -4400, // 17000 - 20400 - 400 - 600 = -4400
      buildOptionsAdjustment: 200,
      gradeAdjustment: 400,
      colorAdjustment: 600,
    });
  });

  it("derives odometer delta when build is on but build dollars and baseline are unknown", () => {
    expect(
      deriveMmrAdjustmentDeltas({
        baseMmr: 50_700,
        adjustedMmr: 66_100,
        buildOptionsIncluded: true,
        buildOptionsAdjustment: null,
        odometerAdjustment: null,
        adjustments: { ...EMPTY_MMR_ADJUSTMENTS, odometer: "200", buildOptions: true },
        baseline: null,
      }),
    ).toEqual({
      odometerAdjustment: 15_400,
      buildOptionsAdjustment: null,
      gradeAdjustment: null,
      colorAdjustment: null,
      regionAdjustment: null,
    });
  });

  it("does not attribute grade and color residual to build when other attrs are active", () => {
    // 2018 F450 VIN 1FT8W4DT8JEB57132 — odo 200, grade 1.0, Black, build ON.
    // Residual after odometer is grade+color (~−23,100); must not appear on build badge.
    expect(
      deriveMmrAdjustmentDeltas({
        baseMmr: 50_700,
        adjustedMmr: 43_000,
        buildOptionsAdjustment: null,
        odometerAdjustment: 15_400,
        gradeAdjustment: -22_600,
        colorAdjustment: -480,
        adjustments: {
          ...EMPTY_MMR_ADJUSTMENTS,
          odometer: "200",
          grade: "1.0",
          exteriorColor: "Black",
          buildOptions: true,
        },
        baseline: null,
      }),
    ).toEqual({
      odometerAdjustment: 15_400,
      buildOptionsAdjustment: null,
      gradeAdjustment: -22_600,
      colorAdjustment: -480,
      regionAdjustment: null,
    });
  });

  it("prefers API grade and color adjustments when present", () => {
    expect(
      deriveMmrAdjustmentDeltas({
        baseMmr: 20200,
        adjustedMmr: 23700,
        buildOptionsAdjustment: 200,
        odometerAdjustment: 3340,
        gradeAdjustment: 120,
        colorAdjustment: -160,
        adjustments: {
          ...EMPTY_MMR_ADJUSTMENTS,
          odometer: "40000",
          grade: "4.0",
          exteriorColor: "Black",
          buildOptions: true,
        },
        baseline,
      }),
    ).toEqual({
      odometerAdjustment: 3340,
      buildOptionsAdjustment: 200,
      gradeAdjustment: 120,
      colorAdjustment: -160,
      regionAdjustment: null,
    });
  });

  it("uses stored marginals when API omits grade and color dollars", () => {
    expect(
      deriveMmrAdjustmentDeltas({
        baseMmr: 20200,
        adjustedMmr: 23700,
        buildOptionsAdjustment: 200,
        odometerAdjustment: 3340,
        adjustments: {
          ...EMPTY_MMR_ADJUSTMENTS,
          odometer: "40000",
          grade: "4.0",
          exteriorColor: "Black",
          buildOptions: true,
        },
        baseline,
        attributeMarginals: { grade: 120, color: -160, region: null },
      }),
    ).toMatchObject({
      gradeAdjustment: 120,
      colorAdjustment: -160,
    });
  });

  it("hides build delta when build options are off", () => {
    expect(
      deriveMmrAdjustmentDeltas({
        baseMmr: 20200,
        adjustedMmr: 23600,
        buildOptionsIncluded: false,
        buildOptionsAdjustment: null,
        odometerAdjustment: 3400,
        adjustments: { ...EMPTY_MMR_ADJUSTMENTS, odometer: "40000", buildOptions: false },
        baseline,
      }),
    ).toEqual({
      odometerAdjustment: 3400,
      buildOptionsAdjustment: null,
      gradeAdjustment: null,
      colorAdjustment: null,
      regionAdjustment: null,
    });
  });
});

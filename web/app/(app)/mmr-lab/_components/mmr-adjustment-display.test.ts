import { describe, expect, it } from "vitest";

import { EMPTY_MMR_ADJUSTMENTS } from "./mmr-adjustments";
import {
  buildMmrAdjustmentBaseline,
  deriveMmrAdjustmentDeltas,
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
    });
  });
});

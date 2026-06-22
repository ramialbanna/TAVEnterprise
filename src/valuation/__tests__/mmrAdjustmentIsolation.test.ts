import { describe, expect, it } from "vitest";

import {
  buildMmrIsolationBody,
  computeMmrIsolatedAdjustments,
  listMmrIsolationKinds,
  shouldRunMmrAdjustmentIsolation,
} from "../mmrAdjustmentIsolation";

describe("listMmrIsolationKinds", () => {
  it("requests grade, color, odometer, and build isolations for a full F450-style recompute", () => {
    expect(
      listMmrIsolationKinds(
        {
          vin: "1FT8W4DT8JEB57132",
          mileage: 200,
          adjustments: { grade: "45", color: "Black", exclude_build: false },
        },
        99606,
        true,
      ),
    ).toEqual([
      "without_grade",
      "without_color",
      "at_average_odometer",
      "without_build",
    ]);
  });

  it("skips at_average_odometer when mileage matches average", () => {
    expect(
      listMmrIsolationKinds(
        { vin: "X", mileage: 66981, adjustments: { grade: "40" } },
        66981,
        false,
      ),
    ).toEqual(["without_grade"]);
  });
});

describe("buildMmrIsolationBody", () => {
  const primary = {
    vin: "1FT8W4DT8JEB57132",
    mileage: 200,
    adjustments: { grade: "45", color: "Black", exclude_build: false },
  };

  it("removes grade for without_grade", () => {
    expect(buildMmrIsolationBody(primary, "without_grade", 99606).adjustments).toEqual({
      color: "Black",
      exclude_build: false,
    });
  });

  it("sets average mileage for at_average_odometer", () => {
    expect(buildMmrIsolationBody(primary, "at_average_odometer", 99606).mileage).toBe(99606);
  });

  it("sets exclude_build for without_build", () => {
    expect(buildMmrIsolationBody(primary, "without_build", 99606).adjustments).toEqual({
      grade: "45",
      color: "Black",
      exclude_build: true,
    });
  });
});

describe("computeMmrIsolatedAdjustments", () => {
  it("matches Manheim F450-style isolated deltas", () => {
    expect(
      computeMmrIsolatedAdjustments({
        fullAdjusted: 66300,
        withoutGrade: 65590,
        withoutColor: 66780,
        atAverageOdometer: 50870,
        withoutBuild: 65410,
        hasGrade: true,
        hasColor: true,
        hasNonAverageOdometer: true,
        hasRegion: false,
        hasBuildIsolation: true,
      }),
    ).toEqual({
      gradeAdjustment: 710,
      colorAdjustment: -480,
      regionAdjustment: null,
      odometerAdjustment: 15430,
      buildOptionsAdjustment: 890,
    });
  });
});

describe("shouldRunMmrAdjustmentIsolation", () => {
  it("is false for a plain VIN lookup with no mileage or adjustments", () => {
    expect(shouldRunMmrAdjustmentIsolation({ vin: "X" }, 45000, false)).toBe(false);
  });

  it("is true when mileage differs from average", () => {
    expect(shouldRunMmrAdjustmentIsolation({ vin: "X", mileage: 200 }, 99606, false)).toBe(
      true,
    );
  });
});

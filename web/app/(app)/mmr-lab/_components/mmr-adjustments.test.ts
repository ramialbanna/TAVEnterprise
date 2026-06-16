import { describe, expect, it } from "vitest";

import {
  EMPTY_MMR_ADJUSTMENTS,
  seedMmrAdjustmentsFromResult,
  hasMmrAdjustments,
  mapMmrAdjustmentsToApi,
} from "./mmr-adjustments";

describe("hasMmrAdjustments", () => {
  it("is false for empty adjustments", () => {
    expect(hasMmrAdjustments(EMPTY_MMR_ADJUSTMENTS)).toBe(false);
  });

  it("detects any populated field", () => {
    expect(hasMmrAdjustments({ ...EMPTY_MMR_ADJUSTMENTS, region: "Southeast" })).toBe(true);
    expect(hasMmrAdjustments({ ...EMPTY_MMR_ADJUSTMENTS, buildOptions: true })).toBe(true);
  });
});

describe("mapMmrAdjustmentsToApi", () => {
  it("returns undefined when no Cox params are set", () => {
    expect(mapMmrAdjustmentsToApi(EMPTY_MMR_ADJUSTMENTS)).toBeUndefined();
  });

  it("maps region, grade, color, build options, and express grade", () => {
    expect(
      mapMmrAdjustmentsToApi({
        ...EMPTY_MMR_ADJUSTMENTS,
        region: "Southeast",
        grade: "4.0",
        exteriorColor: "Black",
        buildOptions: true,
        expressGrade: "88",
      }),
    ).toEqual({
      region: "Southeast",
      grade: "4.0",
      color: "Black",
      exclude_build: false,
      evbh: 88,
    });
  });

  it("excludes build options when NO is selected alongside other adjustments", () => {
    expect(
      mapMmrAdjustmentsToApi({
        ...EMPTY_MMR_ADJUSTMENTS,
        region: "West",
        buildOptions: false,
      }),
    ).toEqual({
      region: "West",
      exclude_build: true,
    });
  });

  it("excludes build options when NO is selected alongside odometer", () => {
    expect(
      mapMmrAdjustmentsToApi({
        ...EMPTY_MMR_ADJUSTMENTS,
        odometer: "40000",
        buildOptions: false,
      }),
    ).toEqual({
      exclude_build: true,
    });
  });

  it("includes build options when YES is selected alongside odometer", () => {
    expect(
      mapMmrAdjustmentsToApi({
        ...EMPTY_MMR_ADJUSTMENTS,
        odometer: "40000",
        buildOptions: true,
      }),
    ).toEqual({
      exclude_build: false,
    });
  });

  it("seeds build options from Cox MMR response fields", () => {
    expect(
      seedMmrAdjustmentsFromResult({
        buildOptionsIncluded: true,
        mileageUsed: null,
      }),
    ).toEqual({
      ...EMPTY_MMR_ADJUSTMENTS,
      buildOptions: true,
    });
  });

  it("seeds build options YES from a positive adjustment amount", () => {
    expect(
      seedMmrAdjustmentsFromResult({
        buildOptionsAdjustment: 200,
        mileageUsed: null,
      }),
    ).toEqual({
      ...EMPTY_MMR_ADJUSTMENTS,
      buildOptions: true,
    });
  });
});

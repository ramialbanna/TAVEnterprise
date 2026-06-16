import { describe, expect, it } from "vitest";

import {
  EMPTY_MMR_ADJUSTMENTS,
  seedMmrAdjustmentsFromResult,
  hasMmrAdjustments,
  mapMmrAdjustmentsToApi,
  resolveBuildOptionsState,
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

  it("does not exclude build when region or grade change without explicit NO", () => {
    expect(
      mapMmrAdjustmentsToApi({
        ...EMPTY_MMR_ADJUSTMENTS,
        region: "West",
        grade: "4.0",
        exteriorColor: "Black",
      }),
    ).toEqual({
      region: "West",
      grade: "4.0",
      color: "Black",
    });
  });

  it("excludes build options only when user explicitly chose NO", () => {
    expect(
      mapMmrAdjustmentsToApi({
        ...EMPTY_MMR_ADJUSTMENTS,
        region: "West",
        buildOptions: false,
        buildOptionsUserExcluded: true,
      }),
    ).toEqual({
      region: "West",
      exclude_build: true,
    });
  });

  it("excludes build options when user explicitly chose NO alongside odometer", () => {
    expect(
      mapMmrAdjustmentsToApi({
        ...EMPTY_MMR_ADJUSTMENTS,
        odometer: "40000",
        buildOptions: false,
        buildOptionsUserExcluded: true,
      }),
    ).toEqual({
      exclude_build: true,
    });
  });

  it("does not exclude build when odometer is set but user has not chosen NO", () => {
    expect(
      mapMmrAdjustmentsToApi({
        ...EMPTY_MMR_ADJUSTMENTS,
        odometer: "40000",
        buildOptions: false,
      }),
    ).toBeUndefined();
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
      buildOptionsUserExcluded: false,
    });
  });

  it("seeds build options YES from base vs adjusted when API omits buildOptionsIncluded", () => {
    expect(
      seedMmrAdjustmentsFromResult({
        mmrValue: 20200,
        adjustedMmr: 20400,
        mileageUsed: null,
      }),
    ).toEqual({
      ...EMPTY_MMR_ADJUSTMENTS,
      buildOptions: true,
      buildOptionsUserExcluded: false,
    });
  });
});

describe("resolveBuildOptionsState", () => {
  it("defaults to YES when Cox reports build options on initial load", () => {
    expect(
      resolveBuildOptionsState(EMPTY_MMR_ADJUSTMENTS, {
        buildOptionsIncluded: true,
        buildOptionsAdjustment: 200,
      }),
    ).toEqual({
      buildOptions: true,
      buildOptionsUserExcluded: false,
    });
  });

  it("preserves user YES when recompute omits buildOptionsIncluded", () => {
    expect(
      resolveBuildOptionsState(
        { ...EMPTY_MMR_ADJUSTMENTS, buildOptions: true },
        {
          mmrValue: 20200,
          adjustedMmr: 23600,
          mileageUsed: 40000,
          avgOdometer: 66981,
          buildOptionsIncluded: undefined,
          buildOptionsAdjustment: null,
        },
      ),
    ).toEqual({
      buildOptions: true,
      buildOptionsUserExcluded: false,
    });
  });

  it("preserves user NO even when Cox reports build options included", () => {
    expect(
      resolveBuildOptionsState(
        {
          ...EMPTY_MMR_ADJUSTMENTS,
          buildOptions: false,
          buildOptionsUserExcluded: true,
        },
        {
          buildOptionsIncluded: true,
          buildOptionsAdjustment: 200,
        },
      ),
    ).toEqual({
      buildOptions: false,
      buildOptionsUserExcluded: true,
    });
  });

  it("does not mark user excluded when Cox reports no build options", () => {
    expect(
      resolveBuildOptionsState(EMPTY_MMR_ADJUSTMENTS, {
        buildOptionsIncluded: false,
      }),
    ).toEqual({
      buildOptions: false,
      buildOptionsUserExcluded: false,
    });
  });
});

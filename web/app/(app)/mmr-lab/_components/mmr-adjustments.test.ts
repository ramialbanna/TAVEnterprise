import { describe, expect, it } from "vitest";

import {
  EMPTY_MMR_ADJUSTMENTS,
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
});

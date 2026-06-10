import { describe, expect, it } from "vitest";

import { EMPTY_MMR_ADJUSTMENTS, hasMmrAdjustments } from "./mmr-adjustments";

describe("hasMmrAdjustments", () => {
  it("is false for empty adjustments", () => {
    expect(hasMmrAdjustments(EMPTY_MMR_ADJUSTMENTS)).toBe(false);
  });

  it("detects any populated field", () => {
    expect(hasMmrAdjustments({ ...EMPTY_MMR_ADJUSTMENTS, region: "Southeast" })).toBe(true);
    expect(hasMmrAdjustments({ ...EMPTY_MMR_ADJUSTMENTS, buildOptions: true })).toBe(true);
  });
});

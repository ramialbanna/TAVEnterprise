import { describe, expect, it } from "vitest";

import { normalizeMmrLookupAdjustments, toCoxGradeParam } from "../coxGradeParam";

describe("toCoxGradeParam", () => {
  it("converts UI decimal CR grades to Cox 10× integers", () => {
    expect(toCoxGradeParam("4.5")).toBe("45");
    expect(toCoxGradeParam("4.0")).toBe("40");
    expect(toCoxGradeParam("3.5")).toBe("35");
    expect(toCoxGradeParam("1.0")).toBe("10");
    expect(toCoxGradeParam("5.0")).toBe("50");
  });

  it("passes through values already in Cox integer form", () => {
    expect(toCoxGradeParam("45")).toBe("45");
    expect(toCoxGradeParam("40")).toBe("40");
  });

  it("returns null for out-of-range grades", () => {
    expect(toCoxGradeParam("6.0")).toBeNull();
    expect(toCoxGradeParam("0.5")).toBeNull();
    expect(toCoxGradeParam("")).toBeNull();
    expect(toCoxGradeParam("abc")).toBeNull();
  });
});

describe("normalizeMmrLookupAdjustments", () => {
  it("rewrites grade only; leaves other adjustment fields unchanged", () => {
    expect(
      normalizeMmrLookupAdjustments({
        region: "Southeast",
        grade: "4.5",
        color: "Black",
        evbh: 88,
      }),
    ).toEqual({
      region: "Southeast",
      grade: "45",
      color: "Black",
      evbh: 88,
    });
  });
});

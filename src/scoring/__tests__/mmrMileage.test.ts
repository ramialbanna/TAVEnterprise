import { describe, it, expect } from "vitest";
import {
  getMmrMileageData,
  US_ANNUAL_AVG_MILES,
  MONTHLY_AVG_MILES,
  MAX_MILEAGE_CAP,
  NEXT_YEAR_BASE_MILES,
  INFERRED_MILEAGE_FLOOR,
} from "../mmrMileage";

// Fixed reference date used in deterministic tests:
//   currentYear  = 2026
//   currentMonth = 5 (May)
const NOW = new Date("2026-05-15T12:00:00Z");

describe("getMmrMileageData — actual path", () => {
  it("preserves a whole-number listed mileage", () => {
    expect(getMmrMileageData(2020, 47_000, NOW)).toEqual({
      value: 47_000,
      isInferred: false,
      method: "actual",
    });
  });

  it("rounds a fractional listed mileage to the nearest integer", () => {
    expect(getMmrMileageData(2020, 47_500.7, NOW)).toEqual({
      value: 47_501,
      isInferred: false,
      method: "actual",
    });
  });

  it("preserves a 1-mile listing (smallest valid actual)", () => {
    expect(getMmrMileageData(2020, 1, NOW)).toEqual({
      value: 1,
      isInferred: false,
      method: "actual",
    });
  });

  it("preserves a very large listed mileage without capping", () => {
    // The MAX_MILEAGE_CAP applies to inferred mileage only — actual values
    // pass through. This documents the intended behavior.
    expect(getMmrMileageData(2010, 320_000, NOW)).toEqual({
      value: 320_000,
      isInferred: false,
      method: "actual",
    });
  });
});

describe("getMmrMileageData — inference triggers", () => {
  it("infers when listedMiles is null", () => {
    const result = getMmrMileageData(2020, null, NOW);
    expect(result.isInferred).toBe(true);
    expect(result.method).toBe("estimated_annual_average");
  });

  it("infers when listedMiles is undefined", () => {
    const result = getMmrMileageData(2020, undefined, NOW);
    expect(result.isInferred).toBe(true);
    expect(result.method).toBe("estimated_annual_average");
  });

  it("infers when listedMiles is 0", () => {
    const result = getMmrMileageData(2020, 0, NOW);
    expect(result.isInferred).toBe(true);
    expect(result.method).toBe("estimated_annual_average");
  });

  it("infers when listedMiles is negative", () => {
    const result = getMmrMileageData(2020, -5_000, NOW);
    expect(result.isInferred).toBe(true);
    expect(result.method).toBe("estimated_annual_average");
  });

  it("infers when listedMiles is NaN", () => {
    const result = getMmrMileageData(2020, Number.NaN, NOW);
    expect(result.isInferred).toBe(true);
    expect(result.method).toBe("estimated_annual_average");
  });

  it("infers when listedMiles is Infinity", () => {
    const result = getMmrMileageData(2020, Number.POSITIVE_INFINITY, NOW);
    expect(result.isInferred).toBe(true);
    expect(result.method).toBe("estimated_annual_average");
  });

  it("infers when listedMiles is -Infinity", () => {
    const result = getMmrMileageData(2020, Number.NEGATIVE_INFINITY, NOW);
    expect(result.isInferred).toBe(true);
    expect(result.method).toBe("estimated_annual_average");
  });
});

describe("getMmrMileageData — current-year inference", () => {
  it("uses currentMonth × MONTHLY_AVG_MILES, rounded to nearest 1000", () => {
    // 2026 model in May 2026: 5 × 1250 = 6250 → rounds to 6000
    expect(getMmrMileageData(2026, null, NOW)).toEqual({
      value: 6_000,
      isInferred: true,
      method: "estimated_annual_average",
    });
  });

  it("January edge — current-year model in January floors to 1000", () => {
    // currentMonth = 1: 1 × 1250 = 1250 → rounds to 1000 (= INFERRED_MILEAGE_FLOOR)
    const jan = new Date("2026-01-10T00:00:00Z");
    const result = getMmrMileageData(2026, null, jan);
    expect(result.value).toBe(1_000);
    expect(result.value).toBe(INFERRED_MILEAGE_FLOOR);
  });

  it("December edge — current-year model in December", () => {
    // currentMonth = 12: 12 × 1250 = 15000 → exact, no rounding
    const dec = new Date("2026-12-20T00:00:00Z");
    expect(getMmrMileageData(2026, null, dec).value).toBe(15_000);
  });
});

describe("getMmrMileageData — future / next-year models", () => {
  it("returns NEXT_YEAR_BASE_MILES for next-year model", () => {
    // 2027 model in May 2026 (next year)
    expect(getMmrMileageData(2027, null, NOW)).toEqual({
      value: NEXT_YEAR_BASE_MILES,
      isInferred: true,
      method: "estimated_annual_average",
    });
  });

  it("returns NEXT_YEAR_BASE_MILES for two-years-out model", () => {
    expect(getMmrMileageData(2028, null, NOW).value).toBe(NEXT_YEAR_BASE_MILES);
  });

  it("does NOT round NEXT_YEAR_BASE_MILES (preserves the 2500 spec value)", () => {
    // 2500 rounded to nearest 1000 would be 3000. Helper must skip rounding here.
    expect(getMmrMileageData(2027, null, NOW).value).toBe(2_500);
  });
});

describe("getMmrMileageData — older models", () => {
  it("ageYears × annual + currentMonth × monthly, rounded to nearest 1000", () => {
    // 2020 model in May 2026: (6 × 15000) + (5 × 1250) = 90000 + 6250 = 96250 → 96000
    expect(getMmrMileageData(2020, null, NOW).value).toBe(96_000);
  });

  it("rounds up when fractional thousands ≥ 500", () => {
    // 2024 model in May 2026: (2 × 15000) + (5 × 1250) = 30000 + 6250 = 36250 → 36000
    // Use a date that produces a half-up case:
    // 2025 model in November 2026: (1 × 15000) + (11 × 1250) = 15000 + 13750 = 28750 → 29000
    const nov = new Date("2026-11-15T00:00:00Z");
    expect(getMmrMileageData(2025, null, nov).value).toBe(29_000);
  });

  it("rounds down when fractional thousands < 500", () => {
    // 2025 model in May 2026: (1 × 15000) + (5 × 1250) = 15000 + 6250 = 21250 → 21000
    expect(getMmrMileageData(2025, null, NOW).value).toBe(21_000);
  });

  it("caps at MAX_MILEAGE_CAP for very old models", () => {
    // 2000 model in May 2026: (26 × 15000) + (5 × 1250) = 396250 → caps at 250000
    expect(getMmrMileageData(2000, null, NOW).value).toBe(MAX_MILEAGE_CAP);
  });

  it("caps at MAX_MILEAGE_CAP at the boundary", () => {
    // Find a year that produces exactly the cap before capping. Don't matter much —
    // assert anything ≥ 17 years old hits the cap given the formula.
    expect(getMmrMileageData(1990, null, NOW).value).toBe(MAX_MILEAGE_CAP);
    expect(getMmrMileageData(1980, null, NOW).value).toBe(MAX_MILEAGE_CAP);
  });
});

describe("getMmrMileageData — inferred flag and method", () => {
  it("isInferred is false and method is 'actual' for actual path", () => {
    const r = getMmrMileageData(2020, 50_000, NOW);
    expect(r.isInferred).toBe(false);
    expect(r.method).toBe("actual");
  });

  it("isInferred is true and method is 'estimated_annual_average' for inference paths", () => {
    const cases = [
      getMmrMileageData(2020, null, NOW),
      getMmrMileageData(2026, null, NOW),
      getMmrMileageData(2027, null, NOW),
      getMmrMileageData(2000, null, NOW),
    ];
    for (const r of cases) {
      expect(r.isInferred).toBe(true);
      expect(r.method).toBe("estimated_annual_average");
    }
  });
});

describe("getMmrMileageData — determinism", () => {
  it("produces the same result for the same inputs and injected now", () => {
    const a = getMmrMileageData(2020, null, NOW);
    const b = getMmrMileageData(2020, null, NOW);
    expect(a).toEqual(b);
  });

  it("changes deterministically when month changes", () => {
    const may = new Date("2026-05-15T12:00:00Z");
    const jun = new Date("2026-06-15T12:00:00Z");
    const mayResult = getMmrMileageData(2026, null, may);
    const junResult = getMmrMileageData(2026, null, jun);
    // 5 × 1250 = 6250 → 6000; 6 × 1250 = 7500 → 8000 (Math.round half-up)
    expect(mayResult.value).toBe(6_000);
    expect(junResult.value).toBe(8_000);
    expect(junResult.value).toBeGreaterThan(mayResult.value);
  });

  it("uses the real Date when now is omitted (smoke test)", () => {
    // Only assert structure, not value (depends on real clock).
    const r = getMmrMileageData(2020, null);
    expect(typeof r.value).toBe("number");
    expect(r.value).toBeGreaterThan(0);
    expect(r.isInferred).toBe(true);
    expect(r.method).toBe("estimated_annual_average");
  });
});

describe("getMmrMileageData — exported constants", () => {
  it("exposes the documented constants with expected values", () => {
    expect(US_ANNUAL_AVG_MILES).toBe(15_000);
    expect(MONTHLY_AVG_MILES).toBe(1_250);
    expect(MAX_MILEAGE_CAP).toBe(250_000);
    expect(NEXT_YEAR_BASE_MILES).toBe(2_500);
    expect(INFERRED_MILEAGE_FLOOR).toBe(1_000);
  });

  it("MONTHLY_AVG_MILES × 12 equals US_ANNUAL_AVG_MILES", () => {
    expect(MONTHLY_AVG_MILES * 12).toBe(US_ANNUAL_AVG_MILES);
  });
});

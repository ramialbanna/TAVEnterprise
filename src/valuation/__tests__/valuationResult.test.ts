import { describe, it, expect } from "vitest";
import { fromMmrResult } from "../valuationResult";
import type { MmrResult } from "../mmr";

const VIN_RESULT: MmrResult = {
  mmrValue:    14_000,
  confidence:  "high",
  method:      "vin",
  rawResponse: { source: "vin" },
};

const YMM_RESULT: MmrResult = {
  mmrValue:    12_500,
  confidence:  "medium",
  method:      "year_make_model",
  rawResponse: { source: "ymm" },
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("fromMmrResult — VIN path", () => {
  it("sets mmrValue and wholesaleAvg to the scalar value", () => {
    const result = fromMmrResult(VIN_RESULT);
    expect(result.mmrValue).toBe(14_000);
    expect(result.wholesaleAvg).toBe(14_000);
  });

  it("sets confidence and valuationMethod from the MmrResult", () => {
    const result = fromMmrResult(VIN_RESULT);
    expect(result.confidence).toBe("high");
    expect(result.valuationMethod).toBe("vin");
  });

  it("leaves distribution fields null (no parsing path yet)", () => {
    const result = fromMmrResult(VIN_RESULT);
    expect(result.wholesaleClean).toBeNull();
    expect(result.wholesaleRough).toBeNull();
    expect(result.retailClean).toBeNull();
    expect(result.sampleCount).toBeNull();
  });

  it("preserves rawResponse", () => {
    const result = fromMmrResult(VIN_RESULT);
    expect(result.rawResponse).toEqual({ source: "vin" });
  });

  it("sets fetchedAt to a valid ISO timestamp", () => {
    const result = fromMmrResult(VIN_RESULT);
    expect(result.fetchedAt).toMatch(ISO_RE);
  });
});

describe("fromMmrResult — YMM path", () => {
  it("sets confidence='medium' and valuationMethod='year_make_model'", () => {
    const result = fromMmrResult(YMM_RESULT);
    expect(result.confidence).toBe("medium");
    expect(result.valuationMethod).toBe("year_make_model");
  });

  it("sets mmrValue and wholesaleAvg to the scalar value", () => {
    const result = fromMmrResult(YMM_RESULT);
    expect(result.mmrValue).toBe(12_500);
    expect(result.wholesaleAvg).toBe(12_500);
  });
});

describe("fromMmrResult — KV fallback (no method field)", () => {
  it("derives valuationMethod='vin' when method is absent and confidence is 'high'", () => {
    const cached = { mmrValue: 14_000, confidence: "high" as const, rawResponse: {} } satisfies MmrResult;
    const result = fromMmrResult(cached);
    expect(result.valuationMethod).toBe("vin");
    expect(result.confidence).toBe("high");
  });

  it("derives valuationMethod='year_make_model' when method is absent and confidence is 'medium'", () => {
    const cached = { mmrValue: 12_000, confidence: "medium" as const, rawResponse: {} } satisfies MmrResult;
    const result = fromMmrResult(cached);
    expect(result.valuationMethod).toBe("year_make_model");
    expect(result.confidence).toBe("medium");
  });

  it("still sets wholesaleAvg from mmrValue on a cached result", () => {
    const cached = { mmrValue: 9_500, confidence: "medium" as const, rawResponse: {} } satisfies MmrResult;
    const result = fromMmrResult(cached);
    expect(result.wholesaleAvg).toBe(9_500);
  });
});

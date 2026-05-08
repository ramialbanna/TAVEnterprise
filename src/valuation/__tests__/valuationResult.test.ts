import { describe, it, expect } from "vitest";
import { fromMmrResult } from "../valuationResult";
import type { MmrResult } from "../mmr";

const VIN_RESULT: MmrResult = {
  mmrValue:    14_000,
  confidence:  "high",
  method:      "vin",
  rawResponse: { source: "vin" },
};

const VIN_RESULT_WITH_DIST: MmrResult = {
  mmrValue:    14_000,
  confidence:  "high",
  method:      "vin",
  rawResponse: {
    href: "https://api.manheim.com/...",
    count: 1,
    items: [{
      adjustedPricing: { wholesale: { above: 15_200, average: 14_000, below: 12_800 } },
      sampleSize: "22",
    }],
  },
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

  it("leaves distribution fields null when rawResponse has no adjustedPricing", () => {
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

describe("fromMmrResult — distribution field extraction", () => {
  it("extracts wholesaleClean and wholesaleRough from adjustedPricing when present", () => {
    const result = fromMmrResult(VIN_RESULT_WITH_DIST);
    expect(result.wholesaleClean).toBe(15_200);
    expect(result.wholesaleRough).toBe(12_800);
  });

  it("keeps wholesaleAvg equal to mmrValue (primary scalar)", () => {
    const result = fromMmrResult(VIN_RESULT_WITH_DIST);
    expect(result.wholesaleAvg).toBe(14_000);
  });

  it("extracts sampleCount from sampleSize string", () => {
    const result = fromMmrResult(VIN_RESULT_WITH_DIST);
    expect(result.sampleCount).toBe(22);
  });

  it("retailClean is always null regardless of payload", () => {
    const result = fromMmrResult(VIN_RESULT_WITH_DIST);
    expect(result.retailClean).toBeNull();
  });
});

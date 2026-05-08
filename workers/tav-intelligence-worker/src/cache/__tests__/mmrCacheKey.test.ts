import { describe, it, expect } from "vitest";
import {
  deriveVinCacheKey,
  deriveYmmCacheKey,
  mileageBucket,
} from "../mmrCacheKey";

describe("deriveVinCacheKey", () => {
  it("uppercases the VIN", () => {
    expect(deriveVinCacheKey("1hgcm82633a123456")).toBe("vin:1HGCM82633A123456");
  });

  it("trims whitespace around the VIN", () => {
    expect(deriveVinCacheKey("  1HGCM82633A123456  ")).toBe("vin:1HGCM82633A123456");
  });

  it("preserves already-uppercase VINs", () => {
    expect(deriveVinCacheKey("1HGCM82633A123456")).toBe("vin:1HGCM82633A123456");
  });
});

describe("deriveYmmCacheKey", () => {
  it("rounds 47,250 down to 45,000", () => {
    const k = deriveYmmCacheKey({
      year: 2020, make: "Toyota", model: "Camry", trim: "SE", mileage: 47_250,
    });
    expect(k).toBe("ymm:2020:toyota:camry:se:45000");
  });

  it("rounds 48,999 up to 50,000", () => {
    const k = deriveYmmCacheKey({
      year: 2020, make: "Toyota", model: "Camry", trim: "SE", mileage: 48_999,
    });
    expect(k).toBe("ymm:2020:toyota:camry:se:50000");
  });

  it("rounds 52,500 up to 55,000 (half-up)", () => {
    const k = deriveYmmCacheKey({
      year: 2020, make: "Toyota", model: "Camry", trim: "SE", mileage: 52_500,
    });
    expect(k).toBe("ymm:2020:toyota:camry:se:55000");
  });

  it("buckets 0 mileage to 0", () => {
    const k = deriveYmmCacheKey({
      year: 2027, make: "Rivian", model: "R1T", mileage: 0,
    });
    expect(k).toBe("ymm:2027:rivian:r1t:base:0");
  });

  it("uses 'base' when trim is null", () => {
    const k = deriveYmmCacheKey({
      year: 2024, make: "Ford", model: "F-150", trim: null, mileage: 25_000,
    });
    expect(k).toBe("ymm:2024:ford:f-150:base:25000");
  });

  it("uses 'base' when trim is undefined", () => {
    const k = deriveYmmCacheKey({
      year: 2024, make: "Ford", model: "F-150", mileage: 25_000,
    });
    expect(k).toBe("ymm:2024:ford:f-150:base:25000");
  });

  it("uses 'base' when trim is whitespace only", () => {
    const k = deriveYmmCacheKey({
      year: 2024, make: "Ford", model: "F-150", trim: "   ", mileage: 25_000,
    });
    expect(k).toBe("ymm:2024:ford:f-150:base:25000");
  });

  it("normalizes special characters and whitespace in make/model/trim", () => {
    const k = deriveYmmCacheKey({
      year: 2022, make: "Mercedes-Benz", model: "C@300!", trim: "AMG  Line", mileage: 30_000,
    });
    expect(k).toBe("ymm:2022:mercedes-benz:c300:amg_line:30000");
  });

  it("is case-insensitive on make/model/trim", () => {
    const a = deriveYmmCacheKey({
      year: 2020, make: "TOYOTA", model: "CAMRY", trim: "SE", mileage: 60_000,
    });
    const b = deriveYmmCacheKey({
      year: 2020, make: "toyota", model: "camry", trim: "se", mileage: 60_000,
    });
    expect(a).toBe(b);
  });

  it("buckets 1,000 (the inferred-mileage floor) to 0", () => {
    expect(mileageBucket(1_000)).toBe(0);
  });

  it("rounds 50,000 to itself (boundary)", () => {
    expect(mileageBucket(50_000)).toBe(50_000);
  });
});

import { describe, it, expect } from "vitest";
import { mileageBucket, kvKeyForVin, kvKeyForYmm } from "../src/valuation/mmr";

describe("mileageBucket", () => {
  it("floors to the nearest 10k", () => {
    expect(mileageBucket(0)).toBe(0);
    expect(mileageBucket(9_999)).toBe(0);
    expect(mileageBucket(10_000)).toBe(10_000);
    expect(mileageBucket(82_400)).toBe(80_000);
    expect(mileageBucket(99_999)).toBe(90_000);
    expect(mileageBucket(100_000)).toBe(100_000);
    expect(mileageBucket(120_001)).toBe(120_000);
  });
});

describe("kvKeyForVin", () => {
  it("uppercases the VIN", () => {
    expect(kvKeyForVin("1hgcm82633a004352")).toBe("mmr:vin:1HGCM82633A004352");
  });

  it("keeps already-uppercase VINs unchanged", () => {
    expect(kvKeyForVin("1HGCM82633A004352")).toBe("mmr:vin:1HGCM82633A004352");
  });
});

describe("kvKeyForYmm", () => {
  it("builds a stable cache key", () => {
    expect(kvKeyForYmm(2021, "Toyota", "Camry", 45_000)).toBe("mmr:ymm:2021:toyota:camry:40000");
  });

  it("lowercases make and model", () => {
    expect(kvKeyForYmm(2019, "FORD", "F-150", 82_000)).toBe("mmr:ymm:2019:ford:f-150:80000");
  });

  it("two listings in the same mileage bucket share a cache key", () => {
    const key1 = kvKeyForYmm(2020, "Honda", "Civic", 55_000);
    const key2 = kvKeyForYmm(2020, "Honda", "Civic", 58_999);
    expect(key1).toBe(key2);
  });

  it("listings in different mileage buckets have different cache keys", () => {
    const key1 = kvKeyForYmm(2020, "Honda", "Civic", 49_999);
    const key2 = kvKeyForYmm(2020, "Honda", "Civic", 50_000);
    expect(key1).not.toBe(key2);
  });
});

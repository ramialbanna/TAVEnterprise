import { describe, it, expect } from "vitest";
import { computeIdentityKey } from "../src/dedupe/fingerprint";
import type { NormalizedListingInput } from "../src/types/domain";

const base: NormalizedListingInput = {
  source: "facebook",
  url: "https://fb.com/1",
  title: "2019 Toyota Camry SE",
  year: 2019,
  make: "toyota",
  model: "camry",
  region: "dallas_tx",
  mileage: 62000,
  scrapedAt: new Date().toISOString(),
};

describe("computeIdentityKey", () => {
  it("uses vin: prefix when VIN is present", () => {
    const key = computeIdentityKey({ ...base, vin: "1HGBH41JXMN109186" });
    expect(key).toBe("vin:1HGBH41JXMN109186");
  });

  it("normalizes VIN to uppercase", () => {
    const key = computeIdentityKey({ ...base, vin: "1hgbh41jxmn109186" });
    expect(key).toBe("vin:1HGBH41JXMN109186");
  });

  it("uses ymm: prefix when VIN absent", () => {
    const key = computeIdentityKey(base);
    expect(key).toMatch(/^ymm:/);
  });

  it("includes year, make, model, region, mileage bucket", () => {
    const key = computeIdentityKey(base);
    expect(key).toBe("ymm:2019:toyota:camry:dallas_tx:50k-75k");
  });

  it("mileage bucket 0-25k", () => {
    expect(computeIdentityKey({ ...base, mileage: 10000 })).toContain("0-25k");
  });

  it("mileage bucket 25k-50k", () => {
    expect(computeIdentityKey({ ...base, mileage: 25000 })).toContain("25k-50k");
  });

  it("mileage bucket 75k-100k", () => {
    expect(computeIdentityKey({ ...base, mileage: 80000 })).toContain("75k-100k");
  });

  it("mileage bucket 100k+", () => {
    expect(computeIdentityKey({ ...base, mileage: 150000 })).toContain("100k+");
  });

  it("unknown mileage bucket when mileage absent", () => {
    const noMileage: NormalizedListingInput = { ...base, mileage: undefined };
    expect(computeIdentityKey(noMileage)).toContain(":unknown");
  });

  it("slugifies make and model (strips spaces and special chars)", () => {
    const key = computeIdentityKey({ ...base, make: "Mercedes-Benz", model: "C-Class" });
    expect(key).toContain(":mercedesbenz:cclass:");
  });

  it("two listings with same YMM+region+mileage bucket get same key", () => {
    const a = computeIdentityKey({ ...base, mileage: 61000 });
    const b = computeIdentityKey({ ...base, mileage: 63000 });
    expect(a).toBe(b);
  });

  it("different mileage buckets produce different keys", () => {
    const a = computeIdentityKey({ ...base, mileage: 20000 });
    const b = computeIdentityKey({ ...base, mileage: 30000 });
    expect(a).not.toBe(b);
  });
});

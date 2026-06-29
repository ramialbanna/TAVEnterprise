import { describe, expect, it } from "vitest";

import { readMmrLabPrefill } from "./mmr-lab-prefill";

describe("readMmrLabPrefill", () => {
  it("reads VIN prefill", () => {
    const params = new URLSearchParams("vin=1HGBH41JXMN109123");
    expect(readMmrLabPrefill(params)).toEqual({
      kind: "vin",
      vin: "1HGBH41JXMN109123",
    });
  });

  it("reads YMM prefill when all four fields are present", () => {
    const params = new URLSearchParams(
      "year=2019&make=Honda&model=Accord&style=EX",
    );
    expect(readMmrLabPrefill(params)).toEqual({
      kind: "ymm",
      selection: { year: "2019", make: "Honda", model: "Accord", style: "EX" },
    });
  });

  it("returns null when YMM is incomplete", () => {
    const params = new URLSearchParams("year=2019&make=Honda&model=Accord");
    expect(readMmrLabPrefill(params)).toBeNull();
  });
});

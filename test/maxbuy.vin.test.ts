import { describe, expect, it } from "vitest";

import {
  decodeVinModelYear,
  isValidVinCheckDigit,
  isValidVinFormat,
  normalizeVin,
} from "../src/maxbuy/vin";

// Valid test VIN with correct ISO-3779 check digit (2003 Honda Accord)
const VALID_VIN = "1HGCM82633A004352";

describe("maxbuy vin", () => {
  it("normalizes to uppercase", () => {
    expect(normalizeVin(" 1hgcm82633a004352 ")).toBe(VALID_VIN);
  });

  it("validates format and check digit", () => {
    expect(isValidVinFormat(VALID_VIN)).toBe(true);
    expect(isValidVinCheckDigit(VALID_VIN)).toBe(true);
  });

  it("rejects invalid check digit", () => {
    expect(isValidVinCheckDigit("1FTFW1ET5DFA12346")).toBe(false);
  });

  it("decodes model year from VIN position 10", () => {
    expect(decodeVinModelYear(VALID_VIN)).toBe(2003);
  });
});

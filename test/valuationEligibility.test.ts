import { describe, expect, it } from "vitest";
import {
  VALUATION_MIN_YEAR,
  isYearBelowValuationFloor,
} from "../src/valuation/valuationEligibility";
import { SCRAPER_REVIEW_MIN_YEAR } from "../src/persistence/opportunities";

describe("valuation year floor (item 72)", () => {
  it("stays in lockstep with the Unprocessed Leads floor", () => {
    // We value exactly the inventory a buyer can act on. If one floor moves,
    // the other has to move with it or we either price invisible listings or
    // surface listings with no price.
    expect(VALUATION_MIN_YEAR).toBe(SCRAPER_REVIEW_MIN_YEAR);
  });

  it("is true only below the floor", () => {
    expect(isYearBelowValuationFloor(2010)).toBe(true);
    expect(isYearBelowValuationFloor(2005)).toBe(true);
    expect(isYearBelowValuationFloor(VALUATION_MIN_YEAR)).toBe(false);
    expect(isYearBelowValuationFloor(2012)).toBe(false);
    expect(isYearBelowValuationFloor(2020)).toBe(false);
  });

  it("treats an unknown year as eligible so the existing miss reasons still apply", () => {
    expect(isYearBelowValuationFloor(undefined)).toBe(false);
    expect(isYearBelowValuationFloor(null)).toBe(false);
  });
});

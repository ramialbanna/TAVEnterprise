import { describe, expect, it } from "vitest";
import {
  COX_CATALOG_MIN_YEAR,
  buildCoxCatalogYearRange,
} from "../intelCatalogClient";
import { VALUATION_MIN_YEAR } from "../../valuation/valuationEligibility";

describe("buildCoxCatalogYearRange (item 64)", () => {
  it("starts at 2011 and ends at current year + 1", () => {
    expect(COX_CATALOG_MIN_YEAR).toBe(2011);
    const years = buildCoxCatalogYearRange();
    const currentYear = new Date().getFullYear();
    expect(years[0]).toBe(2011);
    expect(years[years.length - 1]).toBe(currentYear + 1);
    expect(years).toHaveLength(currentYear + 1 - 2011 + 1);
  });

  it("covers every year we still value, so no eligible listing hits catalog_not_synced", () => {
    expect(COX_CATALOG_MIN_YEAR).toBeLessThanOrEqual(VALUATION_MIN_YEAR);
  });
});

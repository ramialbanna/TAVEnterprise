import { describe, expect, it } from "vitest";
import {
  COX_CATALOG_MIN_YEAR,
  buildCoxCatalogYearRange,
} from "../intelCatalogClient";

describe("buildCoxCatalogYearRange (item 64)", () => {
  it("starts at 2013 and ends at current year + 1", () => {
    expect(COX_CATALOG_MIN_YEAR).toBe(2013);
    const years = buildCoxCatalogYearRange();
    const currentYear = new Date().getFullYear();
    expect(years[0]).toBe(2013);
    expect(years[years.length - 1]).toBe(currentYear + 1);
    expect(years).toHaveLength(currentYear + 1 - 2013 + 1);
  });
});

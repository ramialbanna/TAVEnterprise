import { describe, expect, it } from "vitest";

import type { HistoricalSale } from "@/lib/app-api/schemas";

import { comparisonAggregates, median } from "./historical-aggregate";

function row(over: Partial<HistoricalSale>): HistoricalSale {
  return {
    id: "hs_x",
    vin: null,
    year: 2024,
    make: "Ford",
    model: "F-150",
    trim: null,
    buyer: null,
    buyerUserId: null,
    acquisitionDate: null,
    saleDate: "2026-05-01",
    acquisitionCost: 14000,
    salePrice: 16000,
    transportCost: null,
    reconCost: null,
    auctionFees: null,
    grossProfit: 1500,
    sourceFileName: null,
    uploadBatchId: null,
    createdAt: "2026-05-01T18:00:00.000Z",
    ...over,
  };
}

describe("median", () => {
  it("returns the middle value for an odd-length input", () => {
    expect(median([1, 3, 2])).toBe(2);
  });

  it("returns the average of the two middle values for an even-length input", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns null for an empty array", () => {
    expect(median([])).toBeNull();
  });

  it("skips null / undefined / NaN / Infinity values (does not coerce to 0)", () => {
    expect(median([1, null, 3, undefined, Number.NaN, Number.POSITIVE_INFINITY])).toBe(2);
    expect(median([null, undefined, Number.NaN])).toBeNull();
  });

  it("handles negative numbers correctly", () => {
    expect(median([-3, -1, -2])).toBe(-2);
  });
});

describe("comparisonAggregates", () => {
  it("returns count 0 and null metrics for an empty input", () => {
    expect(comparisonAggregates([])).toEqual({
      count: 0,
      lastSoldDate: null,
      avgSalePrice: null,
      medianSalePrice: null,
      avgAcquisitionCost: null,
      avgGross: null,
    });
  });

  it("computes count, max saleDate, mean salePrice/acquisitionCost/grossProfit, and median salePrice", () => {
    const rows = [
      row({ saleDate: "2026-03-15", salePrice: 16000, acquisitionCost: 14000, grossProfit: 1500 }),
      row({ saleDate: "2026-04-10", salePrice: 18000, acquisitionCost: 15000, grossProfit: 2000 }),
      row({ saleDate: "2026-05-20", salePrice: 20000, acquisitionCost: 16000, grossProfit: 2500 }),
    ];
    expect(comparisonAggregates(rows)).toEqual({
      count: 3,
      lastSoldDate: "2026-05-20",
      avgSalePrice: 18000,
      medianSalePrice: 18000,
      avgAcquisitionCost: 15000,
      avgGross: 2000,
    });
  });

  it("skips null acquisition costs and gross profits from the means — never coerces to 0", () => {
    const rows = [
      row({ salePrice: 16000, acquisitionCost: null, grossProfit: null }),
      row({ salePrice: 20000, acquisitionCost: 16000, grossProfit: 2500 }),
    ];
    const out = comparisonAggregates(rows);
    expect(out.count).toBe(2);
    expect(out.avgSalePrice).toBe(18000);
    expect(out.avgAcquisitionCost).toBe(16000);
    expect(out.avgGross).toBe(2500);
    // Belt-and-suspenders against silent zeroing.
    expect(out.avgAcquisitionCost).not.toBe(0);
    expect(out.avgGross).not.toBe(0);
  });

  it("counts every input row even when no metric is finite (metrics are then all null)", () => {
    const rows = [
      row({ saleDate: "bad-date", salePrice: Number.NaN, acquisitionCost: null, grossProfit: null }),
    ];
    const out = comparisonAggregates(rows);
    expect(out.count).toBe(1);
    expect(out.lastSoldDate).toBeNull();
    expect(out.avgSalePrice).toBeNull();
    expect(out.medianSalePrice).toBeNull();
    expect(out.avgAcquisitionCost).toBeNull();
    expect(out.avgGross).toBeNull();
  });

  it("treats an unparseable saleDate as missing for the lastSoldDate calculation", () => {
    const rows = [
      row({ saleDate: "not-a-date", salePrice: 16000 }),
      row({ saleDate: "2026-04-10", salePrice: 18000 }),
    ];
    expect(comparisonAggregates(rows).lastSoldDate).toBe("2026-04-10");
  });
});

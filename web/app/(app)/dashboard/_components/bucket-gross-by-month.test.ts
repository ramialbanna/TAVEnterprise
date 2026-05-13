import { describe, expect, it } from "vitest";

import type { HistoricalSale } from "@/lib/app-api/schemas";

import { bucketGrossByMonth } from "./bucket-gross-by-month";

function row(over: Partial<HistoricalSale>): HistoricalSale {
  return {
    id: "hs_x",
    vin: null,
    year: 2026,
    make: "Ford",
    model: "F-150",
    trim: null,
    buyer: null,
    buyerUserId: null,
    acquisitionDate: null,
    saleDate: "2026-05-01",
    acquisitionCost: null,
    salePrice: 30000,
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

describe("bucketGrossByMonth", () => {
  it("buckets rows by YYYY-MM, averages grossProfit, sorts ascending", () => {
    const rows = [
      row({ saleDate: "2026-03-15", grossProfit: 1000 }),
      row({ saleDate: "2026-03-22", grossProfit: 2000 }),
      row({ saleDate: "2026-05-01", grossProfit: 1500 }),
      row({ saleDate: "2026-04-09", grossProfit: 500 }),
    ];
    expect(bucketGrossByMonth(rows)).toEqual([
      { month: "2026-03", avgGross: 1500, count: 2 },
      { month: "2026-04", avgGross: 500, count: 1 },
      { month: "2026-05", avgGross: 1500, count: 1 },
    ]);
  });

  it("skips rows with null grossProfit — never coerces to 0", () => {
    const rows = [
      row({ saleDate: "2026-03-01", grossProfit: 1000 }),
      row({ saleDate: "2026-03-02", grossProfit: null }),
    ];
    const out = bucketGrossByMonth(rows);
    expect(out).toEqual([{ month: "2026-03", avgGross: 1000, count: 1 }]);
    for (const b of out) expect(b.avgGross).not.toBe(0);
  });

  it("skips rows with non-finite grossProfit (NaN / Infinity)", () => {
    const rows = [
      row({ saleDate: "2026-03-01", grossProfit: Number.NaN }),
      row({ saleDate: "2026-03-02", grossProfit: Number.POSITIVE_INFINITY }),
      row({ saleDate: "2026-03-03", grossProfit: 600 }),
    ];
    expect(bucketGrossByMonth(rows)).toEqual([{ month: "2026-03", avgGross: 600, count: 1 }]);
  });

  it("skips rows with an unparseable saleDate (and the empty string)", () => {
    const rows = [
      row({ saleDate: "not-a-date", grossProfit: 1000 }),
      row({ saleDate: "", grossProfit: 1000 }),
      row({ saleDate: "2026-04-15", grossProfit: 800 }),
    ];
    expect(bucketGrossByMonth(rows)).toEqual([{ month: "2026-04", avgGross: 800, count: 1 }]);
  });

  it("treats date-only YYYY-MM-DD inputs as UTC (no local-timezone month drift)", () => {
    const out = bucketGrossByMonth([
      row({ saleDate: "2026-01-01", grossProfit: 1000 }),
      row({ saleDate: "2026-12-31", grossProfit: 2000 }),
    ]);
    // If saleDate were parsed as local time, "2026-12-31" could shift to "2027-01" in
    // some timezones — the helper anchors to UTC midnight to prevent that.
    expect(out.map((b) => b.month)).toEqual(["2026-01", "2026-12"]);
  });

  it("returns [] for empty input", () => {
    expect(bucketGrossByMonth([])).toEqual([]);
  });
});

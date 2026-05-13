import { describe, expect, it } from "vitest";

import type { HistoricalSale } from "@/lib/app-api/schemas";

import {
  bucketAvgSalePriceByMonth,
  bucketCountByMonth,
  bucketGrossByMonth,
  comparisonAggregates,
  histogramBuckets,
  median,
  segmentRollup,
} from "./historical-aggregate";

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

describe("bucketGrossByMonth", () => {
  it("buckets by YYYY-MM (UTC), averages grossProfit, sorts ascending", () => {
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

  it("skips rows with null/non-finite grossProfit — never coerces to 0", () => {
    const rows = [
      row({ saleDate: "2026-03-01", grossProfit: 1000 }),
      row({ saleDate: "2026-03-02", grossProfit: null }),
      row({ saleDate: "2026-03-03", grossProfit: Number.NaN }),
      row({ saleDate: "2026-03-04", grossProfit: Number.POSITIVE_INFINITY }),
    ];
    expect(bucketGrossByMonth(rows)).toEqual([{ month: "2026-03", avgGross: 1000, count: 1 }]);
  });

  it("skips rows with an unparseable saleDate (and empty string)", () => {
    const rows = [
      row({ saleDate: "not-a-date", grossProfit: 1000 }),
      row({ saleDate: "", grossProfit: 1000 }),
      row({ saleDate: "2026-04-15", grossProfit: 800 }),
    ];
    expect(bucketGrossByMonth(rows)).toEqual([{ month: "2026-04", avgGross: 800, count: 1 }]);
  });

  it("treats date-only YYYY-MM-DD as UTC (no local-tz month drift across new year)", () => {
    expect(
      bucketGrossByMonth([
        row({ saleDate: "2026-01-01", grossProfit: 1000 }),
        row({ saleDate: "2026-12-31", grossProfit: 2000 }),
      ]).map((b) => b.month),
    ).toEqual(["2026-01", "2026-12"]);
  });

  it("returns [] for empty input", () => {
    expect(bucketGrossByMonth([])).toEqual([]);
  });
});

describe("bucketCountByMonth", () => {
  it("counts rows per UTC month and sorts ascending", () => {
    const rows = [
      row({ saleDate: "2026-03-15" }),
      row({ saleDate: "2026-03-20" }),
      row({ saleDate: "2026-04-01" }),
      row({ saleDate: "2026-04-02" }),
      row({ saleDate: "2026-04-03" }),
    ];
    expect(bucketCountByMonth(rows)).toEqual([
      { month: "2026-03", count: 2 },
      { month: "2026-04", count: 3 },
    ]);
  });

  it("counts a row even when its metric fields are null (uses saleDate alone)", () => {
    const rows = [
      row({ saleDate: "2026-05-01", salePrice: 0, grossProfit: null, acquisitionCost: null }),
      row({ saleDate: "2026-05-02", salePrice: 16000, grossProfit: 1500, acquisitionCost: 14000 }),
    ];
    expect(bucketCountByMonth(rows)).toEqual([{ month: "2026-05", count: 2 }]);
  });

  it("skips rows with an unparseable saleDate", () => {
    const rows = [
      row({ saleDate: "not-a-date" }),
      row({ saleDate: "2026-04-15" }),
    ];
    expect(bucketCountByMonth(rows)).toEqual([{ month: "2026-04", count: 1 }]);
  });

  it("returns [] for empty input", () => {
    expect(bucketCountByMonth([])).toEqual([]);
  });
});

describe("bucketAvgSalePriceByMonth", () => {
  it("averages salePrice per UTC month and skips null/non-finite", () => {
    const rows = [
      row({ saleDate: "2026-03-10", salePrice: 16000 }),
      row({ saleDate: "2026-03-20", salePrice: 18000 }),
      row({ saleDate: "2026-04-05", salePrice: Number.NaN }),
      row({ saleDate: "2026-04-10", salePrice: 20000 }),
    ];
    expect(bucketAvgSalePriceByMonth(rows)).toEqual([
      { month: "2026-03", avgSalePrice: 17000, count: 2 },
      { month: "2026-04", avgSalePrice: 20000, count: 1 },
    ]);
  });

  it("returns [] when every row's salePrice is non-finite (no fabricated zero buckets)", () => {
    const rows = [
      row({ saleDate: "2026-03-10", salePrice: Number.NaN }),
      row({ saleDate: "2026-04-05", salePrice: Number.POSITIVE_INFINITY }),
    ];
    expect(bucketAvgSalePriceByMonth(rows)).toEqual([]);
  });
});

describe("segmentRollup", () => {
  it("groups by make, counts, and computes avg/median gross — sorted by count desc", () => {
    const rows = [
      row({ make: "Ford", grossProfit: 1000 }),
      row({ make: "Ford", grossProfit: 2000 }),
      row({ make: "Ford", grossProfit: 3000 }),
      row({ make: "Toyota", grossProfit: 1500 }),
      row({ make: "Toyota", grossProfit: 2500 }),
    ];
    expect(segmentRollup(rows, "make")).toEqual([
      { segment: "Ford", count: 3, avgGross: 2000, medianGross: 2000 },
      { segment: "Toyota", count: 2, avgGross: 2000, medianGross: 2000 },
    ]);
  });

  it("treats null/blank/non-string segment keys as '(unknown)' (never silently dropped)", () => {
    const rows = [
      row({ make: "Ford", grossProfit: 1000 }),
      // Cast to bypass the schema's `make: z.string()` — simulates a future drift.
      row({ make: "" as unknown as string, grossProfit: 2000 }),
      row({ make: "   " as unknown as string, grossProfit: 3000 }),
    ];
    const out = segmentRollup(rows, "make");
    expect(out.map((g) => g.segment).sort()).toEqual(["(unknown)", "Ford"]);
    const unknown = out.find((g) => g.segment === "(unknown)")!;
    expect(unknown.count).toBe(2);
    // The "(unknown)" group still rolls up its grosses.
    expect(unknown.avgGross).toBe(2500);
  });

  it("groups by year as string and skips non-finite year values into '(unknown)'", () => {
    const rows = [
      row({ year: 2024, grossProfit: 1500 }),
      row({ year: 2024, grossProfit: 2500 }),
      row({ year: 2025, grossProfit: 3000 }),
      row({ year: Number.NaN as unknown as number, grossProfit: 1000 }),
    ];
    const out = segmentRollup(rows, "year");
    expect(out.map((g) => g.segment)).toEqual(
      expect.arrayContaining(["2024", "2025", "(unknown)"]),
    );
    const year2024 = out.find((g) => g.segment === "2024")!;
    expect(year2024.count).toBe(2);
    expect(year2024.avgGross).toBe(2000);
  });

  it("excludes non-finite grossProfit from avg/median while still counting the row", () => {
    const rows = [
      row({ make: "Ford", grossProfit: 1000 }),
      row({ make: "Ford", grossProfit: null }),
    ];
    expect(segmentRollup(rows, "make")).toEqual([
      { segment: "Ford", count: 2, avgGross: 1000, medianGross: 1000 },
    ]);
  });

  it("returns [] for empty input", () => {
    expect(segmentRollup([], "make")).toEqual([]);
  });
});

describe("histogramBuckets", () => {
  it("counts values into [lo, hi) buckets, inclusive at the final upper edge", () => {
    const edges = [0, 1000, 2000, 3000];
    const values = [0, 500, 999, 1000, 1500, 2000, 2999, 3000];
    expect(histogramBuckets(values, edges)).toEqual([
      { lo: 0, hi: 1000, count: 3 },
      { lo: 1000, hi: 2000, count: 2 },
      { lo: 2000, hi: 3000, count: 3 }, // 3000 falls into the inclusive final bucket
    ]);
  });

  it("skips null / undefined / non-finite values", () => {
    const edges = [0, 1000, 2000];
    const values = [500, null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 1500];
    expect(histogramBuckets(values, edges)).toEqual([
      { lo: 0, hi: 1000, count: 1 },
      { lo: 1000, hi: 2000, count: 1 },
    ]);
  });

  it("preserves the bucket shape with count 0 when no values fall in", () => {
    const edges = [0, 1000, 2000];
    expect(histogramBuckets([], edges)).toEqual([
      { lo: 0, hi: 1000, count: 0 },
      { lo: 1000, hi: 2000, count: 0 },
    ]);
  });

  it("drops values that fall outside the edge range", () => {
    const edges = [0, 1000, 2000];
    expect(histogramBuckets([-500, 5000], edges)).toEqual([
      { lo: 0, hi: 1000, count: 0 },
      { lo: 1000, hi: 2000, count: 0 },
    ]);
  });

  it("returns [] when edges are not strictly increasing or fewer than 2 edges", () => {
    expect(histogramBuckets([1, 2, 3], [0])).toEqual([]);
    expect(histogramBuckets([1, 2, 3], [0, 0, 1])).toEqual([]);
    expect(histogramBuckets([1, 2, 3], [2, 1])).toEqual([]);
  });
});

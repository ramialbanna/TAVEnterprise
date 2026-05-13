import { describe, expect, it } from "vitest";

import type { HistoricalSale } from "@/lib/app-api/schemas";

import {
  INITIAL_FILTER,
  activeFilterChips,
  applyClientFilters,
  distinctMakes,
  distinctModels,
  serverFilter,
  type FilterState,
} from "./historical-filters";

function row(over: Partial<HistoricalSale>): HistoricalSale {
  return {
    id: "hs_x",
    vin: "1FT8W3BT1000001",
    year: 2024,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    buyer: null,
    buyerUserId: null,
    acquisitionDate: null,
    saleDate: "2026-05-01",
    acquisitionCost: 14000,
    salePrice: 18000,
    transportCost: null,
    reconCost: null,
    auctionFees: null,
    grossProfit: 2000,
    sourceFileName: null,
    uploadBatchId: null,
    createdAt: "2026-05-01T18:00:00.000Z",
    ...over,
  };
}

describe("serverFilter", () => {
  it("includes only documented API params and always carries limit", () => {
    const state: FilterState = {
      ...INITIAL_FILTER,
      year: 2024,
      make: "Ford",
      model: "F-150",
      since: "2026-01-01",
      trim: "XLT",
      vinPresent: "present",
      grossMin: 1000,
      grossMax: 3000,
    };
    expect(serverFilter(state)).toEqual({
      limit: 100,
      year: 2024,
      make: "Ford",
      model: "F-150",
      since: "2026-01-01",
    });
  });

  it("omits null server-side fields", () => {
    expect(serverFilter(INITIAL_FILTER)).toEqual({ limit: 100 });
  });

  it("never sends client-only fields (trim, vinPresent, grossMin/Max) to the API", () => {
    const out = serverFilter({
      ...INITIAL_FILTER,
      trim: "XLT",
      vinPresent: "missing",
      grossMin: 0,
      grossMax: 999999,
    });
    expect(out).not.toHaveProperty("trim");
    expect(out).not.toHaveProperty("vinPresent");
    expect(out).not.toHaveProperty("grossMin");
    expect(out).not.toHaveProperty("grossMax");
  });
});

describe("applyClientFilters", () => {
  const rows = [
    row({ id: "1", vin: "VIN-PRESENT-1", trim: "XLT", grossProfit: 1500 }),
    row({ id: "2", vin: null, trim: "Lariat", grossProfit: 3500 }),
    row({ id: "3", vin: "VIN-PRESENT-3", trim: "xlt", grossProfit: 2500 }),
    row({ id: "4", vin: "", trim: "XLT", grossProfit: null }),
  ];

  it("returns input unchanged when no client filters are active", () => {
    const out = applyClientFilters(rows, {
      trim: null,
      vinPresent: "any",
      grossMin: null,
      grossMax: null,
    });
    expect(out).toHaveLength(4);
    // Reference equality on individual rows — applyClientFilters must not mutate.
    expect(out[0]).toBe(rows[0]);
  });

  it("filters trim case-insensitive exact (no substring match)", () => {
    const out = applyClientFilters(rows, {
      trim: "XLT",
      vinPresent: "any",
      grossMin: null,
      grossMax: null,
    });
    expect(out.map((r) => r.id).sort()).toEqual(["1", "3", "4"]);
  });

  it("filters vinPresent='present' to rows with a non-empty VIN", () => {
    const out = applyClientFilters(rows, {
      trim: null,
      vinPresent: "present",
      grossMin: null,
      grossMax: null,
    });
    expect(out.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("filters vinPresent='missing' to rows with null/empty VIN", () => {
    const out = applyClientFilters(rows, {
      trim: null,
      vinPresent: "missing",
      grossMin: null,
      grossMax: null,
    });
    expect(out.map((r) => r.id).sort()).toEqual(["2", "4"]);
  });

  it("drops rows with null/non-finite grossProfit when a gross range is active (no zero coercion)", () => {
    const out = applyClientFilters(rows, {
      trim: null,
      vinPresent: "any",
      grossMin: 0,
      grossMax: 100000,
    });
    // Row 4 has grossProfit:null — must be dropped, not coerced to 0.
    expect(out.map((r) => r.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("respects grossMin/grossMax bounds inclusively", () => {
    const out = applyClientFilters(rows, {
      trim: null,
      vinPresent: "any",
      grossMin: 2000,
      grossMax: 3000,
    });
    expect(out.map((r) => r.id)).toEqual(["3"]);
  });

  it("does not mutate the input array", () => {
    const before = rows.map((r) => r.id);
    applyClientFilters(rows, { trim: "XLT", vinPresent: "any", grossMin: null, grossMax: null });
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("distinctMakes / distinctModels", () => {
  const rows = [
    row({ make: "Ford", model: "F-150" }),
    row({ make: "Ford", model: "F-150" }),
    row({ make: "Toyota", model: "Camry" }),
    row({ make: "Honda", model: "Accord" }),
    row({ make: "Ford", model: "Ranger" }),
    row({ make: "" as unknown as string, model: "Ghost" }),
    row({ make: "Toyota", model: "" as unknown as string }),
  ];

  it("distinctMakes returns sorted unique non-blank make values", () => {
    expect(distinctMakes(rows)).toEqual(["Ford", "Honda", "Toyota"]);
  });

  it("distinctModels with no scope returns every distinct non-blank model", () => {
    expect(distinctModels(rows)).toEqual(["Accord", "Camry", "F-150", "Ghost", "Ranger"]);
  });

  it("distinctModels scoped to a make filters by that make only", () => {
    expect(distinctModels(rows, "Ford")).toEqual(["F-150", "Ranger"]);
    expect(distinctModels(rows, "Toyota")).toEqual(["Camry"]);
  });

  it("distinctMakes/distinctModels return [] for an empty input", () => {
    expect(distinctMakes([])).toEqual([]);
    expect(distinctModels([])).toEqual([]);
  });
});

describe("activeFilterChips", () => {
  it("returns [] for the initial filter", () => {
    expect(activeFilterChips(INITIAL_FILTER)).toEqual([]);
  });

  it("returns one chip per active filter", () => {
    const chips = activeFilterChips({
      ...INITIAL_FILTER,
      year: 2024,
      make: "Ford",
      trim: "XLT",
      vinPresent: "present",
      grossMin: 1000,
    });
    const keys = chips.map((c) => c.key).sort();
    expect(keys).toEqual(["grossMin", "make", "trim", "vinPresent", "year"]);
  });
});

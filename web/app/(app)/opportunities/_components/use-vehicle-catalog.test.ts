import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/lib/app-api";
import type { MmrCatalog } from "@/lib/app-api/schemas";

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return {
    ...actual,
    getMmrCatalogYears: vi.fn(),
    getMmrCatalogMakes: vi.fn(),
    getMmrCatalogModels: vi.fn(),
    getMmrCatalogStyles: vi.fn(),
  };
});

import {
  getMmrCatalogYears,
  getMmrCatalogMakes,
  getMmrCatalogModels,
  getMmrCatalogStyles,
} from "@/lib/app-api/client";

import {
  buildMmrLabPrefillHref,
  matchCatalogOption,
  pickCatalogOptionFuzzy,
  resolveListingToCatalog,
} from "./use-vehicle-catalog";

const mockedYears = vi.mocked(getMmrCatalogYears);
const mockedMakes = vi.mocked(getMmrCatalogMakes);
const mockedModels = vi.mocked(getMmrCatalogModels);
const mockedStyles = vi.mocked(getMmrCatalogStyles);

function catalogOk(items: string[]): ApiResult<MmrCatalog> {
  return {
    ok: true,
    status: 200,
    data: { items, catalogState: "connected", reason: null, cached: false },
  };
}

describe("matchCatalogOption", () => {
  it("matches case-insensitively", () => {
    expect(matchCatalogOption(["Honda", "Toyota"], "honda")).toBe("Honda");
  });

  it("returns null when no match", () => {
    expect(matchCatalogOption(["Honda"], "kia")).toBeNull();
  });
});

describe("pickCatalogOptionFuzzy", () => {
  it("matches when listing model contains catalog model", () => {
    expect(pickCatalogOptionFuzzy(["Sportage", "Sorento"], "sportage fe")).toBe("Sportage");
  });
});

describe("resolveListingToCatalog", () => {
  beforeEach(() => {
    mockedYears.mockReset();
    mockedMakes.mockReset();
    mockedModels.mockReset();
    mockedStyles.mockReset();
    mockedYears.mockResolvedValue(catalogOk(["2018", "2019", "2020"]));
    mockedMakes.mockResolvedValue(catalogOk(["Kia", "Honda"]));
    mockedModels.mockResolvedValue(catalogOk(["Sportage", "Sorento", "Accord"]));
    mockedStyles.mockResolvedValue(catalogOk(["4D SUV LX", "4D SUV EX", "4D SUV FE"]));
  });

  it("case-matches honda / odyssey style tokens", async () => {
    mockedMakes.mockResolvedValue(catalogOk(["Honda"]));
    mockedModels.mockResolvedValue(catalogOk(["Odyssey"]));
    mockedStyles.mockResolvedValue(catalogOk(["MINIVAN EX"]));

    const result = await resolveListingToCatalog({
      year: 2020,
      make: "honda",
      model: "odyssey",
      style: "minivan ex",
    });

    expect(result.selection).toEqual({
      year: "2020",
      make: "Honda",
      model: "Odyssey",
      style: "MINIVAN EX",
    });
    expect(result.changedFields.make).toEqual({ from: "honda", to: "Honda" });
    expect(result.styleEstimated).toBe(false);
  });

  it("strips verbose Sportage FE model into Cox model + style", async () => {
    const result = await resolveListingToCatalog({
      year: 2018,
      make: "kia",
      model: "sportage fe",
      title: "2018 Kia Sportage FE",
    });

    expect(result.selection.year).toBe("2018");
    expect(result.selection.make).toBe("Kia");
    expect(result.selection.model).toBe("Sportage");
    expect(result.selection.style).toMatch(/FE/i);
    expect(result.changedFields.model).toEqual({ from: "sportage fe", to: "Sportage" });
  });

  it("returns unmatched make when catalog has no match", async () => {
    const result = await resolveListingToCatalog({
      year: 2018,
      make: "Piper",
      model: "Cherokee",
    });
    expect(result.selection.year).toBe("2018");
    expect(result.selection.make).toBe("");
    expect(result.unmatched).toContain("make");
  });
});

describe("buildMmrLabPrefillHref", () => {
  it("prefers VIN", () => {
    expect(
      buildMmrLabPrefillHref({
        vin: "1HGBH41JXMN109123",
        selection: { year: "2019", make: "Honda", model: "Accord", style: "EX" },
      }),
    ).toBe("/mmr-lab?vin=1HGBH41JXMN109123");
  });

  it("uses catalog-canonical YMM query params", () => {
    expect(
      buildMmrLabPrefillHref({
        selection: { year: "2018", make: "Kia", model: "Sportage", style: "4D SUV FE" },
      }),
    ).toBe("/mmr-lab?year=2018&make=Kia&model=Sportage&style=4D+SUV+FE");
  });
});

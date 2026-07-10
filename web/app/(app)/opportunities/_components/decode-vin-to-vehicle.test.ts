import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/lib/app-api";
import type { MmrCatalog, MmrVinOk } from "@/lib/app-api/schemas";

import {
  decodeVinToVehicleSelection,
  isDecodableVin,
  normalizeOpportunityVin,
} from "./decode-vin-to-vehicle";

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return {
    ...actual,
    postMmrVin: vi.fn(),
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
  postMmrVin,
} from "@/lib/app-api/client";

const mockedPostMmrVin = vi.mocked(postMmrVin);
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

function mmrOk(overrides: Partial<MmrVinOk> = {}): ApiResult<MmrVinOk> {
  return {
    ok: true,
    status: 200,
    data: {
      mmrValue: 28500,
      confidence: "high",
      method: "vin",
      year: 2021,
      make: "Kia",
      model: "Sorento",
      trim: "SX",
      ...overrides,
    },
  };
}

describe("normalizeOpportunityVin / isDecodableVin", () => {
  it("strips separators and uppercases", () => {
    expect(normalizeOpportunityVin(" 7mucaaag7nv022177 ")).toBe("7MUCAAAG7NV022177");
    expect(normalizeOpportunityVin("1hg-bh41jx-mn109186")).toBe("1HGBH41JXMN109186");
  });

  it("accepts 11–17 character VINs", () => {
    expect(isDecodableVin("1HGBH41JXMN")).toBe(true);
    expect(isDecodableVin("7MUCAAAG7NV022177")).toBe(true);
    expect(isDecodableVin("SHORT")).toBe(false);
    expect(isDecodableVin("")).toBe(false);
  });
});

describe("decodeVinToVehicleSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedYears.mockResolvedValue(
      catalogOk(["2024", "2023", "2022", "2021", "2020", "2019"]),
    );
    mockedMakes.mockResolvedValue(catalogOk(["Kia", "Honda"]));
    mockedModels.mockResolvedValue(catalogOk(["Sorento", "Sportage"]));
    mockedStyles.mockResolvedValue(catalogOk(["SX", "EX", "LX"]));
  });

  it("maps Cox VIN identity onto catalog Y/M/M/S", async () => {
    mockedPostMmrVin.mockResolvedValue(mmrOk());

    const result = await decodeVinToVehicleSelection("7MUCAAAG7NV022177", {
      mileage: 42000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection).toEqual({
      year: "2021",
      make: "Kia",
      model: "Sorento",
      style: "SX",
    });
    expect(mockedPostMmrVin).toHaveBeenCalledWith({
      vin: "7MUCAAAG7NV022177",
      mileage: 42000,
    });
  });

  it("returns an error without wiping identity when Cox lookup fails", async () => {
    mockedPostMmrVin.mockResolvedValue({
      ok: false,
      kind: "unavailable",
      error: "no_mmr_value",
      status: 200,
      message: "No MMR value available for this VIN.",
    });

    const result = await decodeVinToVehicleSelection("7MUCAAAG7NV022177");

    expect(result).toEqual({
      ok: false,
      error: "No MMR value available for this VIN.",
    });
    expect(mockedMakes).not.toHaveBeenCalled();
  });

  it("returns an error when Cox identity cannot match the catalog", async () => {
    mockedPostMmrVin.mockResolvedValue(
      mmrOk({ make: "UnknownMake", model: "UnknownModel" }),
    );

    const result = await decodeVinToVehicleSelection("7MUCAAAG7NV022177", {
      catalogYears: ["2021", "2020"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/could not match Cox catalog/i);
  });

  it("rejects too-short VINs without calling the API", async () => {
    const result = await decodeVinToVehicleSelection("SHORT");
    expect(result.ok).toBe(false);
    expect(mockedPostMmrVin).not.toHaveBeenCalled();
  });
});

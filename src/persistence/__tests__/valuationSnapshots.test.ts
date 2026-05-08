import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeValuationSnapshot } from "../valuationSnapshots";
import type { SupabaseClient } from "../supabase";
import type { ValuationResult } from "../../types/domain";

// Builder mock: schema("tav").from(...).insert(...) resolves to { error }
function makeDb(error: unknown = null): { db: SupabaseClient; insertSpy: ReturnType<typeof vi.fn> } {
  const insertSpy = vi.fn().mockResolvedValue({ error });
  const db = {
    schema: vi.fn(() => ({ from: vi.fn(() => ({ insert: insertSpy })) })),
  } as unknown as SupabaseClient;
  return { db, insertSpy };
}

const BASE_LISTING = {
  vin: "1HGCM82633A123456",
  year: 2020 as const,
  make: "Honda",
  model: "Civic",
  mileage: 55_000,
};

const VIN_VALUATION: ValuationResult = {
  mmrValue:       14_000,
  wholesaleAvg:   14_000,
  wholesaleClean: null,
  wholesaleRough: null,
  retailClean:    null,
  sampleCount:    null,
  confidence:     "high",
  valuationMethod: "vin",
  fetchedAt:      "2026-05-08T14:00:00.000Z",
  rawResponse:    { raw: true },
};

const YMM_VALUATION: ValuationResult = {
  mmrValue:       12_500,
  wholesaleAvg:   12_500,
  wholesaleClean: null,
  wholesaleRough: null,
  retailClean:    null,
  sampleCount:    null,
  confidence:     "medium",
  valuationMethod: "year_make_model",
  fetchedAt:      "2026-05-08T14:00:00.000Z",
  rawResponse:    {},
};

const BASE_INPUT = {
  normalizedListingId: "nl-uuid-1",
  vehicleCandidateId:  "vc-uuid-1",
  listing: BASE_LISTING,
};

describe("writeValuationSnapshot — confidence and valuation_method", () => {
  it("writes confidence='high' and valuation_method='vin' for a VIN-path result", async () => {
    const { db, insertSpy } = makeDb();

    await writeValuationSnapshot(db, { ...BASE_INPUT, valuation: VIN_VALUATION });

    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.confidence).toBe("high");
    expect(payload.valuation_method).toBe("vin");
  });

  it("writes confidence='medium' and valuation_method='year_make_model' for a YMM-path result", async () => {
    const { db, insertSpy } = makeDb();

    await writeValuationSnapshot(db, { ...BASE_INPUT, valuation: YMM_VALUATION });

    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.confidence).toBe("medium");
    expect(payload.valuation_method).toBe("year_make_model");
  });
});

describe("writeValuationSnapshot — distribution columns", () => {
  it("writes wholesaleAvg and null distribution fields", async () => {
    const { db, insertSpy } = makeDb();

    await writeValuationSnapshot(db, { ...BASE_INPUT, valuation: VIN_VALUATION });

    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.mmr_wholesale_avg).toBe(14_000);
    expect(payload.mmr_wholesale_clean).toBeNull();
    expect(payload.mmr_wholesale_rough).toBeNull();
    expect(payload.mmr_retail_clean).toBeNull();
    expect(payload.mmr_sample_count).toBeNull();
  });

  it("writes all distribution fields when populated", async () => {
    const { db, insertSpy } = makeDb();
    const richValuation: ValuationResult = {
      ...VIN_VALUATION,
      wholesaleClean: 15_200,
      wholesaleRough: 12_800,
      retailClean:    17_500,
      sampleCount:    42,
    };

    await writeValuationSnapshot(db, { ...BASE_INPUT, valuation: richValuation });

    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.mmr_wholesale_clean).toBe(15_200);
    expect(payload.mmr_wholesale_rough).toBe(12_800);
    expect(payload.mmr_retail_clean).toBe(17_500);
    expect(payload.mmr_sample_count).toBe(42);
  });
});

describe("writeValuationSnapshot — core fields", () => {
  it("includes all required columns in the insert payload", async () => {
    const { db, insertSpy } = makeDb();

    await writeValuationSnapshot(db, { ...BASE_INPUT, valuation: VIN_VALUATION });

    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.normalized_listing_id).toBe("nl-uuid-1");
    expect(payload.vehicle_candidate_id).toBe("vc-uuid-1");
    expect(payload.mmr_value).toBe(14_000);
    expect(payload.vin).toBe("1HGCM82633A123456");
    expect(payload.year).toBe(2020);
    expect(payload.make).toBe("Honda");
    expect(payload.model).toBe("Civic");
    expect(payload.mileage).toBe(55_000);
    expect(payload.fetched_at).toBe("2026-05-08T14:00:00.000Z");
    expect(payload.raw_response).toEqual({ raw: true });
  });

  it("sets vehicle_candidate_id to null when not provided", async () => {
    const { db, insertSpy } = makeDb();

    await writeValuationSnapshot(db, { normalizedListingId: "nl-2", listing: BASE_LISTING, valuation: YMM_VALUATION });

    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.vehicle_candidate_id).toBeNull();
  });
});

describe("writeValuationSnapshot — error handling", () => {
  it("throws when Supabase returns an error", async () => {
    const dbError = { code: "23514", message: "check constraint violation" };
    const { db } = makeDb(dbError);

    await expect(writeValuationSnapshot(db, { ...BASE_INPUT, valuation: VIN_VALUATION })).rejects.toEqual(dbError);
  });
});

describe("writeValuationSnapshot — normalization columns", () => {
  it("includes lookup_make, lookup_model, lookup_trim, normalization_confidence when present", async () => {
    const { db, insertSpy } = makeDb();
    const ymmWithNorm: typeof YMM_VALUATION = {
      ...YMM_VALUATION,
      lookupMake:              "Toyota",
      lookupModel:             "Camry",
      lookupTrim:              "SE",
      normalizationConfidence: "exact",
    };

    await writeValuationSnapshot(db, { ...BASE_INPUT, valuation: ymmWithNorm });

    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.lookup_make).toBe("Toyota");
    expect(payload.lookup_model).toBe("Camry");
    expect(payload.lookup_trim).toBe("SE");
    expect(payload.normalization_confidence).toBe("exact");
  });

  it("nulls lookup fields when absent (VIN path)", async () => {
    const { db, insertSpy } = makeDb();

    await writeValuationSnapshot(db, { ...BASE_INPUT, valuation: VIN_VALUATION });

    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.lookup_make).toBeNull();
    expect(payload.lookup_model).toBeNull();
    expect(payload.lookup_trim).toBeNull();
    expect(payload.normalization_confidence).toBeNull();
  });

  it("nulls lookup_model and sets normalization_confidence 'partial' for partial resolution", async () => {
    const { db, insertSpy } = makeDb();
    const partialNorm: typeof YMM_VALUATION = {
      ...YMM_VALUATION,
      lookupMake:              "Toyota",
      lookupModel:             null,
      lookupTrim:              null,
      normalizationConfidence: "partial",
    };

    await writeValuationSnapshot(db, { ...BASE_INPUT, valuation: partialNorm });

    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.lookup_make).toBe("Toyota");
    expect(payload.lookup_model).toBeNull();
    expect(payload.normalization_confidence).toBe("partial");
  });
});

describe("schema.sql integrity", () => {
  const schemaPath = resolve(__dirname, "../../../supabase/schema.sql");
  const schemaContent = readFileSync(schemaPath, "utf-8");

  it("contains the valuation_method column definition", () => {
    expect(schemaContent).toContain("valuation_method");
    expect(schemaContent).toContain("CHECK (valuation_method IN ('vin','year_make_model'))");
  });

  it("does not contain the dropped method column", () => {
    expect(schemaContent).not.toMatch(/^\s+method\s+text\s+NOT NULL/m);
    expect(schemaContent).not.toContain("CHECK (method IN ('vin','ymm'))");
  });
});

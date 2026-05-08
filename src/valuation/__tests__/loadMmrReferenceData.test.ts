import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "../../persistence/supabase";
import { EMPTY_REFERENCE } from "../normalizeMmrParams";
import { loadMmrReferenceData, resetReferenceDataCache } from "../loadMmrReferenceData";

// ── DB mock factory ────────────────────────────────────────────────────────────
// Simulates db.schema("tav").from(table).select("*") → Promise<{ data, error }>

function makeDb(tables: Record<string, unknown[] | null>, forceError?: unknown) {
  const schemaSpy = vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn(() =>
        Promise.resolve(
          forceError
            ? { data: null, error: forceError }
            : { data: tables[table] ?? [], error: null },
        ),
      ),
    })),
  }));
  const db = { schema: schemaSpy } as unknown as SupabaseClient;
  return { db, schemaSpy };
}

const STUB_MAKES = [
  { make: "Chevrolet", display_name: "Chevrolet" },
  { make: "Honda",     display_name: "Honda" },
];

const STUB_MODELS = [
  { make: "Chevrolet", model: "Malibu" },
  { make: "Chevrolet", model: "Silverado 1500" },
  { make: "Honda",     model: "Civic" },
];

const STUB_MAKE_ALIASES = [
  { alias: "chevy",  canonical_make: "Chevrolet" },
  { alias: "Chevy",  canonical_make: "Chevrolet" }, // mixed-case from DB
];

const STUB_MODEL_ALIASES = [
  { alias: "crv",     canonical_make: "Honda", canonical_model: "CR-V" },
  { alias: "CRV",     canonical_make: "Honda", canonical_model: "CR-V" }, // mixed-case from DB
];

beforeEach(() => {
  resetReferenceDataCache();
  vi.clearAllMocks();
});

// ── Successful load ────────────────────────────────────────────────────────────

describe("loadMmrReferenceData — successful load", () => {
  it("builds makes Set from mmr_reference_makes rows", async () => {
    const { db } = makeDb({
      mmr_reference_makes:  STUB_MAKES,
      mmr_reference_models: STUB_MODELS,
      mmr_make_aliases:     STUB_MAKE_ALIASES,
      mmr_model_aliases:    STUB_MODEL_ALIASES,
    });

    const ref = await loadMmrReferenceData(db);

    expect(ref.makes.has("Chevrolet")).toBe(true);
    expect(ref.makes.has("Honda")).toBe(true);
    expect(ref.makes.size).toBe(2);
  });

  it("builds models Map keyed by canonical make", async () => {
    const { db } = makeDb({
      mmr_reference_makes:  STUB_MAKES,
      mmr_reference_models: STUB_MODELS,
      mmr_make_aliases:     [],
      mmr_model_aliases:    [],
    });

    const ref = await loadMmrReferenceData(db);

    expect(ref.models.get("Chevrolet")?.has("Malibu")).toBe(true);
    expect(ref.models.get("Chevrolet")?.has("Silverado 1500")).toBe(true);
    expect(ref.models.get("Chevrolet")?.size).toBe(2);
    expect(ref.models.get("Honda")?.has("Civic")).toBe(true);
  });

  it("lowercases make alias keys regardless of DB casing", async () => {
    const { db } = makeDb({
      mmr_reference_makes:  STUB_MAKES,
      mmr_reference_models: [],
      mmr_make_aliases:     STUB_MAKE_ALIASES, // includes "Chevy" uppercase
      mmr_model_aliases:    [],
    });

    const ref = await loadMmrReferenceData(db);

    // Both "chevy" and "Chevy" from DB should be stored as "chevy"
    // (last write wins since they're the same canonical target)
    expect(ref.makeAliases.get("chevy")).toBe("Chevrolet");
    // uppercase variant from DB should also be accessible as lowercase
    expect(ref.makeAliases.has("Chevy")).toBe(false);
  });

  it("lowercases model alias keys regardless of DB casing", async () => {
    const { db } = makeDb({
      mmr_reference_makes:  STUB_MAKES,
      mmr_reference_models: [{ make: "Honda", model: "CR-V" }],
      mmr_make_aliases:     [],
      mmr_model_aliases:    STUB_MODEL_ALIASES, // includes "CRV" uppercase
    });

    const ref = await loadMmrReferenceData(db);

    // Both "crv" and "CRV" from DB become lowercase key "crv"
    expect(ref.modelAliases.get("Honda")?.get("crv")).toBe("CR-V");
    expect(ref.modelAliases.get("Honda")?.has("CRV")).toBe(false);
  });

  it("builds modelAliases nested Map: canonical_make → alias → canonical_model", async () => {
    const { db } = makeDb({
      mmr_reference_makes:  STUB_MAKES,
      mmr_reference_models: [{ make: "Honda", model: "CR-V" }],
      mmr_make_aliases:     [],
      mmr_model_aliases:    [{ alias: "crv", canonical_make: "Honda", canonical_model: "CR-V" }],
    });

    const ref = await loadMmrReferenceData(db);

    expect(ref.modelAliases.get("Honda")?.get("crv")).toBe("CR-V");
  });

  it("queries all four tables via db.schema('tav')", async () => {
    const { db, schemaSpy } = makeDb({
      mmr_reference_makes:  STUB_MAKES,
      mmr_reference_models: STUB_MODELS,
      mmr_make_aliases:     [],
      mmr_model_aliases:    [],
    });

    await loadMmrReferenceData(db);

    expect(schemaSpy).toHaveBeenCalledWith("tav");
    expect(schemaSpy).toHaveBeenCalledTimes(4);
  });
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe("loadMmrReferenceData — error handling", () => {
  it("returns EMPTY_REFERENCE and does not throw when Supabase returns an error", async () => {
    const { db } = makeDb({}, { code: "PGRST", message: "table not found" });

    const ref = await loadMmrReferenceData(db);

    expect(ref).toBe(EMPTY_REFERENCE);
  });

  it("returns EMPTY_REFERENCE and does not throw when fetch rejects", async () => {
    const db = {
      schema: vi.fn(() => { throw new Error("connection refused"); }),
    } as unknown as SupabaseClient;

    const ref = await loadMmrReferenceData(db);

    expect(ref).toBe(EMPTY_REFERENCE);
  });

  it("returns EMPTY_REFERENCE with empty makes when makes table returns error", async () => {
    // Only one table erroring causes the whole load to degrade
    const schemaSpy = vi.fn((_schemaName: string) => ({
      from: vi.fn((table: string) => ({
        select: vi.fn(() =>
          Promise.resolve(
            table === "mmr_reference_makes"
              ? { data: null, error: { code: "42P01", message: "relation does not exist" } }
              : { data: [], error: null },
          ),
        ),
      })),
    }));
    const db = { schema: schemaSpy } as unknown as SupabaseClient;

    const ref = await loadMmrReferenceData(db);

    expect(ref).toBe(EMPTY_REFERENCE);
  });
});

// ── Module-level TTL cache ─────────────────────────────────────────────────────

describe("loadMmrReferenceData — cache", () => {
  it("returns cached result on second call within TTL (db queried only once)", async () => {
    const { db, schemaSpy } = makeDb({
      mmr_reference_makes:  STUB_MAKES,
      mmr_reference_models: STUB_MODELS,
      mmr_make_aliases:     [],
      mmr_model_aliases:    [],
    });

    const first  = await loadMmrReferenceData(db);
    const second = await loadMmrReferenceData(db);

    // Same object identity proves cache was hit
    expect(second).toBe(first);
    // DB was only queried once (4 schema() calls for the first load, none for second)
    expect(schemaSpy).toHaveBeenCalledTimes(4);
  });

  it("reloads after cache is reset", async () => {
    const { db, schemaSpy } = makeDb({
      mmr_reference_makes:  STUB_MAKES,
      mmr_reference_models: [],
      mmr_make_aliases:     [],
      mmr_model_aliases:    [],
    });

    await loadMmrReferenceData(db);   // first load — 4 schema calls
    resetReferenceDataCache();
    await loadMmrReferenceData(db);   // second load after reset — 4 more schema calls

    expect(schemaSpy).toHaveBeenCalledTimes(8);
  });

  it("does not cache a failed load (error result not stored)", async () => {
    const { db: errDb } = makeDb({}, { code: "err", message: "fail" });

    await loadMmrReferenceData(errDb); // fails → EMPTY_REFERENCE, not cached

    // Now call with a good db — should reload rather than return cached EMPTY_REFERENCE
    const { db: goodDb, schemaSpy: goodSpy } = makeDb({
      mmr_reference_makes:  STUB_MAKES,
      mmr_reference_models: [],
      mmr_make_aliases:     [],
      mmr_model_aliases:    [],
    });

    const ref = await loadMmrReferenceData(goodDb);

    expect(ref.makes.has("Chevrolet")).toBe(true);
    expect(goodSpy).toHaveBeenCalledTimes(4);
  });
});

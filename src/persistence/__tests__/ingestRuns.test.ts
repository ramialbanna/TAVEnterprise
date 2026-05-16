import { describe, it, expect, vi } from "vitest";
import {
  countByKey,
  buildListingDiagnostics,
  listSourceRuns,
  getSourceRunDetail,
} from "../ingestRuns";
import type { SupabaseClient } from "../supabase";

describe("countByKey", () => {
  it("tallies occurrences of a key", () => {
    const rows = [
      { reason_code: "missing_identifier" },
      { reason_code: "missing_identifier" },
      { reason_code: "stale_listing" },
    ];
    expect(countByKey(rows, "reason_code")).toEqual({
      missing_identifier: 2,
      stale_listing: 1,
    });
  });

  it("skips rows whose key is null or undefined", () => {
    const rows = [{ event_type: "wrong_type" }, { event_type: null }, {}];
    expect(countByKey(rows, "event_type")).toEqual({ wrong_type: 1 });
  });

  it("returns an empty object for no rows", () => {
    expect(countByKey([], "x")).toEqual({});
  });
});

// ── chained-builder mock ──────────────────────────────────────────────────────
// Each terminal (await / maybeSingle) resolves the scripted result for the table.
function makeDb(script: Record<string, { data?: unknown; count?: number; error?: unknown }>) {
  const seen: string[] = [];
  function builder(table: string) {
    const result = script[table] ?? { data: [], count: 0 };
    const resolved = {
      data: result.error ? null : result.data ?? [],
      count: result.error ? null : result.count ?? 0,
      error: result.error ?? null,
    };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "eq", "not", "in"]) {
      b[m] = vi.fn(() => b);
    }
    b.maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: result.error ? null : (result.data ?? null),
        error: result.error ?? null,
      }),
    );
    b.then = (resolve: (v: unknown) => unknown) => resolve(resolved);
    return b;
  }
  const db = {
    from: vi.fn((t: string) => {
      seen.push(t);
      return builder(t);
    }),
  } as unknown as SupabaseClient;
  return { db, seen };
}

const RUN = {
  id: "11111111-1111-1111-1111-111111111111",
  source: "facebook",
  run_id: "4NyscgfxEA39sJcIY",
  region: "dallas_tx",
  status: "completed",
  item_count: 4,
  processed: 3,
  rejected: 1,
  created_leads: 0,
  scraped_at: "2026-05-16T20:11:42.247Z",
  created_at: "2026-05-16T20:11:49.596Z",
  error_message: null,
};

describe("listSourceRuns", () => {
  it("returns rows from source_runs", async () => {
    const { db } = makeDb({ source_runs: { data: [RUN] } });
    const rows = await listSourceRuns(db, { limit: 20 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.run_id).toBe("4NyscgfxEA39sJcIY");
  });

  it("throws when the query errors", async () => {
    const { db } = makeDb({ source_runs: { error: { message: "boom" } } });
    await expect(listSourceRuns(db, { limit: 20 })).rejects.toBeTruthy();
  });
});

describe("getSourceRunDetail", () => {
  it("returns null when the run does not exist", async () => {
    const { db } = makeDb({ source_runs: { data: null } });
    expect(await getSourceRunDetail(db, "missing")).toBeNull();
  });

  it("assembles summary + diagnostic aggregates", async () => {
    const { db } = makeDb({
      source_runs: { data: RUN },
      raw_listings: { count: 4 },
      normalized_listings: { count: 3 },
      filtered_out: { data: [{ reason_code: "missing_identifier" }, { reason_code: "missing_identifier" }] },
      schema_drift_events: { data: [{ event_type: "unexpected_field" }] },
      valuation_snapshots: { data: [{ missing_reason: "trim_missing" }] },
      leads: { data: [{ id: "lead-1" }, { id: "lead-2" }] },
    });
    const detail = await getSourceRunDetail(db, RUN.id);
    expect(detail).not.toBeNull();
    expect(detail!.run.run_id).toBe("4NyscgfxEA39sJcIY");
    expect(detail!.rawListingCount).toBe(4);
    expect(detail!.normalizedListingCount).toBe(3);
    expect(detail!.filteredOutByReason).toEqual({ missing_identifier: 2 });
    expect(detail!.schemaDriftByType).toEqual({ unexpected_field: 1 });
    expect(detail!.valuationMissByReason).toEqual({ trim_missing: 1 });
    expect(detail!.createdLeadCount).toBe(2);
    expect(detail!.createdLeadIds).toEqual(["lead-1", "lead-2"]);
    // No normalized rows scripted → empty per-listing diagnostics.
    expect(detail!.listings).toEqual([]);
  });

  it("returns per-listing diagnostics joined to valuation + lead", async () => {
    const { db } = makeDb({
      source_runs: { data: RUN },
      raw_listings: { count: 2 },
      normalized_listings: {
        count: 2,
        data: [
          {
            id: "nl_hit",
            title: "2020 Toyota Camry SE",
            listing_url: "https://fb.com/1",
            year: 2020,
            make: "Toyota",
            model: "Camry",
            trim: "SE",
            price: 18500,
            mileage: 62000,
            vin: "VIN_HIT",
          },
          {
            id: "nl_miss",
            title: "2019 Honda Civic",
            listing_url: "https://fb.com/2",
            year: 2019,
            make: "Honda",
            model: "Civic",
            trim: null,
            price: 16000,
            mileage: null,
            vin: null,
          },
        ],
      },
      filtered_out: { data: [] },
      schema_drift_events: { data: [] },
      valuation_snapshots: {
        data: [
          { normalized_listing_id: "nl_hit", mmr_value: 19000, missing_reason: null, vehicle_candidate_id: "vc_1", fetched_at: "2026-05-16T20:00:00Z" },
          { normalized_listing_id: "nl_hit", mmr_value: 19500, missing_reason: null, vehicle_candidate_id: "vc_1", fetched_at: "2026-05-16T21:00:00Z" },
          { normalized_listing_id: "nl_miss", mmr_value: null, missing_reason: "trim_missing", vehicle_candidate_id: null, fetched_at: "2026-05-16T20:30:00Z" },
        ],
      },
      leads: {
        data: [
          { id: "lead_hit", normalized_listing_id: "nl_hit", vehicle_candidate_id: "vc_1", grade: "good", final_score: 78, score_components: { deal: 40 } },
        ],
      },
    });
    const detail = await getSourceRunDetail(db, RUN.id);
    expect(detail!.listings).toHaveLength(2);

    const hit = detail!.listings.find((l) => l.normalized_listing_id === "nl_hit")!;
    expect(hit.valuation_status).toBe("hit");
    expect(hit.mmr_value).toBe(19500); // latest snapshot by fetched_at
    expect(hit.valuation_missing_reason).toBeNull();
    expect(hit.lead_id).toBe("lead_hit");
    expect(hit.lead_grade).toBe("good");
    expect(hit.lead_final_score).toBe(78);
    expect(hit.vehicle_candidate_id).toBe("vc_1");

    const miss = detail!.listings.find((l) => l.normalized_listing_id === "nl_miss")!;
    expect(miss.valuation_status).toBe("miss");
    expect(miss.valuation_missing_reason).toBe("trim_missing");
    expect(miss.mmr_value).toBeNull();
    expect(miss.lead_id).toBeNull();
  });
});

describe("buildListingDiagnostics", () => {
  it("marks a listing with no valuation and no lead as status null", () => {
    const out = buildListingDiagnostics(
      [{ id: "nl1", title: "T", listing_url: null, year: null, make: null, model: null, trim: null, price: null, mileage: null, vin: null }],
      [],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.valuation_status).toBeNull();
    expect(out[0]!.lead_id).toBeNull();
    expect(out[0]!.vehicle_candidate_id).toBeNull();
  });

  it("prefers the lead's vehicle_candidate_id over the valuation's", () => {
    const out = buildListingDiagnostics(
      [{ id: "nl1" }],
      [{ normalized_listing_id: "nl1", mmr_value: 100, missing_reason: null, vehicle_candidate_id: "vc_val", fetched_at: "2026-01-01T00:00:00Z" }],
      [{ id: "L1", normalized_listing_id: "nl1", vehicle_candidate_id: "vc_lead", grade: "fair", final_score: 50, score_components: null }],
    );
    expect(out[0]!.vehicle_candidate_id).toBe("vc_lead");
    expect(out[0]!.valuation_status).toBe("hit");
  });
});

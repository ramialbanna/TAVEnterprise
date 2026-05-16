import { describe, it, expect, vi } from "vitest";
import {
  countByKey,
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
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { getSupabaseClient } from "../src/persistence/supabase";
import { upsertSourceRun, completeSourceRun } from "../src/persistence/sourceRuns";
import { insertRawListing } from "../src/persistence/rawListings";
import type { Env } from "../src/types/env";

// Skipped unless explicitly enabled. These tests mutate a live Supabase DB, so
// a local .dev.vars file alone must not opt the suite into network I/O.
const RUN_INTEGRATION = process.env.RUN_SUPABASE_INTEGRATION_TESTS === "true";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SKIP =
  !RUN_INTEGRATION ||
  !SUPABASE_URL ||
  SUPABASE_URL.includes("your-project") ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  SUPABASE_SERVICE_ROLE_KEY === "replace_me";

// Wrap in if(!SKIP) so getSupabaseClient is never called during collection
// when credentials are absent — describe.skipIf still runs the factory callback.
if (!SKIP) {
const env = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} as unknown as Env;

const TEST_SOURCE = "facebook" as const;
const TEST_REGION = "dallas_tx" as const;
const TEST_RUN_ID = `int-test-${Date.now()}`;

describe("persistence — source_run + raw_listing", () => {
  const db = getSupabaseClient(env);
  const createdRunIds: string[] = [];

  afterEach(async () => {
    // Clean up test rows so reruns stay idempotent.
    for (const id of createdRunIds) {
      await db.from("raw_listings").delete().eq("source_run_id", id);
      await db.from("source_runs").delete().eq("id", id);
    }
    createdRunIds.length = 0;
  });

  it("inserts a new source_run with status=running", async () => {
    const run = await upsertSourceRun(db, {
      source: TEST_SOURCE,
      run_id: TEST_RUN_ID,
      region: TEST_REGION,
      scraped_at: new Date().toISOString(),
      item_count: 3,
    });

    createdRunIds.push(run.id);
    expect(run.id).toBeTruthy();
    expect(run.status).toBe("running");
    expect(run.processed).toBe(0);
    expect(run.rejected).toBe(0);
    expect(run.created_leads).toBe(0);
  });

  it("returns status=running when the same run is upserted again before completion", async () => {
    const first = await upsertSourceRun(db, {
      source: TEST_SOURCE,
      run_id: `${TEST_RUN_ID}-b`,
      region: TEST_REGION,
      scraped_at: new Date().toISOString(),
      item_count: 1,
    });
    createdRunIds.push(first.id);

    const second = await upsertSourceRun(db, {
      source: TEST_SOURCE,
      run_id: `${TEST_RUN_ID}-b`,
      region: TEST_REGION,
      scraped_at: new Date().toISOString(),
      item_count: 1,
    });

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("running");
  });

  it("completes a run and returns stored counters on replay", async () => {
    const run = await upsertSourceRun(db, {
      source: TEST_SOURCE,
      run_id: `${TEST_RUN_ID}-c`,
      region: TEST_REGION,
      scraped_at: new Date().toISOString(),
      item_count: 5,
    });
    createdRunIds.push(run.id);

    await completeSourceRun(db, run.id, { processed: 4, rejected: 1, created_leads: 2 });

    // Replay — must return stored counters without reprocessing.
    const replayed = await upsertSourceRun(db, {
      source: TEST_SOURCE,
      run_id: `${TEST_RUN_ID}-c`,
      region: TEST_REGION,
      scraped_at: new Date().toISOString(),
      item_count: 5,
    });

    expect(replayed.status).toBe("completed");
    expect(replayed.processed).toBe(4);
    expect(replayed.rejected).toBe(1);
    expect(replayed.created_leads).toBe(2);
  });

  it("inserts a raw_listing linked to a source_run", async () => {
    const run = await upsertSourceRun(db, {
      source: TEST_SOURCE,
      run_id: `${TEST_RUN_ID}-d`,
      region: TEST_REGION,
      scraped_at: new Date().toISOString(),
      item_count: 1,
    });
    createdRunIds.push(run.id);

    const raw = await insertRawListing(db, {
      source: TEST_SOURCE,
      source_run_id: run.id,
      raw_item: { title: "2019 Honda Accord", price: "$18,000" },
      received_at: new Date().toISOString(),
    });

    expect(raw.id).toBeTruthy();
  });
});
}

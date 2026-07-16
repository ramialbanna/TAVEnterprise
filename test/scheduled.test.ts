import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../src/types/env";

// scheduled() builds a Supabase client, runs the sweep, then records the run.
// Mock all three collaborators so this is a pure control-flow test (no timers,
// no DB, no real RPC).
vi.mock("../src/persistence/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({ __fake: "db" })),
}));
vi.mock("../src/stale/engine", () => ({
  runStaleSweep: vi.fn(),
}));
vi.mock("../src/catalog/syncCoxCatalogTree", () => ({
  runCoxCatalogSync: vi.fn(),
}));
vi.mock("../src/persistence/cronRuns", () => ({
  recordCronRunSafe: vi.fn().mockResolvedValue(undefined),
  recordCronRun: vi.fn(),
  getLastCronRun: vi.fn(),
}));

import worker from "../src/index";
import { runStaleSweep } from "../src/stale/engine";
import { runCoxCatalogSync } from "../src/catalog/syncCoxCatalogTree";
import { recordCronRunSafe } from "../src/persistence/cronRuns";

const env = {} as unknown as Env;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const event = {} as ScheduledEvent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordCronRunSafe).mockResolvedValue(undefined);
});

describe("scheduled() — daily cron jobs", () => {
  it("records ok cron runs for stale sweep and catalog sync on success", async () => {
    vi.mocked(runStaleSweep).mockResolvedValue({ updated: 9 });
    vi.mocked(runCoxCatalogSync).mockResolvedValue({
      runId: "run-1",
      status: "completed",
      yearsSynced: [2020],
      rowCount: 100,
    });

    await worker.scheduled(event, env, ctx);

    expect(vi.mocked(runStaleSweep)).toHaveBeenCalledOnce();
    expect(vi.mocked(runCoxCatalogSync)).toHaveBeenCalledWith(
      env,
      expect.anything(),
      { mode: "missing" },
    );
    expect(vi.mocked(recordCronRunSafe)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(recordCronRunSafe)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobName: "stale_sweep",
        status: "ok",
        detail: { updated: 9 },
      }),
    );
    expect(vi.mocked(recordCronRunSafe)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobName: "cox_catalog_sync",
        status: "ok",
        detail: expect.objectContaining({ rowCount: 100 }),
      }),
    );
  });

  it("records a failed stale sweep and rethrows without running catalog sync", async () => {
    const boom = new Error("run_stale_sweep rpc exploded");
    vi.mocked(runStaleSweep).mockRejectedValue(boom);

    await expect(worker.scheduled(event, env, ctx)).rejects.toBe(boom);

    expect(vi.mocked(runCoxCatalogSync)).not.toHaveBeenCalled();
    expect(vi.mocked(recordCronRunSafe)).toHaveBeenCalledOnce();
    expect(vi.mocked(recordCronRunSafe)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobName: "stale_sweep",
        status: "failed",
        detail: expect.objectContaining({ error: expect.anything() }),
      }),
    );
  });

  it("records catalog sync failure without failing the stale sweep cron", async () => {
    vi.mocked(runStaleSweep).mockResolvedValue({ updated: 2 });
    vi.mocked(runCoxCatalogSync).mockRejectedValue(new Error("catalog timeout"));

    await worker.scheduled(event, env, ctx);

    expect(vi.mocked(recordCronRunSafe)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(recordCronRunSafe)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobName: "cox_catalog_sync",
        status: "failed",
      }),
    );
  });
});

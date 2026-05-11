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
vi.mock("../src/persistence/cronRuns", () => ({
  recordCronRunSafe: vi.fn().mockResolvedValue(undefined),
  recordCronRun: vi.fn(),
  getLastCronRun: vi.fn(),
}));

import worker from "../src/index";
import { runStaleSweep } from "../src/stale/engine";
import { recordCronRunSafe } from "../src/persistence/cronRuns";

const env = {} as unknown as Env;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const event = {} as ScheduledEvent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordCronRunSafe).mockResolvedValue(undefined);
});

describe("scheduled() — daily stale sweep audit", () => {
  it("records an 'ok' cron run with the updated count on success", async () => {
    vi.mocked(runStaleSweep).mockResolvedValue({ updated: 9 });

    await worker.scheduled(event, env, ctx);

    expect(vi.mocked(runStaleSweep)).toHaveBeenCalledOnce();
    expect(vi.mocked(recordCronRunSafe)).toHaveBeenCalledOnce();
    expect(vi.mocked(recordCronRunSafe)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobName: "stale_sweep",
        status: "ok",
        detail: { updated: 9 },
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
      }),
    );
  });

  it("records a 'failed' cron run (with an error detail) and rethrows when the sweep throws", async () => {
    const boom = new Error("run_stale_sweep rpc exploded");
    vi.mocked(runStaleSweep).mockRejectedValue(boom);

    await expect(worker.scheduled(event, env, ctx)).rejects.toBe(boom);

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
});

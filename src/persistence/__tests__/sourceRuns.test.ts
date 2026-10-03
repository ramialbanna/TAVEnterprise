import { describe, it, expect, vi } from "vitest";
import {
  STALE_SOURCE_RUN_ERROR,
  closeStaleSourceRuns,
  completeSourceRun,
  completeSourceRunSafe,
  isTerminalSourceRunStatus,
  upsertSourceRun,
} from "../sourceRuns";
import type { SupabaseClient } from "../supabase";

function makeDb(error: unknown = null): { db: SupabaseClient; updateSpy: ReturnType<typeof vi.fn> } {
  const updateSpy = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error }),
  }));
  const db = {
    from: vi.fn(() => ({ update: updateSpy })),
  } as unknown as SupabaseClient;
  return { db, updateSpy };
}

describe("isTerminalSourceRunStatus", () => {
  it("treats completed, truncated, and failed as terminal", () => {
    expect(isTerminalSourceRunStatus("completed")).toBe(true);
    expect(isTerminalSourceRunStatus("truncated")).toBe(true);
    expect(isTerminalSourceRunStatus("failed")).toBe(true);
    expect(isTerminalSourceRunStatus("running")).toBe(false);
  });
});

function makeUpsertDb(existing: Record<string, unknown> | null): {
  db: SupabaseClient;
  upsertSpy: ReturnType<typeof vi.fn>;
  updateSpy: ReturnType<typeof vi.fn>;
} {
  const upsertSpy = vi.fn();
  const updateSpy = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
  const selectChain = {
    eq: vi.fn(() => selectChain),
    maybeSingle,
  };
  const db = {
    from: vi.fn(() => ({
      select: vi.fn(() => selectChain),
      upsert: upsertSpy,
      update: updateSpy,
    })),
  } as unknown as SupabaseClient;
  return { db, upsertSpy, updateSpy };
}

describe("upsertSourceRun — terminal statuses stay closed", () => {
  const params = {
    source: "facebook" as const,
    run_id: "retry-1",
    region: "dallas_tx",
    scraped_at: "2026-09-07T15:00:00.000Z",
    item_count: 20,
  };

  it.each(["completed", "truncated", "failed"] as const)(
    "returns the stored %s row and does not upsert back to running",
    async (status) => {
      const existing = {
        id: "run-closed",
        status,
        processed: 12,
        rejected: 3,
        created_leads: 1,
      };
      const { db, upsertSpy } = makeUpsertDb(existing);
      const run = await upsertSourceRun(db, params);
      expect(run).toEqual(existing);
      expect(upsertSpy).not.toHaveBeenCalled();
    },
  );

  it("closes a running row older than 30 minutes instead of reopening it", async () => {
    const { db, upsertSpy, updateSpy } = makeUpsertDb({
      id: "run-stale",
      status: "running",
      processed: 4,
      rejected: 1,
      created_leads: 0,
      created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    });
    const run = await upsertSourceRun(db, params);
    expect(run.status).toBe("completed");
    expect(run.processed).toBe(4);
    expect(upsertSpy).not.toHaveBeenCalled();
    const payload = updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.status).toBe("completed");
    expect(payload.error_message).toBe(STALE_SOURCE_RUN_ERROR);
  });

  it("upserts a still-running row", async () => {
    const { db, upsertSpy } = makeUpsertDb({
      id: "run-open",
      status: "running",
      processed: 0,
      rejected: 0,
      created_leads: 0,
      created_at: new Date().toISOString(),
    });
    upsertSpy.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: "run-open", status: "running", processed: 0, rejected: 0, created_leads: 0 },
          error: null,
        }),
      })),
    });
    const run = await upsertSourceRun(db, params);
    expect(run.status).toBe("running");
    expect(upsertSpy).toHaveBeenCalledOnce();
  });
});

describe("closeStaleSourceRuns", () => {
  it("marks running rows older than the cutoff completed", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: "a" }, { id: "b" }], error: null });
    const lt = vi.fn(() => ({ select }));
    const eq = vi.fn(() => ({ lt }));
    const update = vi.fn(() => ({ eq }));
    const db = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;

    const result = await closeStaleSourceRuns(db, Date.parse("2026-09-22T16:00:00.000Z"));

    expect(result).toEqual({ closed: 2 });
    expect(update).toHaveBeenCalledWith({
      status: "completed",
      error_message: STALE_SOURCE_RUN_ERROR,
    });
    expect(eq).toHaveBeenCalledWith("status", "running");
    expect(lt).toHaveBeenCalledWith("created_at", "2026-09-22T15:30:00.000Z");
  });
});

describe("completeSourceRun — status + error_message", () => {
  it("defaults to status='completed' and error_message=null when caller omits them", async () => {
    const { db, updateSpy } = makeDb();
    await completeSourceRun(db, "run-1", { processed: 5, rejected: 2, created_leads: 1 });
    const payload = updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.status).toBe("completed");
    expect(payload.error_message).toBeNull();
    expect(payload.processed).toBe(5);
    expect(payload.rejected).toBe(2);
    expect(payload.created_leads).toBe(1);
  });

  it("writes status='truncated' with error_message when supplied", async () => {
    const { db, updateSpy } = makeDb();
    await completeSourceRun(db, "run-2", {
      processed: 1,
      rejected: 0,
      created_leads: 0,
      status: "truncated",
      error_message: "batch_truncated:4_items_skipped",
    });
    const payload = updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.status).toBe("truncated");
    expect(payload.error_message).toBe("batch_truncated:4_items_skipped");
  });

  it("writes status='failed' when supplied", async () => {
    const { db, updateSpy } = makeDb();
    await completeSourceRun(db, "run-3", {
      processed: 0,
      rejected: 0,
      created_leads: 0,
      status: "failed",
      error_message: "upstream_error",
    });
    const payload = updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.status).toBe("failed");
  });

  it("throws when Supabase returns an error", async () => {
    const dbErr = { code: "23514", message: "check violation" };
    const { db } = makeDb(dbErr);
    await expect(
      completeSourceRun(db, "run-4", { processed: 1, rejected: 0, created_leads: 0 }),
    ).rejects.toEqual(dbErr);
  });
});

describe("completeSourceRunSafe — never throws", () => {
  it("calls completeSourceRun under withRetry on the happy path", async () => {
    const { db, updateSpy } = makeDb();
    const logged: Array<[string, Record<string, unknown> | undefined]> = [];
    await completeSourceRunSafe(
      db,
      "run-5",
      { processed: 7, rejected: 1, created_leads: 2, status: "completed" },
      (event, fields) => { logged.push([event, fields]); },
    );
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(logged[0]![0]).toBe("ingest.source_run_completed");
  });

  it("swallows non-retryable Supabase errors and logs a failure event", async () => {
    // 23514 = check_violation → non-retryable in withRetry → first attempt throws.
    const dbErr = { code: "23514", message: "check_violation" };
    const { db } = makeDb(dbErr);
    const logged: Array<[string, Record<string, unknown> | undefined]> = [];

    await expect(
      completeSourceRunSafe(
        db,
        "run-6",
        { processed: 0, rejected: 0, created_leads: 0, status: "truncated", error_message: "batch_truncated:1_items_skipped" },
        (event, fields) => { logged.push([event, fields]); },
      ),
    ).resolves.toBeUndefined();

    expect(logged.length).toBe(1);
    expect(logged[0]![0]).toBe("ingest.source_run_complete_failed");
    expect(logged[0]![1]).toMatchObject({ source_run_id: "run-6", status: "truncated" });
  });

  it("swallows retry-exhausted errors and logs a failure event", async () => {
    // Use a transient error (TypeError) which IS retryable. withRetry will
    // attempt 3 times, all fail, then throw RetryExhaustedError. The safe
    // wrapper catches it and logs.
    const { db } = makeDb(new TypeError("network failure"));
    const logged: Array<[string, Record<string, unknown> | undefined]> = [];

    await expect(
      completeSourceRunSafe(
        db,
        "run-7",
        { processed: 3, rejected: 1, created_leads: 0 },
        (event, fields) => { logged.push([event, fields]); },
      ),
    ).resolves.toBeUndefined();

    expect(logged[0]![0]).toBe("ingest.source_run_complete_failed");
  });
});

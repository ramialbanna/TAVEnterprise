import { describe, it, expect, vi } from "vitest";
import { completeSourceRun, completeSourceRunSafe } from "../sourceRuns";
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

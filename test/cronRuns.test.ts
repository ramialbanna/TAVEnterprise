import { describe, it, expect, vi } from "vitest";

// Make withRetry a single-shot passthrough so error-path tests don't sit through
// the real 250/1000/4000ms backoff.
vi.mock("../src/persistence/retry", () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

import { recordCronRun, recordCronRunSafe, getLastCronRun } from "../src/persistence/cronRuns";
import type { SupabaseClient } from "../src/persistence/supabase";

/**
 * Minimal fake of the postgrest-js surface cronRuns.ts touches:
 *   db.from(t).insert(payload)                          -> { error }
 *   db.from(t).select().eq(c,v).order(...).limit(n)     -> { data, error }
 */
function makeDb(opts: {
  insert?: { error?: unknown };
  select?: { data?: unknown[] | null; error?: unknown };
}) {
  const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const selectCalls: Array<{ table: string; eq?: [string, unknown] }> = [];
  const db = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          insertCalls.push({ table, payload });
          return Promise.resolve({ error: opts.insert?.error ?? null });
        },
        select() {
          let eqCapture: [string, unknown] | undefined;
          const chain = {
            eq(col: string, val: unknown) {
              eqCapture = [col, val];
              return chain;
            },
            order() {
              return chain;
            },
            limit() {
              selectCalls.push({ table, eq: eqCapture });
              return Promise.resolve({ data: opts.select?.data ?? [], error: opts.select?.error ?? null });
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, insertCalls, selectCalls };
}

describe("persistence/cronRuns", () => {
  describe("recordCronRun", () => {
    it("inserts a snake_cased row", async () => {
      const { db, insertCalls } = makeDb({});
      await recordCronRun(db, {
        jobName: "stale_sweep",
        startedAt: "2026-05-11T06:00:00.000Z",
        finishedAt: "2026-05-11T06:00:02.000Z",
        status: "ok",
        detail: { updated: 7 },
      });
      expect(insertCalls).toEqual([
        {
          table: "cron_runs",
          payload: {
            job_name: "stale_sweep",
            started_at: "2026-05-11T06:00:00.000Z",
            finished_at: "2026-05-11T06:00:02.000Z",
            status: "ok",
            detail: { updated: 7 },
          },
        },
      ]);
    });

    it("defaults finished_at to null and detail to {}", async () => {
      const { db, insertCalls } = makeDb({});
      await recordCronRun(db, { jobName: "j", startedAt: "t", status: "failed" });
      expect(insertCalls).toEqual([
        {
          table: "cron_runs",
          payload: { job_name: "j", started_at: "t", finished_at: null, status: "failed", detail: {} },
        },
      ]);
    });

    it("throws when the insert returns an error", async () => {
      const { db } = makeDb({ insert: { error: { message: "boom" } } });
      await expect(
        recordCronRun(db, { jobName: "j", startedAt: "t", status: "ok" }),
      ).rejects.toMatchObject({ message: "boom" });
    });
  });

  describe("recordCronRunSafe", () => {
    it("swallows an insert error and resolves without throwing", async () => {
      const { db } = makeDb({ insert: { error: { message: "boom" } } });
      await expect(
        recordCronRunSafe(db, { jobName: "j", startedAt: "t", status: "ok" }),
      ).resolves.toBeUndefined();
    });

    it("still records normally when the insert succeeds", async () => {
      const { db, insertCalls } = makeDb({});
      await recordCronRunSafe(db, { jobName: "stale_sweep", startedAt: "t", status: "ok", detail: { updated: 1 } });
      expect(insertCalls).toEqual([
        {
          table: "cron_runs",
          payload: { job_name: "stale_sweep", started_at: "t", finished_at: null, status: "ok", detail: { updated: 1 } },
        },
      ]);
    });
  });

  describe("getLastCronRun", () => {
    it("maps the latest row to camelCase and filters by job_name", async () => {
      const { db, selectCalls } = makeDb({
        select: {
          data: [
            {
              id: "c1",
              job_name: "stale_sweep",
              started_at: "2026-05-11T06:00:00.000Z",
              finished_at: "2026-05-11T06:00:03.000Z",
              status: "ok",
              detail: { updated: 5 },
            },
          ],
        },
      });
      const out = await getLastCronRun(db, "stale_sweep");
      expect(out).toEqual({
        id: "c1",
        jobName: "stale_sweep",
        startedAt: "2026-05-11T06:00:00.000Z",
        finishedAt: "2026-05-11T06:00:03.000Z",
        status: "ok",
        detail: { updated: 5 },
      });
      expect(selectCalls).toEqual([{ table: "cron_runs", eq: ["job_name", "stale_sweep"] }]);
    });

    it("returns null when there are no rows", async () => {
      const { db } = makeDb({ select: { data: [] } });
      expect(await getLastCronRun(db, "stale_sweep")).toBeNull();
    });

    it("coerces a null detail column to {}", async () => {
      const { db } = makeDb({
        select: {
          data: [{ id: "c2", job_name: "j", started_at: "t", finished_at: null, status: "failed", detail: null }],
        },
      });
      expect(await getLastCronRun(db, "j")).toEqual({
        id: "c2",
        jobName: "j",
        startedAt: "t",
        finishedAt: null,
        status: "failed",
        detail: {},
      });
    });

    it("throws when the query returns an error", async () => {
      const { db } = makeDb({ select: { error: { message: "no table" } } });
      await expect(getLastCronRun(db, "j")).rejects.toMatchObject({ message: "no table" });
    });
  });
});

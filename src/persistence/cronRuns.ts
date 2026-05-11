import type { SupabaseClient } from "./supabase";
import { withRetry } from "./retry";
import { log, serializeError } from "../logging/logger";

export type CronRunStatus = "ok" | "failed";

/** One row of tav.cron_runs (migration 0042) in domain-friendly camelCase. */
export interface CronRun {
  id: string;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: CronRunStatus;
  detail: Record<string, unknown>;
}

/** Fields a caller supplies to {@link recordCronRun}. */
export interface CronRunInput {
  jobName: string;
  /** ISO 8601 — when the job started. */
  startedAt: string;
  /** ISO 8601 — when it finished; omit / null if recording mid-run. */
  finishedAt?: string | null;
  status: CronRunStatus;
  /** Small jsonb payload — e.g. `{ updated: n }` on success, `{ error: ... }` on failure. */
  detail?: Record<string, unknown>;
}

/**
 * Insert one tav.cron_runs audit row. Retries transient failures (via
 * {@link withRetry}) and still throws on exhausted retries — callers that must
 * not fail on a persistence error should use {@link recordCronRunSafe}.
 */
export async function recordCronRun(db: SupabaseClient, input: CronRunInput): Promise<void> {
  await withRetry(async () => {
    const { error } = await db.from("cron_runs").insert({
      job_name: input.jobName,
      started_at: input.startedAt,
      finished_at: input.finishedAt ?? null,
      status: input.status,
      detail: input.detail ?? {},
    });
    if (error) throw error;
  });
}

/**
 * {@link recordCronRun} that never throws — a failed audit insert must not fail
 * the caller (e.g. the scheduled handler). The failure is logged and swallowed.
 */
export async function recordCronRunSafe(db: SupabaseClient, input: CronRunInput): Promise<void> {
  try {
    await recordCronRun(db, input);
  } catch (err) {
    log("cron.audit_write_failed", {
      jobName: input.jobName,
      status: input.status,
      error: serializeError(err),
    });
  }
}

/** Latest tav.cron_runs row for `jobName`, or `null` if the job has never run. */
export async function getLastCronRun(db: SupabaseClient, jobName: string): Promise<CronRun | null> {
  const { data, error } = await db
    .from("cron_runs")
    .select()
    .eq("job_name", jobName)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ? mapCronRun(row) : null;
}

function mapCronRun(row: Record<string, unknown>): CronRun {
  return {
    id: row.id as string,
    jobName: row.job_name as string,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? null,
    status: row.status as CronRunStatus,
    detail: (row.detail as Record<string, unknown> | null) ?? {},
  };
}

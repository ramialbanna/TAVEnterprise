-- =============================================================================
-- Migration 0042 — Add tav.cron_runs
--
-- Audit log of scheduled-job executions on the main Worker. v1 has exactly one
-- cron (the daily stale-sweep, `0 6 * * *`), but the table is job-agnostic so
-- future jobs (demand recompute, etc.) can reuse it. Each run records start +
-- finish, an 'ok' | 'failed' status, and a small jsonb `detail`
-- ({ "updated": <n> } on success, { "error": <summary> } on failure).
--
-- GET /app/system-status reads the latest `stale_sweep` row to populate
-- `staleSweep.lastRunAt` (previously hardcoded null / "not_persisted").
--
-- Writes are best-effort from the Worker: a failed audit insert must never fail
-- the scheduled event itself.
-- =============================================================================

CREATE TABLE tav.cron_runs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     text        NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text        NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok','failed')),
  detail       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX ON tav.cron_runs (job_name, started_at DESC);

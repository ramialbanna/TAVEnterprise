# Plan: Supabase Schema Migration

```
/plan

Goal: migrate <table/column/index/view> from <current> to <target> with zero downtime.

Read first:
1. supabase/schema.sql.
2. The most recent migrations in supabase/migrations/.
3. Every TypeScript file that references the affected table/column (Grep).
4. docs/architecture.md §12 (data model + required indexes).
5. tav.v_active_inbox and any other view that depends on the touched objects.

Then produce the plan, structured as **expand → migrate → contract**:

PHASE 1 — Expand (additive, deployable on its own)
- Add new columns/fields. Nullable. No reads from them yet.
- Indexes added CONCURRENTLY where possible.
- Dual-write: every writer writes both old and new shape.
- Migration file: supabase/migrations/<UTC-timestamp>_<slug>.sql, idempotent (IF NOT EXISTS), resumable.

PHASE 2 — Backfill
- Backfill script. Idempotent, resumable, rate-limited.
- Verification queries: row counts, sampled equality, drift detector.

PHASE 3 — Migrate readers
- Switch readers (`src/persistence/`, views, application code) to the new shape, one consumer at a time.
- Each switch independently revertible.

PHASE 4 — Contract
- Remove dual-write.
- Drop old columns/fields in a separate, later release with its own migration.

Per phase: list the verification commands and the rollback procedure.

Hard constraints:
- Each phase must be independently deployable and revertible.
- The four-concept tables (raw_listings, normalized_listings, vehicle_candidates, leads) keep their semantic boundary.
- Required indexes from docs/architecture.md §12 stay required.
- v_active_inbox keeps its filter semantics (excludes stale_confirmed/removed, last_seen_at > now() − 30d).
- RLS is not introduced in this migration (track in followups).

End with: Approve plan? (y / revise / abort)
```

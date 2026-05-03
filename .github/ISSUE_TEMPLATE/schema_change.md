---
name: Schema change
about: Modify supabase/schema.sql, migrations, indexes, views, or RLS
title: "[schema] "
labels: ["schema", "data-model"]
assignees: []
---

## Change summary
<!-- One sentence. -->

## Tables / objects affected
<!-- e.g. tav.normalized_listings, tav.leads, tav.v_active_inbox -->

## Phase plan (expand → migrate → contract — see docs/plan-prompts/05-schema-migration.md)
- [ ] **Expand** — additive migration, nullable columns, indexes CONCURRENTLY where possible
- [ ] **Backfill** — idempotent, resumable script
- [ ] **Migrate readers** — switch consumers one at a time
- [ ] **Contract** — drop old columns/objects in a separate, later migration

## Required-index check (docs/architecture.md §12)
- [ ] No required index removed without an ADR
- [ ] New columns indexed where read patterns demand it

## View semantics
- [ ] `tav.v_active_inbox` still excludes `stale_confirmed` and `removed`
- [ ] `tav.v_active_inbox` still filters `last_seen_at > now() − 30 days`

## Rollback
<!-- Exact steps to revert if the migration goes wrong. -->

## ADR
- [ ] ADR added at `docs/adr/NNNN-<slug>.md` (required for non-additive schema changes)

## Hand-off
This issue should be picked up by the **data-modeler** subagent first (SQL only),
then the **implementer** subagent for any TypeScript changes (`src/types/database.ts`,
persistence helpers, view consumers).

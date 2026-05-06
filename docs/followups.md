# Follow-ups

Append items here when scope creep is detected during a TAV-AIP task. Format:

- [ ] `<UTC date>` `<area>` — `<one-line description>` `(noticed by: <agent | user>)`

Example:

- [ ] 2026-05-03 src/normalize — extract trim from title when explicit `trim` field is missing (noticed by: reviewer)
- [ ] 2026-05-03 supabase — add CONCURRENTLY index on `(source, source_listing_id)` for exact dedupe lookups (noticed by: data-modeler)
- [ ] 2026-05-03 src/valuation — add single-flight protection around Manheim token refresh (noticed by: implementer)
- [ ] 2026-05-06 src/admin/routes.ts — Zod validation on PUT /admin/market/expenses request body (N3) (noticed by: user)
- [ ] 2026-05-06 src/admin/routes.ts — clamp ?limit param on GET /admin/import-batches to a max (e.g. 100) to prevent unbounded queries (N5) (noticed by: user)
- [ ] 2026-05-06 src/valuation/mmr.ts — log HTTP status code in both MMR error branches (non-200 response, non-OK fetch) (N1, N2) (noticed by: user)
- [ ] 2026-05-06 src/admin/routes.ts — replace per-region N+1 SELECT in recompute loop with a single aggregated query grouped by region (N4, N14) (noticed by: user)
- [ ] 2026-05-06 src/outcomes/import.ts + types/domain.ts — consolidate duplicate ParsedOutcomeRow and ConditionGradeNormalized definitions; import.ts re-declares both (N9, N10, N17) (noticed by: user)
- [ ] 2026-05-06 supabase/migrations — promote repair-functions.sql to a numbered migration (0022) so it runs in CI and deploy (N18) (noticed by: user)
- [ ] 2026-05-06 supabase/migrations — add NOT NULL constraint to import_fingerprint column in a future migration after backfill is confirmed complete (N19) (noticed by: user)
- [ ] 2026-05-06 supabase/migrations — audit all IS NULL / IS NOT NULL queries on import_fingerprint; migration 0021 added NOT NULL DEFAULT '' which may break existing null checks (Q7) (noticed by: user)

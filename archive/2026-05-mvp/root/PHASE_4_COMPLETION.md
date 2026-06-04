# Phase 4 Completion — Data Integrity Gaps Closed

All scale-foundation work is done. Three data-integrity gaps identified at the start of this session are now closed.

## Gap 1 — Real Region Scoring (was hardcoded to 100)

**Files changed:**
- `src/scoring/lead.ts` — added `computeRegionScore(region)`, added `regionScore` to `ScoreComponents`, updated `computeFinalScore` weights to match `domain.ts` spec (35/25/20/10/10)
- `src/ingest/handleIngest.ts` — replaced `regionScore: 100` with `computeRegionScore(listing.region)`

**Scoring tiers:**
| Region | Score | Rationale |
|---|---|---|
| `dallas_tx`, `houston_tx` | 100 | Primary markets (largest Texas metros) |
| `austin_tx`, `san_antonio_tx` | 75 | Secondary active markets |
| undefined / unknown | 50 | Cannot target buyers without a region |

**Tests added:** 9 new tests in `test/scoring.lead.test.ts`
- `computeRegionScore`: 6 cases (primary/secondary/unknown/missing)
- `computeFinalScore`: 3 region-weighted cases including weight-math verification

---

## Gap 2 — Year Validation Alignment (TS said 1990, SQL said 1900)

**Business rule: valid vehicle years are 2000–2035.**

**Files changed:**
- `src/sources/facebook.ts` — changed `year < 1990` → `year < 2000`
- `supabase/migrations/0007_year_constraint_alignment.sql` — ALTER TABLE to `CHECK (year BETWEEN 2000 AND 2035)`

**Tests added:** 2 new tests in `test/facebook.adapter.test.ts`
- C10b: year 1999 → `invalid_year` (was previously accepted)
- C10c: year 2000 → valid (new floor confirmed)

**Migration to run:** `supabase/migrations/0007_year_constraint_alignment.sql`

---

## Gap 3 — Schema Drift Detection (`schema_drift_events` table was dead code)

**Files added:**
- `src/persistence/schemaDrift.ts` — `writeSchemaDrift()`, never throws, structured log on failure
- `supabase/migrations/0007_year_constraint_alignment.sql` — already existed, no schema change needed

**Files changed:**
- `src/sources/facebook.ts` — added `KNOWN_FACEBOOK_FIELDS` (30 known top-level keys) and `detectFacebookDrift()` (pure function, no I/O)
- `src/ingest/handleIngest.ts` — drift detection after adapter step B; `Promise.all` writes; isolated in try/catch so failures never block ingest

**Invariants enforced:**
- Drift detection runs on every Facebook item, whether the adapter accepts or rejects it
- `writeSchemaDrift` itself never throws (internal try/catch + structured log)
- The `try/catch` around `Promise.all` in `handleIngest.ts` provides a second isolation layer
- Drift events are fire-and-parallel — do not add serial latency per item

**Tests added:** 7 new tests across two files
- `test/facebook.adapter.test.ts` Group F: 5 pure-function drift detection cases
- `test/ingest.test.ts`: 2 integration cases — drift recorded, ingest survives `writeSchemaDrift` throw

---

## Test Summary

| Milestone | Tests |
|---|---|
| Before this session | 135 |
| After Gap 1 (region score) | 144 |
| After Gap 2 (year alignment) | 146 |
| After Gap 3 (schema drift) | 153 |

All 153 tests pass. `tsc --noEmit` clean.

---

## Next: Phase 5 — Manheim MMR Integration

See `NEXT_STEPS.md` for the full Phase 5 plan (MMR fetch, KV cache, deal score wiring).

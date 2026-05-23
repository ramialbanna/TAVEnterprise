# Production Diagnostics

Living index for production ingest, valuation, and lead-creation analysis.

Use this file to find **what we know about live pipeline behavior** before tuning sources, scoring, or enabling new regions. Detailed snapshots live in dated reports below; update this index when a new diagnosis is run.

**Related:** [handoff.md](handoff.md) · [runbook.md](runbook.md) · [NEXT_STEPS.md](../NEXT_STEPS.md)

---

## Current status (2026-05-22)

**Region under watch:** `tav-tx-east` → `dallas_tx` (Apify task `nccVufFs2grLH4Qsj`)

| Question | Answer |
|----------|--------|
| Is ingest broken? | **No** — runs complete every ~5 min |
| Why do most runs show `created_leads = 0`? | **Expected** at ~0.26% yield and ~7 items/run |
| Primary blockers | Adapter reject (~38%), valuation miss (~91% of normalized), then `pass` grade on overpriced MMR hits |
| Enable more regions? | **Not yet** — same constraints would multiply noise |
| Next product step | **Phase 7** workflow status mutations and notes (Phase 6 assign/claim shipped 2026-05-23) |

### Key metrics (7-day `dallas_tx` average)

| Metric | Value |
|--------|------:|
| Items per run | ~7 |
| Processed per run | ~4.5 |
| Reject rate | 37.5% |
| Lead yield (leads ÷ processed) | 0.26% |

### Top rejection reasons (7 days)

| Code | Count | Meaning |
|------|------:|---------|
| `missing_ymm` | 2,462 | Unparseable title / non-passenger (often commercial trucks) |
| `invalid_year` | 588 | Year &lt; 2000 (intentional adapter floor) |

### Top valuation misses (7 days)

| `missing_reason` | Count |
|------------------|------:|
| `cox_no_data` | 3,570 |
| `trim_missing` | 928 |
| `cox_unavailable` | 69 |
| `mileage_missing` | 34 |

### Decisions in effect

1. Keep **`tav-tx-east`** running — pipeline proves end-to-end lead creation.
2. **Do not** lower `pass` grade threshold to inflate lead counts.
3. **Do not** enable west/south/ok until east near-misses are visible in v2.
4. Source/adapter tuning → **separate PR** after Phase 5.

---

## Diagnostic reports

| Date | Report | Scope |
|------|--------|-------|
| 2026-05-21 | [Apify production diagnosis — tav-tx-east](apify-production-diagnosis-2026-05-21.md) | Phase 4 full funnel, SQL, examples, ruled-out hypotheses |

Add a new row when re-running diagnosis (e.g. after adapter changes or region soak).

---

## How to re-run

1. Query Supabase `tav` schema — see SQL appendix in the latest dated report.
2. Compare at least **7 days** of `source_runs` for `dallas_tx` (not single runs).
3. Check funnel: `filtered_out` → `normalized_listings` → `valuation_snapshots` → `leads`.
4. Write a new dated file: `apify-production-diagnosis-YYYY-MM-DD.md`.
5. Update **Current status** and **Diagnostic reports** in this file.
6. Link from [handoff.md](handoff.md) if production recommendations change.

### Quick health checks

```sql
-- Last 20 east runs
SELECT run_id, scraped_at, item_count, processed, rejected, created_leads, status
FROM tav.source_runs
WHERE region = 'dallas_tx'
ORDER BY scraped_at DESC
LIMIT 20;

-- 7-day yield
SELECT ROUND(100.0 * SUM(created_leads) / NULLIF(SUM(processed), 0), 2) AS lead_yield_pct,
       ROUND(100.0 * SUM(rejected) / NULLIF(SUM(processed) + SUM(rejected), 0), 1) AS reject_pct
FROM tav.source_runs
WHERE region = 'dallas_tx'
  AND scraped_at > now() - interval '7 days'
  AND status = 'completed';
```

---

## Open follow-ups from diagnostics

| Priority | Item | Owner |
|----------|------|-------|
| P1 | Reduce `missing_ymm` commercial-truck noise (Apify filters or adapter) | Engineering |
| P2 | Triage `cox_no_data` / `trim_missing` by make-model | Engineering |
| P3 | Investigate 11 stuck `source_runs.status = running` rows | Ops |
| P4 | Ship v2 Opportunities read model for near-miss visibility | Product / Engineering |

See also [followups.md](../05-process/followups.md) for broader backlog items.

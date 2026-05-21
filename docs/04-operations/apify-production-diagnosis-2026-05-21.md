# Apify Production Diagnosis — `tav-tx-east`

**Date:** 2026-05-21  
**Region:** `dallas_tx` (`tav-tx-east` / task `nccVufFs2grLH4Qsj`)  
**Method:** Supabase queries on `tav.source_runs`, `filtered_out`, `valuation_snapshots`, `normalized_listings`, `leads`  
**Related:** [diagnostics.md](diagnostics.md) · [handoff.md](handoff.md) · [NEXT_STEPS.md](../NEXT_STEPS.md) Phase 4

## Executive summary

**The ingest pipeline is healthy.** Runs complete, listings normalize, valuations fire, and leads are still being created — but **most scheduled runs correctly produce zero new leads** because:

1. **~38% of raw items fail adapter gates** (`missing_ymm`, `invalid_year`) — mostly commercial trucks, classics, and unparseable FB titles.
2. **~91% of normalized listings miss MMR** in a typical 24h window (`cox_no_data`, `trim_missing`, `mileage_missing`).
3. **Listings with MMR but bad economics score `pass`** (price far above MMR → `dealScore` near 0 → `finalScore < 55` → no lead row).

This is primarily a **sourcing + normalization + valuation coverage** problem, not a broken ingest path, duplicate dedupe bug, or Ingest Monitor visibility gap.

**Recommendation before enabling more regions:** improve source signal quality and surface near-misses in v2 Opportunities — do **not** loosen lead grade thresholds to manufacture leads.

---

## Run volume (last 7 days, `dallas_tx`, completed)

| Metric | Value |
|--------|------:|
| Runs | ~1,150 |
| Avg items / run | 7.2 |
| Avg processed / run | 4.5 |
| Reject rate (rejected ÷ items) | **37.5%** |
| Lead yield (leads ÷ processed) | **0.26%** (~1 lead per 390 processed) |

### Daily rollup

| Day | Runs | Processed | Rejected | Created leads | Runs with ≥1 lead |
|-----|-----:|----------:|---------:|--------------:|--------------------:|
| 2026-05-21 | 124 | 597 | 372 | 1 | 1 |
| 2026-05-20 | 273 | 1,743 | 850 | 4 | 4 |
| 2026-05-19 | 283 | 1,240 | 589 | 5 | 5 |
| 2026-05-18 | 285 | 1,220 | 1,097 | 3 | 3 |

Recent 20 runs (2026-05-21 morning) all show `created_leads = 0` — **expected** given batch size (~5–12 items) and ~0.26% yield (most runs need ~400+ processed listings for even ~1 expected lead).

Last run with a lead: **`0KA7KiUt7FF0q5bIL`** at 2026-05-21 02:01 UTC (`10 processed`, `1` lead).

---

## Funnel (last 24h, `dallas_tx`)

| Stage | Count |
|-------|------:|
| Filtered out (adapter reject) | 807 |
| Normalized listings | 205 |
| Valuation hits | 19 |
| Valuation misses | 186 |
| Leads created | 4 |
| Normalized, MMR hit, **no lead** | 15 |
| Normalized, MMR miss, no lead | 186 |

---

## Top rejection reasons (7 days, `filtered_out`)

| Reason | Count | Notes |
|--------|------:|-------|
| `missing_ymm` | 2,462 | Cannot parse year/make/model from title. Sample titles: commercial trucks (`HINO 268A`, `Peterbilt 387`, `Freightliner columbia`). |
| `invalid_year` | 588 | Year &lt; 2000 per adapter gate. Sample: `1980 Pontiac Trans Am`, `1973 Porsche 914`. Intentional age floor. |
| `missing_identifier` | 1 | Rare after raidr-api adapter mapping fix. |

**Blocker class:** source quality + adapter parsing — not ingest infrastructure.

---

## Top valuation miss reasons (7 days, snapshots on east runs)

| `missing_reason` | Count |
|------------------|------:|
| `cox_no_data` | 3,570 |
| `trim_missing` | 928 |
| `cox_unavailable` | 69 |
| `mileage_missing` | 34 |
| `cox_vendor_auth` | 3 |
| `cox_timeout` | 1 |

**Blocker class:** valuation coverage (style/trim catalog + Cox YMMT path) — not Worker timeout or auth at scale.

---

## When leads *do* create (recent 10)

Successful leads share a pattern:

- Complete YMM + trim + mileage
- MMR hit with reasonable price/MMR spread
- Grades: `fair` (56–66), `good` (72–80), `excellent` (85–92)

Examples:

| Vehicle | Price | MMR (approx) | Grade | Score |
|---------|------:|-------------:|-------|------:|
| 2018 Honda Accord LX | $12,900 | hit | excellent | 85 |
| 2023 Honda Civic Si | $15,900 | hit | excellent | 92 |
| 2021 Tesla Model Y LR | $21,500 | hit | good | 80 |
| 2020 Cadillac CT5 Luxury | $10,500 | hit | fair | 66 |

---

## MMR hit but no lead (scoring working as designed)

Sample normalized listings with MMR but no lead (last 6h):

| Title | Price | MMR | Why no lead |
|-------|------:|----:|-------------|
| 2018 Porsche 718 Cayman GTS | $100,000 | $45,800 | `dealScore ≈ 10` → `pass` grade |
| 2025 Kia K4 | $26,954 | $18,000 | Overpriced vs MMR → `pass` grade |

Leads are only upserted when `grade !== "pass"` (`src/ingest/handleIngest.ts`). This is correct behavior.

---

## Ruled out

| Hypothesis | Verdict |
|------------|---------|
| Ingest / Apify bridge broken | **No** — runs complete every ~5 min |
| Duplicate dedupe blocking all leads | **No** — 15 new leads in 14 days; upsert creates when grade qualifies |
| Score threshold too strict for good deals | **No** — successful leads span fair–excellent |
| Runs too small alone explain zeros | **Partially** — small batches make zero-lead runs normal at current yield |
| Product visibility / monitor bug | **No** — data matches DB; monitor reflects reality |

---

## Decision (Phase 4)

### Do now

1. **Keep `tav-tx-east` running** — pipeline proves end-to-end lead creation.
2. **Ship v2 read-only Opportunities (Phase 5)** — buyers need near-miss visibility (`filtered_out`, valuation misses, MMR-hit/pass-grade listings), not higher lead counts in silence.
3. **Source tuning (separate PR):** investigate Apify actor search filters to reduce commercial/non-passenger inventory before adapter.

### Do not do yet

1. **Do not enable `tav-tx-west` / `tav-tx-south` / `tav-ok`** — same adapter/valuation constraints would multiply noise.
2. **Do not lower `pass` grade threshold** to inflate lead counts — would surface overpriced inventory.
3. **Do not treat `created_leads = 0` on a 5–10 item run as an outage** — check 7-day yield instead.

### Follow-up engineering (post–Phase 5)

| Priority | Area | Action |
|----------|------|--------|
| P1 | Adapter / source | Reduce `missing_ymm` truck noise; document intentional `invalid_year` floor |
| P2 | Valuation | Continue trim/style catalog + estimated badges; triage `cox_no_data` by make/model |
| P3 | Ops | Investigate 11 stuck `source_runs.status = running` rows |
| P4 | Product | True sell-through KPI blocked on bought-not-sold persistence (see followups) |

---

## Queries used

Representative SQL (run against Supabase `tav` schema):

```sql
-- Daily east rollup
SELECT date(scraped_at) AS day, COUNT(*) AS runs,
       SUM(processed), SUM(rejected), SUM(created_leads)
FROM tav.source_runs
WHERE region = 'dallas_tx' AND scraped_at > now() - interval '14 days'
GROUP BY 1 ORDER BY 1 DESC;

-- 24h funnel
SELECT COUNT(DISTINCT nl.id) AS normalized,
       COUNT(DISTINCT l.id) AS leads,
       COUNT(DISTINCT vs.id) FILTER (WHERE vs.mmr_value IS NOT NULL) AS val_hits,
       COUNT(DISTINCT vs.id) FILTER (WHERE vs.missing_reason IS NOT NULL) AS val_misses
FROM tav.source_runs sr
JOIN tav.normalized_listings nl ON nl.source_run_id = sr.id
LEFT JOIN tav.leads l ON l.normalized_listing_id = nl.id
LEFT JOIN LATERAL (
  SELECT mmr_value, missing_reason FROM tav.valuation_snapshots
  WHERE normalized_listing_id = nl.id ORDER BY fetched_at DESC LIMIT 1
) vs ON true
WHERE sr.region = 'dallas_tx' AND sr.scraped_at > now() - interval '24 hours';
```

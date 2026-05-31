# Report 09 — MMR Quality & Residuals

**Punch item:** #9 · **Kit:** [`../09-mmr-quality-residual-audit.md`](../09-mmr-quality-residual-audit.md)
**Date:** 2026-05-20 · **Re-audited:** 2026-05-22 · **Status:** Re-audited
against the 57,228-row Phase 0 backfill — see **§0**. The residual backtest,
"not producible" pre-backfill, **is now producible**. §1–§5 below are kept as
the historical record.

**Method:** read-only structural analysis plus the live SELECT-only results of
kit §4 (queries Q9.1–Q9.4), run in Supabase Studio.

**Licensed-data guardrail (applied):** only derived numeric columns were
queried. No `raw_response` / `mmr_payload`, no individual MMR dollar figures,
no VINs appear in this report.

---

## 0. Re-audit 2026-05-22 — post-Phase-0 backfill

The Phase 0 backfill loaded 57,228 rows into `tav.purchase_outcomes` — 100%
carry `sale_price`, 92.1% carry `mmr_value_at_purchase`. The §3 finding (residual
backtest "not producible") is **superseded — the residual IS producible.** §2
below — the `valuation_snapshots` / `mmr_queries` quality metrics — is a
separate table, unchanged by the backfill.

**Residual backtest — now producible (read-only, 2026-05-22).** Residual =
`sale_price − mmr_value_at_purchase`; 52,709 rows have both. One row carries a
corrupt `mmr_value_at_purchase` (~2.14 billion — within `int` range, so not
clamped at load); the clean subset excludes `mmr > $1M`:

| metric — clean subset, 52,708 rows | value |
|---|---|
| mean residual | +817 |
| median residual | +885 |
| IQR (p25 … p75) | −335 … +2,170 |
| mean absolute residual | 2,260 |
| stddev | 6,394 |
| sold above MMR | 36,168 (68.6%) |
| sold below MMR | 16,486 (31.3%) |

TAV sells ~$800–900 above day-of MMR on the median deal; ~69% of units clear
above MMR. This is the residual evidence base that was missing for item #2's
promotion-threshold calibration — now available.

**Data-quality flag.** 1 row has `mmr_value_at_purchase ≈ 2.14B` (corrupt) — it
loaded because it sits below the 32-bit `int` ceiling. Downstream residual work
must filter `mmr_value_at_purchase` to a sane bound, or the value should be
scrubbed to NULL in a small follow-up `UPDATE` (separate owner call).

---

## 1. Headline

MMR coverage in TAV's history is **thin and low-yield**: ~4,264
`valuation_snapshots` rows, of which only **478 (≈11%) are hits** and ~3,786
are misses, dominated by `cox_no_data`. The kit's core deliverable — the
`actual_sale − day-of MMR` residual — **cannot be computed**, because
`purchase_outcomes` carries no usable day-of MMR and no link to
`valuation_snapshots` (Report 06 F2/F3).

## 2. Live results

### MMR method split — hits only (Q9.1a)
| Method | Rows | Share |
|---|---|---|
| `vin` | 137 | 28.7% |
| `year_make_model` | 341 | 71.3% |
| **Total hits** | **478** | — |

Most successful valuations are the **YMM fallback**, not true VIN lookups.

### Method by segment (Q9.1b)
Segment-level method is **polarised** — segments are either 100% YMM fallback
or 0%. Large all-YMM segments include 2017 Land Rover Range Rover Evoque (133),
2017 Mercedes-Benz AMG GT (86), 2017 Jeep Wrangler Unlimited (30).
**Data-quality finding:** the `valuation_snapshots` model field carries
normalization artifacts — trailing ` ·` separators and trim-polluted model
names (e.g. `q60 ·`, `4runner ·`). Segment keys built from this column will
mis-group until the model field is cleaned.

### Miss reasons (Q9.2a) — `valuation_snapshots`, `mmr_value` NULL
| `missing_reason` | Rows |
|---|---|
| `cox_no_data` | 2,976 |
| `trim_missing` | 702 |
| `cox_unavailable` | 69 |
| `mileage_missing` | 34 |
| `cox_vendor_auth` | 3 |
| `cox_vendor_bad_response` | 1 |
| `cox_timeout` | 1 |
| **Total misses** | **≈3,786** |

`cox_no_data` is the dominant failure — Cox simply returns nothing for most
lookups. `trim_missing` (702) is the YMM path hard-blocking on absent trim.
Overall snapshot hit rate ≈ **478 / 4,264 ≈ 11%**.

### Query-log errors (Q9.2b) — `mmr_queries`
| `error_code` | Rows |
|---|---|
| `manheim_auth_error` | 72 |
| `Error` | 3 |
| `manheim_unavailable` | 1 |
| `manheim_response_error` | 1 |

72 recurring auth errors warrant an operational follow-up (token/credential
health) outside MaxBuy scope.

### Cache (Q9.3a / Q9.3b)
- Source/hit split: `cache` hit 2,172 · `manheim` live (cache miss) 1,351.
- `mmr_cache` age: all **615 rows fall in the 0–5-day bucket** — the cache is
  small and uniformly fresh.

### Residual backtest (Q9.4a / Q9.4b)
**0 rows returned** for both the segment cut and the price-band cut.

## 3. Critical finding — residual backtest not producible

The residual query needs `purchase_outcomes` rows with
`sale_price` **and** `mmr_value_at_purchase` set. Report 06 (F1–F3) shows
`purchase_outcomes` has no usable `mmr_value_at_purchase` and no
`vehicle_candidate_id` to recover it from `valuation_snapshots`. So
`actual_sale − day-of MMR` cannot be measured from current data.

Consequence: the residual evidence that was meant to calibrate item #2's
promotion thresholds is **unavailable**. An alternative is required before
Phase 1 — options:
- begin **capturing day-of MMR at buy time** going forward (forward-only);
- backfill via a `vin` join from `purchase_outcomes` to `valuation_snapshots` /
  `mmr_queries`, contingent on `purchase_outcomes.vin` coverage (mostly NULL
  today — Report 06);
- scope v1 residual calibration to the small set of units where both values
  do coexist, if any can be assembled.

## 4. Interaction with DEC-4 (closed)

DEC-4 already keeps `GATE_MMR_MISSING` and `GATE_YMM_FALLBACK_LOW` **out** of
the hard-gate set — both route to Review / `data_strength`. Given an ~11% MMR
hit rate and a 71% YMM-fallback share, that decision is well-founded: hard-
gating on MMR weakness would Pass most of the book. The high miss rate instead
feeds the `data_strength` routing in Report 07.

## 5. Definition of done

MMR quality metrics (method split, miss reasons, cache, errors): **done
(live).** Residual-by-segment report: **not producible from current data** —
escalated in §3; this is the live confirmation of risk R1. YMM-fallback rate:
**done** (71% of hits; segment polarisation noted).

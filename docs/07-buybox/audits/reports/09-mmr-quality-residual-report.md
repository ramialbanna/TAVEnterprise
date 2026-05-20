# Report 09 — MMR Quality & Residuals (interim)

**Punch item:** #9 · **Kit:** [`../09-mmr-quality-residual-audit.md`](../09-mmr-quality-residual-audit.md)
**Date:** 2026-05-20 · **Status:** Interim — column availability and method
confirmed; quality/residual numbers pending a Supabase read run.

**Method:** read-only inspection of `supabase/schema.sql`
(`tav.valuation_snapshots`, `tav.mmr_queries`, `tav.mmr_cache`,
`tav.purchase_outcomes`). No live query run.

**Licensed-data guardrail (confirmed applied):** the kit queries select derived
numeric columns only. `tav.valuation_snapshots.raw_response`,
`tav.mmr_queries.mmr_payload`, and `tav.mmr_cache.mmr_payload` are licensed
Cox/Manheim payloads — never selected into a report, log, or external service.
No licensed value appears in this report.

---

## 1. Structural findings (complete)

### F1 — All four audit questions are answerable from existing columns

| Question | Column source |
|---|---|
| VIN vs YMM-fallback rate | `valuation_snapshots.valuation_method` (`vin` \| `year_make_model`); `mmr_queries.lookup_type` |
| Miss reasons | `valuation_snapshots.missing_reason`; `mmr_queries.error_code` |
| Cache age | `mmr_queries.cache_hit` / `source`; `mmr_cache.fetched_at` / `expires_at` |
| Residual | `purchase_outcomes.sale_price` − `purchase_outcomes.mmr_value_at_purchase` |

### F2 — The XOR constraint makes miss data reliable

`tav.valuation_snapshots` has a CHECK enforcing exactly one of `mmr_value` /
`missing_reason` is set. Every row is a clean hit or a clean miss — the audit
can trust `missing_reason` without de-duping ambiguous states.

### F3 — Residual analysis needs no licensed re-pull

`purchase_outcomes.mmr_value_at_purchase` stores the day-of MMR as a plain
integer. Residual = `sale_price − mmr_value_at_purchase` uses two numeric
columns only — no payload, no licensed figure, no re-query of Cox.

### F4 — MMR method is not stored on `purchase_outcomes`

`purchase_outcomes` has `mmr_value_at_purchase` but not the method that
produced it. Splitting residuals by VIN vs YMM method requires the kit §4.4
join to `valuation_snapshots` / `mmr_queries` on `vehicle_candidate_id`. The
join match rate is itself a finding; unmatched rows go to a `method_unknown`
bucket, never dropped.

### F5 — Pre-integration outcome rows

Outcome rows that predate the MMR integration will have
`mmr_value_at_purchase IS NULL`. That share is expected and is a finding, not
an error — it bounds how much history the residual backtest can cover.

## 2. Pending — requires a Supabase read run

Not produced in this docs-only phase:
- VIN vs YMM-fallback rate, overall and by segment;
- miss-reason / error-code distribution;
- cache-age distribution;
- residual-by-segment and residual-by-price-band (bias, MAE, P50, P90);
- the method-join match rate.

Kit §4 SQL (`SELECT`-only, derived columns only) is ready.

## 3. Feeds a closed decision — note

DEC-4 (closed) makes `GATE_MMR_MISSING` and `GATE_YMM_FALLBACK_LOW` **not**
hard gates in v1 — both route to Review / data-strength handling. So this
audit's YMM-fallback-rate output no longer needs to set an owner hard-gate
threshold. Its job narrows to: (a) feed the `data_strength` routing rule
(Report 07), and (b) quantify MMR residual error so item #2's promotion
thresholds can be calibrated.

## 4. Definition of done — status

Structural findings (F1–F5): **done.** Residual-by-segment report and
YMM-fallback rate: **pending data run.**

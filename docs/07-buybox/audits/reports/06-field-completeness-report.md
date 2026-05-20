# Report 06 — Historical Field Completeness (interim)

**Punch item:** #6 · **Kit:** [`../06-field-completeness-audit.md`](../06-field-completeness-audit.md)
**Date:** 2026-05-20 · **Status:** Interim — structural findings complete;
per-field null-rate numbers pending a Supabase read run.

**Method:** read-only inspection of `supabase/schema.sql` (`tav.purchase_outcomes`,
migrations 0011/0018/0019). No live query run in this pre-code phase — the
counting SQL is ready in the kit §4 and is `SELECT`-only. No licensed payloads
are involved (`purchase_outcomes` holds derived numbers, not vendor payloads).

---

## 1. Structural findings (complete — derivable from schema alone)

These are confirmed now and do not need a data run.

### F1 — Three duplicate-intent field pairs

`tav.purchase_outcomes` carries pairs that overlap in meaning. The model must
pick one authoritative column per pair, not average them:

| Pair | Likely intent |
|---|---|
| `purchase_price` vs `price_paid` | both = acquisition cost |
| `gross_profit_est` vs `gross_profit` | estimate vs realized gross |
| `mileage` vs `odometer_at_purchase` | both = odometer at buy |

Resolution requires the §4.3 reconciliation query. Until then, MaxBuy training
must not consume either column of a pair.

### F2 — No `trim` column

`tav.purchase_outcomes` has `year, make, model` but **no `trim`**. Trim-level
features for bought units must come from a join (`vehicle_candidate_id` →
`tav.vehicle_candidates`, or `vin` → `tav.valuation_snapshots`) or be tagged
`unavailable`. This also constrains the segment matrix — see Report 07.

### F3 — `lead_id` nullable by design

The schema comment is explicit: "lead_id is nullable (historical imports may
have no matching lead)." Any feature joined through `tav.leads` inherits that
null rate. Bought-unit history that arrived via CSV import has no Lead.

### F4 — Provenance fields are migration-era-bound

`buyer_id` / `closer_id` (migration 0018) and `cot_city` / `cot_state`
(migration 0019) did not exist before their migrations. Rows imported earlier
are structurally NULL for them — expect `unavailable` for the pre-migration
era and `future-only` after. `week_label`, `import_batch_id`,
`import_fingerprint` follow the same pattern.

### F5 — Columns already constrained (trustworthy where non-null)

CHECK constraints on `purchase_outcomes`: `year` 1900–2100, `mileage` ≥ 0,
`listed_price` ≥ 0, `condition_grade_normalized` ∈
{excellent, good, fair, poor, unknown}, `purchase_channel` ∈
{auction, private, dealer}, `selling_channel` ∈ {retail, wholesale, auction}.
Where these are non-null, the value is structurally valid — the audit only
needs the null/`unknown` rate, not range validation.

## 2. Preliminary field tags (to confirm against the data run)

| Field | Preliminary tag | Basis |
|---|---|---|
| `mmr_value_at_purchase` | backfillable | recoverable from `tav.valuation_snapshots` via `vehicle_candidate_id` (kit §4.4) |
| `sale_price`, `gross_profit`, `hold_days` | future-only (likely) | populated reliably only once a unit sells; open inventory is NULL |
| `buyer_id`, `closer_id`, `cot_city`, `cot_state` | future-only | per F4 |
| `vin` | unknown — needs data | Facebook-sourced rows often lack VIN; rate unknown |
| `condition_grade_normalized` | unknown — needs data | `unknown` enum value may dominate |

## 3. Pending — requires a Supabase read run

The numeric deliverable is **not** in this report. To complete item #6 the dev
runs kit §4.1–4.4 (`SELECT`-only) against Supabase and fills:

- per-field null %, zero/empty %, effective-miss %;
- completeness trend by `purchase_quarter`;
- duplicate-pair verdicts (F1);
- backfill match rate for each `backfillable` candidate.

This pre-code phase produced no live DB run (no Supabase read credentials in a
docs-only change). The SQL is ready; running it is the dev's next action.

## 4. Definition of done — status

Per-field null-rate table: **pending data run.** Structural findings (F1–F5):
**done.** Field tags in [`../../03-TECHNICAL-SPEC.md`](../../03-TECHNICAL-SPEC.md)
§1.1: reconcile after the data run.

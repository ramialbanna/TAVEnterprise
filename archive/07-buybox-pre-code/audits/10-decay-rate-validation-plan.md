# Spike Plan 10 — Decay-Rate Validation

**Punch-list item:** #10 · **Category:** Data Audit / backtest (read-only) ·
**Owner:** D · **Closes risk:** R6 · **Status:** Plan ready — not yet executed.
**Lands in:** [`../02-ARCHITECTURE.md`](../../docs/07-buybox/ARCHITECTURE.md) §5; chosen λ
committed to the benchmark view definitions.

**What this is:** A read-only backtest plan. It specifies the experiment that
chooses the recency-decay half-life for MaxBuy's benchmark views. It creates no
production code, no migration, no schema change — the backtest is throwaway
analysis run offline.

---

## 1. Objective

MaxBuy weights older sales less than recent ones with an exponential decay:

```
weight(sale) = 0.5 ^ (age_days / half_life)
```

`half_life` is a single load-bearing hyperparameter. Too short → benchmarks
chase noise and thin segments collapse. Too long → benchmarks lag a moving
market. This spike backtests a grid of half-lives and picks the one that
minimizes prediction error without destabilizing thin segments.

## 2. Scope & guardrails

- Read-only. `SELECT` only against `tav.historical_sales`. No writes.
- No licensed Cox/Manheim payloads — the backtest uses TAV's own sale records.
- The backtest is **offline throwaway analysis** (a Python notebook/script in
  a scratch location, not committed application code). Only the report and the
  chosen λ are committed.
- Walk-forward discipline is mandatory (§4.2) — any leakage of future sales
  into a benchmark invalidates the result.

## 3. Data source

`tav.historical_sales` — per-vehicle purchase/sale record. Relevant columns:
`year, make, model, trim, sale_date, acquisition_cost, sale_price,
gross_profit` (generated), `acquisition_date`.

Note `historical_sales` has **no `region` and no `mileage`** — the decay
backtest runs at year/make/model(/trim) granularity. Region/mileage decay
sensitivity is out of scope for this spike and noted as a follow-up.

Pull the working set once:

```sql
SELECT year, lower(make) AS make, lower(model) AS model, lower(coalesce(trim,'base')) AS trim,
       sale_date, sale_price, gross_profit
FROM tav.historical_sales
WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
ORDER BY sale_date;
```

Rows excluded (NULL `sale_date` or `sale_price`) are counted and reported — no
silent drops.

## 4. Methodology

### 4.1 λ grid

Test four half-lives:

```
90 days · 180 days · 365 days · 540 days
```

A "no decay" control (uniform weight, infinite half-life) is included as a
fifth arm so the benefit of decay itself is measurable.

### 4.2 Walk-forward backtest

For each sale week `W` in the evaluation window (recommend the most recent 26
weeks with adequate volume):

1. **Train set** = all sales with `sale_date < start_of_week(W)`. Future sales
   are never visible — this is the no-leakage rule.
2. For each λ arm, compute a decay-weighted benchmark per segment from the
   train set: `benchmark = Σ(weight · sale_price) / Σ(weight)`.
3. **Predict** each sale in week `W` using its segment benchmark (with the
   fallback ladder from Audit Kit 07: exact → drop-trim → make/model).
4. Record per-arm error for week `W`.

### 4.3 Metrics per λ arm

- **Sale-price MAE** (dollars) — primary.
- **Gross-hit classification error** — predicted-gross-positive vs
  actual-gross-positive; report as error rate / Brier score.
- **Segment-level stability** — P95 of the week-over-week change in a
  segment's benchmark. A short half-life that wins on MAE but thrashes thin
  segments is rejected.
- **Thin-segment behavior** — MAE restricted to segments with effective N
  below the Kit 07 medium-strength line, reported separately.

### 4.4 Selection rule

Pick the λ with the lowest aggregate sale-price MAE **subject to** segment
stability staying within an acceptable P95 band. Where the grid shows a
specific segment class clearly prefers a different half-life, a documented
per-segment override is allowed — record which segments and why.

## 5. Deliverable — report template

Commit as `audits/reports/10-decay-rate-report.md`:

```markdown
# Report 10 — Decay-Rate Validation
Run date: YYYY-MM-DD · historical_sales rows used: N · Excluded: M (reasons ...)
Evaluation window: weeks ... to ...

## λ-grid results
| Half-life | Sale-price MAE | Gross-hit error | Stability P95 | Thin-segment MAE |
|---|---|---|---|---|
| no decay | | | | |
| 90d | | | | |
| 180d | | | | |
| 365d | | | | |
| 540d | | | | |

## Chosen λ
Half-life = ... · Rationale: ...

## Per-segment overrides (if any)
| Segment class | Override half-life | Reason |

## Follow-ups
- Region/mileage decay sensitivity (out of scope here): ...
```

## 6. Dependencies and ordering

- **Feeds:** the benchmark view definitions and the effective-N column in
  Audit Kit 07 — Kit 07's `effective_n` is provisional at 365d until this
  spike fixes λ, then Kit 07's matrix is regenerated.
- **Feeds:** item #2 (promotion gate) — the holdout MAE numbers here calibrate
  the promotion thresholds product sets.
- **No upstream blocker** — runs today on `historical_sales` as it stands.

## 7. Definition of done

λ-grid report committed; chosen λ committed to the benchmark view definitions;
per-segment overrides documented where the grid justifies them; Audit Kit 07's
effective-N column scheduled for regeneration with the chosen λ.

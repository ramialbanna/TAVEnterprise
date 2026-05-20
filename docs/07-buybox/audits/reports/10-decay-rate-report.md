# Report 10 — Decay-Rate Validation (status)

**Punch item:** #10 · **Kit:** [`../10-decay-rate-validation-plan.md`](../10-decay-rate-validation-plan.md)
**Date:** 2026-05-20 · **Status:** Plan complete; backtest not yet run.

---

## 1. What is done

The backtest **plan** is the kit and is complete: λ grid, walk-forward
no-leakage protocol, metrics, and selection rule are all specified and ready to
execute. Item #10's pre-code deliverable — a runnable plan — exists.

## 2. What is pending

The λ-grid **report** (the chosen half-life) is not produced. It requires:

1. A read-only export of `tav.historical_sales` (kit §3 query, `SELECT`-only).
2. An offline, throwaway backtest script (Python notebook in a scratch
   location — not committed application code, no `apps/maxbuy/`).
3. Running the five arms — no-decay control + 90 / 180 / 365 / 540-day
   half-lives — under the walk-forward protocol.

Neither the data export nor the offline compute happened in this docs-only
phase. No live DB access was used.

## 3. Consequence for downstream items

- The decay half-life λ is **undecided**. Benchmark view definitions cannot be
  finalized until it lands.
- Report 07's effective-N column stays **provisional at a 365-day half-life**
  and is regenerated once λ is chosen.
- Item #2's promotion thresholds (closed as DEC-2 in policy, but the numeric
  holdout thresholds still need calibration) consume the holdout MAE this
  backtest produces.

## 4. Definition of done — status

λ-grid report: **pending backtest run.** Chosen λ committed to benchmark view
definitions: **pending.** Plan ready to execute: **done.**

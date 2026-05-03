# Plan: Stale-Detection Rule Change

```
/plan

Goal: <tune signal | add signal | adjust threshold | change status mapping> in the stale-detection logic.

Read first:
1. src/stale/staleScore.ts and src/stale/freshnessStatus.ts.
2. test/staleScore.test.ts.
3. docs/architecture.md §7 (stale strategy + score table).
4. Any view that filters on freshness_status or stale_score (tav.v_active_inbox).

Then produce the plan:

- Hypothesis: what current behavior is wrong, and what observable change you expect after the rule change. Cite real listings/fixtures if possible.
- Pipeline trace: which downstream consumers (lead creation gate, scoring weight, v_active_inbox filter) are affected by the change? List them.
- Score-table delta (before / after):
   * old weights and thresholds
   * new weights and thresholds
   * boundary cases that change category
- Backward compatibility: existing rows in tav.normalized_listings — do we recompute? In a backfill? On next scrape? Decide and document.
- Tests:
   * keep existing cases passing (or update them with explicit reason)
   * add cases for every changed boundary
   * regression test: a listing that should NOT have changed status, doesn't
- Verification commands.

Hard constraints:
- Stale-suppression strength does not regress without an ADR.
- New signals must have a way to be populated (where does the input come from?).
- v_active_inbox must keep filtering out stale_confirmed and removed.

End with: Approve plan? (y / revise / abort)
```

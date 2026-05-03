# Plan: Buy-Box / Lead-Scoring Update

```
/plan

Goal: <add buy-box rule | change scoring weights | change grade mapping | introduce a new reason code>.

Read first:
1. src/scoring/scoreLead.ts, buyBox.ts, reasonCodes.ts.
2. test/scoring.test.ts.
3. docs/architecture.md §§9, 10.
4. tav.buy_box_rules schema.
5. tav.purchase_outcomes (current row count and shape — informs whether we have enough evidence to change weights).

Then produce the plan:

- Evidence: cite the data that justifies the change. If purchase outcomes don't yet support a weight change, raise it and propose collecting data first.
- Pipeline trace: which leads change grade under the new scoring? Estimate the population (e.g. "~12% of last week's leads would shift from good → fair").
- Files to modify:
   * scoring weights / grade thresholds in src/scoring/
   * reason code constants if new ones are introduced
   * src/scoring/buyBox.ts if rule evaluation changes
- Database changes (if any): buy_box_rules columns, indexes. If yes, hand off to data-modeler subagent before implementing.
- Tests:
   * excellent buy-box match
   * overpriced
   * stale downgrade
   * missing MMR (mmr_failed)
   * Facebook no-VIN case
   * boundary cases for grade transitions (84→85, 69→70, 54→55)
- Verification commands.

Hard constraints:
- No ML scoring path until 2026 purchase outcomes are imported (CLAUDE.md §1, identity.md).
- Final score formula stays a weighted sum of the 5 documented components unless an ADR replaces it.
- A reason code is added to src/scoring/reasonCodes.ts (single source of truth) — no string literals scattered.

End with: Approve plan? (y / revise / abort)
```

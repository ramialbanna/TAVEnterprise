# Plan: Dedupe Strategy Change

```
/plan

Goal: change <exact dedupe keys | fuzzy dedupe inputs | identity-key shape | confidence rules> for duplicate detection.

Read first:
1. src/dedupe/identity.ts, exactDedupe.ts, fuzzyDedupe.ts.
2. test/dedupe.test.ts.
3. docs/architecture.md §6.
4. tav.duplicate_groups schema and any code that reads it.

Then produce the plan:

- Pipeline trace: which step in Raw → Normalized → Vehicle Candidate → Lead is affected, and how does the change propagate (especially Vehicle Candidate identity + cross-source grouping)?
- Identity-key shape: show before/after with concrete examples for Toyota Camry SE in Dallas, etc. Confirm collisions and false-splits.
- Cross-source impact: does this change affect grouping across Facebook + Craigslist? If yes, address it explicitly.
- Migration story: if identity_key shape changes, existing rows need recomputation. Plan it as additive (new column → backfill → switch readers → drop old) — never destructive.
- Tests:
   * exact URL duplicate
   * same source + listing_id
   * fuzzy same YMM/mileage band/region
   * fuzzy NOT duplicate when mileage band or region differs
   * any new edge case introduced by the change
- Verification commands.

Hard constraints:
- Permanent merging of fuzzy duplicates remains forbidden — group via tav.duplicate_groups with confidence.
- Stale and Lead semantics must not depend on a specific identity-key encoding.
- No platform-specific quirks leak into src/dedupe/ — those belong in src/sources/.

End with: Approve plan? (y / revise / abort)
```

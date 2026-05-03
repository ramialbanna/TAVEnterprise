# Plan: Evolve the Normalizer

```
/plan

Goal: change how <field: price | mileage | YMM | location | seller> is normalized, without breaking existing sources.

Read first:
1. src/normalize/* (every file).
2. test/normalize.test.ts (current behavior contract).
3. Each adapter under src/sources/ that calls into normalize/.
4. CLAUDE.md §3, docs/architecture.md §5.

Then produce the plan:

- Behavior contract: list the inputs → outputs that must remain identical (regression checklist). New behavior is added; existing cases are not broken.
- Pipeline trace: which downstream consumers (dedupe, stale, scoring) read this field? List them.
- Step sequence — each step:
   * is a single commit
   * leaves all tests green
   * does not change Normalized Listing's public type
- Tests to add or strengthen *before* the change begins (characterization tests for any uncovered current behavior).
- Reason codes: any new ones for failures the new logic can produce.
- Verification: full unit suite + targeted integration tests for ingestion of fixtures from every adapter.

Hard constraints:
- No change to NormalizedListingInput's public shape without an ADR.
- No "while I'm here" fixes — log to docs/followups.md.
- Facebook fixtures must still pass, including listings with missing fields.

End with: Approve plan? (y / revise / abort)
```

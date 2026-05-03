# Plan: Add a Source Adapter

```
/plan

Goal: add a source adapter for <platform> (e.g. craigslist | autotrader | cars_com | offerup) that produces NormalizedListingInput and plugs into POST /ingest.

Read first:
1. CLAUDE.md §§2, 3, 9.
2. docs/architecture.md §§4, 5, 12.
3. src/sources/facebook.ts as the reference adapter.
4. src/normalize/* and src/dedupe/identity.ts to confirm what shape the downstream pipeline expects.
5. test/fixtures/ to see how real source payloads are stored.

Then produce the plan:

- Pipeline trace: Raw → Normalized → Vehicle Candidate → Lead, calling out where this source differs from Facebook (VIN availability? structured YMM? stable listing id?).
- Files to create:
   * src/sources/<platform>.ts
   * test/<platform>.test.ts (unit, fixture-driven)
   * test/fixtures/<platform>/*.json (≥3 real-shaped payloads)
- Files to modify:
   * src/sources/index.ts (or wherever SourceName is registered)
   * src/types/domain.ts (extend SourceName union)
   * src/index.ts only if the route accepts a new `source` value
- Validation: the Zod wrapper accepts the new source; per-item validator handles platform quirks.
- Reason codes: list the new ones (if any) and where they're surfaced.
- Stale signals: confirm the adapter populates first_seen_at / last_seen_at correctly. If a stable post_id exists, use it for exact dedupe.
- Tests: enumerate the cases (happy path, missing YMM, missing mileage, malformed price, schema-drift sample).
- Verification commands, in order.

Hard constraints:
- No platform-specific code outside src/sources/<platform>.ts.
- Facebook behavior MUST NOT change.
- If this source exposes VIN, use it — but YMM fallback still ships.
- Every rejected item gets a reason_code.

Out of scope:
- Lead scoring tuning for this source (separate plan).
- Cross-source duplicate grouping changes (separate plan, see 04-dedupe-strategy).

End with: Approve plan? (y / revise / abort)
```

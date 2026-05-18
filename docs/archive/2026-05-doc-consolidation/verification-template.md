# Verification Report — `<change title>`

> Paste this template into your reply when reporting a completed TAV-AIP change.

## Summary
<one paragraph: what changed, why, blast radius>

## Diff scope
- Files added: `<list>`
- Files modified: `<list>`
- Files deleted: `<list>`
- Lines: `+<n> / -<m>`

## Pipeline trace
- Raw → Normalized → Vehicle Candidate → Lead: <which steps does this change touch?>
- Sources affected: <facebook | craigslist | autotrader | cars_com | offerup | none>
- Tables touched: <list>
- Views affected: <list, especially `tav.v_active_inbox`>

## Verification log

### 1. Lint
```
$ npm run lint
<exit code>
```
Result: **PASS** | FAIL

### 2. Typecheck
```
$ npm run typecheck
<exit code>
```
Result: **PASS** | FAIL

### 3. Vitest (unit)
```
$ npm test
<summary line, e.g. 142 passed, 0 failed>
```
Result: **PASS** | FAIL

### 4. Integration
```
$ npm run test:int            # or "skipped — diff did not touch src/persistence/, src/valuation/, src/sources/, or supabase/migrations/"
<summary line>
```
Result: **PASS** | FAIL | SKIPPED (reason)

### 5. Manual smoke (if applicable)
- Action: …
- Sample payload: <fixture path>
- Expected: …
- Observed: …

## TAV self-check
- [ ] Four-concept boundary respected (Raw / Normalized / Vehicle Candidate / Lead)
- [ ] No source-specific code outside `src/sources/`
- [ ] No code path requires Facebook VIN
- [ ] Every rejection emits a `reason_code` to `filtered_out` / `dead_letters` / `schema_drift_events`
- [ ] All Supabase writes wrapped in retry + DLQ
- [ ] Stale-suppression strength not regressed
- [ ] No secrets committed; no `.dev.vars` committed; no service-role key outside the Worker
- [ ] HMAC verification on `/ingest` still over the raw body
- [ ] Indexes from `docs/architecture.md` §12 still present
- [ ] `tav.v_active_inbox` filter semantics intact

## Follow-ups logged
<copy-paste lines added to `docs/followups.md`, or "none">

## Reviewer notes (filled by reviewer subagent)
- Blockers: …
- Nits: …
- Questions: …

## Status
- [ ] Ready to commit
- [ ] Ready to push
- [ ] Ready to merge
- [ ] Ready to deploy

# Pull Request — TAV-VAIP

## Summary
<!-- One paragraph: what changed, why, blast radius. -->

## Linked issue / plan
- Closes #
- Plan / ADR: `docs/adr/NNNN-<slug>.md` (if architectural)

## Pipeline trace (mandatory)
- Raw → Normalized → Vehicle Candidate → Lead: <which steps does this PR touch?>
- Sources affected: `facebook` | `craigslist` | `autotrader` | `cars_com` | `offerup` | none
- Tables touched:
- Views affected (especially `tav.v_active_inbox`):

## Verification log
<!-- Paste the actual command output, or attach. Required from `npm run lint`, `npm run typecheck`, `npm test`,
     and `npm run test:int` if `src/persistence/`, `src/valuation/`, `src/sources/`, or `supabase/migrations/` was touched. -->

```
$ npm run lint
$ npm run typecheck
$ npm test -- --run
$ npm run test:int    # or "skipped — no I/O / sources / migrations touched"
```

## TAV self-check (all must be ticked before merge)
- [ ] Four-concept boundary respected (Raw / Normalized / Vehicle Candidate / Lead)
- [ ] No source-specific code outside `src/sources/`
- [ ] No code path requires Facebook VIN
- [ ] Every rejection emits a `reason_code` to `filtered_out` / `dead_letters` / `schema_drift_events`
- [ ] All Supabase writes wrapped in retry + DLQ
- [ ] Stale-suppression strength not regressed
- [ ] No secrets committed; no `.dev.vars` committed; no service-role key outside the Worker
- [ ] HMAC verification on `/ingest` still over the raw body
- [ ] Required indexes from `docs/architecture.md` §12 still present
- [ ] `tav.v_active_inbox` filter semantics intact
- [ ] CHANGELOG updated; RUNBOOK updated if ops changed; ADR added if architectural

## Risks & rollback
<!-- What could break? How would you detect it? How do you roll back? -->

## Out of scope
<!-- What this PR explicitly does NOT change. -->

## Follow-ups
<!-- Items appended to docs/followups.md. -->

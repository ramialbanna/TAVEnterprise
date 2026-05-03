---
description: Spawn parallel reviewer subagents over the current diff (TAV-AIP layer-aware).
---

Run `git diff --name-only HEAD` to list changed files.

If 1–3 files: invoke the `reviewer` subagent once over the whole diff.

If 4+ files: invoke `reviewer` subagents **in parallel**, partitioned by TAV layer:
- one for `src/sources/` and `src/normalize/` (per-platform parsing + cleaning)
- one for `src/dedupe/`, `src/stale/`, `src/scoring/` (pure pipeline logic)
- one for `src/persistence/`, `src/valuation/`, `src/alerts/`, `src/auth/` (I/O + secrets)
- one for `supabase/` (schema, migrations, indexes, views)
- one for `test/`, `docs/`, `.github/`

Aggregate the subagent outputs into a single review:

```
REVIEW SUMMARY: PASS | NEEDS CHANGES | BLOCK
BLOCKERS:    <merged list — secret leaks, four-concept violations, silent drops, VIN assumptions on Facebook, stale regressions go here>
NITS:        <merged list>
QUESTIONS:   <merged list>
FOLLOW-UPS:  <merged list, append to docs/followups.md if any>
```

Do not edit code from this command.

# Incident Report: <short-title>

## Metadata

- **Incident ID:** INC-YYYY-MM-DD-01
- **Date:** YYYY-MM-DD
- **Status:** Draft / In Review / Final
- **Severity:** SEV-1 / SEV-2 / SEV-3
- **Owner:** <name>
- **Incident commander:** <name or N/A>
- **Detected by:** Alert / Manual report / CI failure / Deploy failure / User report / Other
- **Environment:** Production / Staging / CI/CD / Local
- **Start time:** YYYY-MM-DD HH:MM TZ
- **End time:** YYYY-MM-DD HH:MM TZ
- **Duration:** <minutes/hours>
- **Related commit(s):** <sha or N/A>
- **Related workflow run(s):** <URL or ID>
- **Related PR(s):** <URL or N/A>
- **Related issue(s):** <URL or N/A>

## Summary

Provide a short, factual summary of what happened, what was affected, and how the incident was resolved.

Example:
A staging deploy began failing after a workflow syntax change. The failure blocked deploy validation but did not affect production traffic. The issue was resolved by replacing an invalid job-level GitHub Actions expression with a step-based guard.

## Impact

Describe the actual effect, not just the symptom.

- **Who or what was affected:** <users, ops workflow, buying workflow, staging deploys, CI, sync jobs, etc.>
- **User-facing impact:** <none / partial / full outage / degraded behavior>
- **Operational impact:** <inventory flow delay, deploy blocked, scoring risk, compliance concern, etc.>
- **Data integrity risk:** None / Possible / Confirmed
- **Security risk:** None / Possible / Confirmed
- **Estimated scope:** <number of records, users, jobs, minutes, etc.>

## Detection

Describe how the incident was discovered.

- What first signaled the problem?
- Was detection automatic or manual?
- How long after the triggering event was it noticed?
- If detection was delayed, why?

## Timeline

Record events in strict chronological order using factual statements only.

| Time | Event |
|------|-------|
| HH:MM | First symptom observed |
| HH:MM | Incident acknowledged |
| HH:MM | Initial triage started |
| HH:MM | Suspected cause identified |
| HH:MM | Containment or rollback started |
| HH:MM | Mitigation applied |
| HH:MM | Validation completed |
| HH:MM | Incident closed |

## Trigger

What change, event, or condition appears to have triggered the incident?

Examples:
- Merged workflow edit
- Secret rotation without GitHub update
- Cloudflare auth/token expiration
- Upstream payload schema drift
- Regression in VIN handling
- Bad migration or schema change
- Incorrect reason-code logic
- Manual operator mistake
- Unknown

## Root Cause

State the underlying cause as specifically as possible.

Good:
- `verify` and `deploy` used a job-level `hashFiles(...)` expression that GitHub Actions rejected as invalid in this workflow context, causing the workflows to fail before jobs could run.

Weak:
- CI broke.

If there were multiple contributing causes, separate them:
- **Primary root cause:** <main systems/process cause>
- **Contributing factor(s):**
  - <factor 1>
  - <factor 2>
  - <factor 3>

## Containment

Describe what was done immediately to stop the bleeding.

Examples:
- Paused merges
- Rolled back to last known-good deploy
- Disabled write path
- Blocked outbound messaging
- Rotated credentials
- Switched to manual process
- Skipped deploy until secrets existed

## Resolution

Describe the actual fix that restored service or stability.

- What changed?
- Where was it changed?
- Why did this fix work?
- Was there a rollback, forward-fix, or configuration correction?

## Recovery Validation

List the checks used to confirm the incident was resolved.

- [ ] Broken path manually retested
- [ ] Relevant GitHub Actions workflows green or intentionally skipped
- [ ] Health check passed
- [ ] Representative data sample verified
- [ ] Secrets rotated and confirmed valid
- [ ] No further errors observed in logs
- [ ] Related integration path revalidated

Add specific notes:
- <validation note 1>
- <validation note 2>

## What Went Well

- <thing that helped resolution>
- <tooling/process that worked>
- <good detection or rollback behavior>

## What Went Poorly

- <gap in docs, tests, alerts, or process>
- <delay, ambiguity, or unsafe default>
- <missing guardrail>

## Lessons Learned

Capture the durable lessons, not just one-off observations.

- <lesson 1>
- <lesson 2>
- <lesson 3>

## Corrective Actions

Separate immediate hardening from longer-term prevention.

| Action | Type | Owner | Priority | Due date | Status |
|--------|------|-------|----------|----------|--------|
| <specific fix> | Immediate | <name> | High | YYYY-MM-DD | Open |
| <specific test/guardrail> | Preventive | <name> | High | YYYY-MM-DD | Open |
| <doc/runbook update> | Preventive | <name> | Medium | YYYY-MM-DD | Open |

## Follow-up Changes to Consider

Use this section for TAV-AIP-specific hardening ideas.

- Add or strengthen CI guards
- Add workflow syntax validation before merge
- Add a test fixture for the failing case
- Add `.claude/rules/` guidance for the failure mode
- Add a safer deploy prerequisite check
- Add schema/view invariant tests
- Add health-check diagnostics
- Add secret rotation checklist
- Add integration payload contract test

## References

- Workflow run: <URL>
- Commit: <SHA/URL>
- PR: <URL>
- Incident thread/notes: <URL or file path>
- Related docs: `docs/RUNBOOK.md`, `docs/architecture.md`, `CLAUDE.md`
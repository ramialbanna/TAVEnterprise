# Migration and Rollout Plan — V2 Opportunities

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`, `V3+`

This document defines how the platform should move from the current production
system to v2/v3 without disrupting live acquisition work.

## Rollout Principles

- Build from clean `main`.
- Keep changes milestone-scoped.
- Prefer read-only proof before mutation.
- Preserve existing production ingestion and MMR behavior.
- Do not remove AppSheet/manual workflows until replacement usage is proven.
- Every implementation PR must cite FR IDs and tests.

## Phase 0 — Control Layer

Milestone: pre-v2  
Status: this PR

Required artifacts:

- Project charter and business requirements.
- FRD, schema, state machines, API, UX, tests.
- Current/final architecture maps.
- New-developer handoff and implementation index.

Go/no-go:

- PR checks pass.
- Obsidian mirrors point to current docs.
- No code behavior changes included.

## Phase 1 — Read-Only Opportunities

Milestone: `V2-Core`

Scope:

- `GET /app/opportunities`
- `GET /app/opportunities/:id`
- Opportunities table.
- Preview pane.
- Detail route shell.
- Badges for near-miss, seen-before, price change, VIN appeared, estimated mileage/style/MMR.

Out of scope:

- Claim writes.
- Assignment writes.
- Manual submission.
- Offers/counters.
- Dispositions/validation.

Go/no-go:

- Tests from [09-test-strategy.md](09-test-strategy.md) first-slice section pass.
- Live page renders with real data or honest empty state.
- No mutation UI is active.

## Phase 2 — Manual Submission and Duplicate Awareness

Milestone: `V2-Core`

Scope:

- Buyer/finder link submission.
- Optional facts and recommended closer.
- Existing-candidate/opportunity warning.
- Separate event/row for repeated/manual sightings.

Go/no-go:

- Duplicate warning includes who/when if known.
- Manual submission never silently discards a URL.
- Existing group-chat behavior is honored structurally.

## Phase 3 — Claim and Assignment

Milestone: `V2-Core`

Scope:

- Claim as first required action.
- 24-hour claim window.
- Admin assignment/reassignment.
- Prior evaluator/claim warning.

Go/no-go:

- Concurrent claim test allows exactly one owner.
- Claim history is retained.
- All buyers/closers can still see the queue.

## Phase 4 — Touches and Cutover Readiness

Milestone: `V2.5`

Scope:

- `lead_touches` or equivalent contact timeline.
- On-duty/off-duty readiness if approval routing is next.
- AppSheet shadow/cutover measurement.
- Shared event substrate if needed before offers.

Default cutover criterion:

```text
AppSheet closer screens are decommissioned 14 calendar days after the new
dashboard handles at least 95% of daily lead intake without a P1 incident.
```

## Phase 5 — Offers, Counters, Dispositions, Validation

Milestone: `V3`

Scope:

- Offer/counter records.
- Approval gate by tier.
- Dispositions.
- Validator workflow.
- Dashboard modes.

Go/no-go:

- Offer-level audit fields present.
- Rejections require reason.
- Dispositions are immutable except admin correction.
- Validation mode is explicit.

## Phase 6 — Governance

Milestone: `V3+`

Scope:

- Approval SLA timers.
- Delegated approval.
- Full approval audit analytics.
- Admin-only fraud/drift dashboards.

Go/no-go:

- On-duty/routing/escalation policy exists.
- Normal approval path has production evidence.
- Access controls are admin-only.

## Rollback Playbook

| Phase | Rollback |
|---|---|
| Read-only Opportunities | Hide nav link or revert PR; no data mutation. |
| Manual submission | Disable form route; keep submitted records for audit. |
| Claim/assignment | Disable mutation buttons/routes; preserve claim history. |
| Touches | Disable add-touch action; keep timeline read-only. |
| Offers/dispositions | Disable customer-facing send/dispose actions; preserve records. |
| Governance | Disable analytics/timer jobs; keep raw workflow data. |


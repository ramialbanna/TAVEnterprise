# Metrics and Observability — V2 Opportunities

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`, `V3+`

This document defines the metrics and signals needed to operate the buying-side
platform. It is not a dashboard implementation plan; it tells future PRs which
events and fields they must preserve so dashboards can be trusted.

## North Star

| Metric | Milestone | Definition | Why It Matters |
|---|---|---|---|
| Time from opportunity available to first human action | `V2-Core` | `first_action_at - opportunity_available_at` | Measures whether the queue helps the team move faster. |

As the workflow matures, the north star becomes:

```text
time from opportunity available -> first seller/customer contact -> offer decision -> final disposition
```

## Health Metrics

| ID | Metric | Milestone | Source | Owner |
|---|---|---|---|---|
| M-001 | Opportunities created per source per hour/day | `V2-Core` | read model / ingest runs | Ops |
| M-002 | Near-miss volume by reason/filter | `V2-Core` | rejected/filtered candidates | Ops |
| M-003 | Repeated sightings per vehicle candidate | `V2-Core` | candidate/run linkage | Ops |
| M-004 | Price-change opportunities surfaced | `V2-Core` | badge derivation | Ops |
| M-005 | VIN-appeared opportunities surfaced | `V2-Core` | badge derivation | Ops |
| M-006 | Estimated mileage/style/MMR count | `V2-Core` | estimate fields | Ops |
| M-007 | Claim queue depth by owner/status | `V2-Core` | claim table/events | Team lead |
| M-008 | Claims expiring within next 2 hours | `V2-Core` | claim expiration | Team lead |
| M-009 | Manual submissions by finder/closer | `V2-Core` | manual submission records | Team lead |

## Quality Metrics

| ID | Metric | Milestone | Source | Notes |
|---|---|---|---|---|
| M-010 | Opportunity-to-claim rate | `V2-Core` | opportunities + claims | Shows queue quality. |
| M-011 | Claim-to-contact rate | `V2.5` | claims + touches | Requires touch capture. |
| M-012 | Contact-to-offer rate | `V3` | touches + offers | Requires offer workflow. |
| M-013 | Offer-to-accepted rate | `V3` | offers/counters/dispositions | Measures closing quality. |
| M-014 | Disposition validation agreement rate | `V3` | disposition validation | Training signal. |
| M-015 | Override/dispute rate by closer | `V3` | validation records | Coaching signal, not public shaming. |

## Governance Metrics

| ID | Metric | Milestone | Access |
|---|---|---|---|
| M-016 | Approval queue age | `V3+` | Admin/VIP |
| M-017 | Approver/submitter pair frequency | `V3+` | Admin-only |
| M-018 | Approval-to-disposition drift | `V3+` | Admin-only |
| M-019 | Above-threshold approval frequency | `V3+` | Admin/VIP |
| M-020 | Delegated approval usage | `V3+` | Admin-only |

## Required Events

These events are named conceptually; exact implementation may use tables,
logs, or a shared `lead_events` table per [03-data-model.md](03-data-model.md).

| Event | Milestone | Required Fields |
|---|---|---|
| `opportunity_seen` | `V2-Core` | opportunity/candidate/run/source, first_seen/last_seen. |
| `opportunity_badged` | `V2-Core` | badge type, source evidence, estimated flag. |
| `manual_submission_created` | `V2-Core` | submitter, URL, optional closer, duplicate match result. |
| `claim_created` | `V2-Core` | owner, claimed_at, expires_at, prior owner if any. |
| `claim_released_or_expired` | `V2-Core` | owner, reason, actor or system. |
| `touch_created` | `V2.5` | actor, channel, outcome, notes metadata. |
| `offer_created` | `V3` | submitter, amount, required tier, status. |
| `offer_approved_or_rejected` | `V3` | approver, decision, reason when rejected. |
| `disposition_created` | `V3` | actor, outcome, required facts snapshot. |
| `validation_decided` | `V3` | validator, decision, override/dispute reason. |

## Dashboards

| Dashboard | Milestone | Audience | Purpose |
|---|---|---|---|
| Opportunities health | `V2-Core` | Rami / team lead | See queue volume, freshness, and badges. |
| Working queue | `V2-Core` | Buyers/closers | See open/claimed/assigned/working opportunities. |
| Ingestion health | Existing / `V2-Core` | Ops | Ensure sources are producing data. |
| Touch and claim operations | `V2.5` | Team lead | See contact progress and stale work. |
| Offer/approval operations | `V3` | Senior/VIP | See pending decisions and outcomes. |
| Governance analytics | `V3+` | Admin-only | Detect drift, bottlenecks, and abuse patterns. |

## Logging Rules

- Logs may include IDs, enum codes, counts, durations, and request IDs.
- Logs must not include secrets, bearer tokens, customer PII, or licensed MMR
  payloads.
- Licensed values can be stored/displayed only through approved application
  surfaces.
- Public GitHub/Obsidian notes should use field names and classifications, not
  live licensed values.


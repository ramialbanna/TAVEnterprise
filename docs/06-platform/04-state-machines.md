# State Machines — Buying-Side Platform

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`, `V3+`

This document defines the allowed workflow transitions for v2/v3. Code must not
invent new workflow states inside implementation PRs. If a PR needs a transition
not listed here, update this doc and the related FR/API/test docs first.

## State Machine Index

| ID | Machine | Milestone | FRs |
|---|---|---|---|
| SM-OPP-001 | Opportunity lifecycle | `V2-Core` | FR-001, FR-003, FR-018 |
| SM-OPP-002 | Opportunity event/badge lifecycle | `V2-Core` | FR-004..010, FR-015 |
| SM-OPP-003 | Manual submission lifecycle | `V2-Core` | FR-011..013 |
| SM-CLAIM-001 | Claim lifecycle | `V2-Core` | FR-014..016 |
| SM-ASSIGN-001 | Assignment lifecycle | `V2-Core` | FR-013, FR-017 |
| SM-TOUCH-001 | Touch lifecycle | `V2.5` | FR-020 |
| SM-OFFER-001 | Offer/approval lifecycle | `V3` | FR-024..028 |
| SM-DISPOSITION-001 | Disposition lifecycle | `V3` | FR-029 |
| SM-VALIDATION-001 | Disposition validation lifecycle | `V3` | FR-030 |
| SM-GOV-001 | Approval governance lifecycle | `V3+` | FR-032..034 |

## Shared Rules

- Workflow writes are server-side only.
- State transitions must write actor, timestamp, and reason when applicable.
- Read-only badges may be derived, but persisted workflow state must have a
  single owner table.
- No transition deletes history.
- Estimated values are state/context flags, not confirmed source facts.

## SM-OPP-001 — Opportunity Lifecycle

Milestone: `V2-Core`  
FRs: FR-001, FR-003, FR-018

Opportunity starts as a read model. These states are product-facing states, not
necessarily a persisted `opportunities.status` column until OQ-001 is decided.

| Current | Event | Next | Actor | Guards | Side effects |
|---|---|---|---|---|---|
| `unseen` | system surfaces row | `new` | system | Lead/near-miss/manual/repeat signal exists. | Row appears in queue. |
| `new` | assign | `assigned` | admin/finder if allowed | Eligible assignee; OQ-008 decided/defaulted. | Write assignment. |
| `new` | claim | `claimed` | buyer/closer/admin | Claimable and no active claim. | Write active claim. |
| `assigned` | claim by assignee | `claimed` | assigned closer | Claimable and no active claim. | Write active claim. |
| `assigned` | admin reassign | `assigned` | admin | Eligible new assignee. | Supersede prior assignment. |
| `claimed` | add touch/contact | `contacted` | claim owner/admin | Touch support exists. | Write touch/event. |
| `contacted` | working negotiation | `negotiating` | claim owner/admin | Status mutation enabled. | Write event/status. |
| `new/assigned/claimed/contacted/negotiating` | pass/suppress | `passed` | authorized user/admin | Reason required when configured. | Write event; hide by default. |
| any active | stale/removed by system | `stale` | system | Source stale/removed. | Preserve history; hide by default. |
| any active | duplicate confirmed | `duplicate` | system/admin | Duplicate confidence/policy. | Preserve duplicate context. |
| `negotiating` | seller accepts | `ready_for_purchase` | closer/admin | V3 offer/disposition support. | Write event. |
| `ready_for_purchase` | purchased | `purchased` | admin/system | Purchase outcome exists. | Link outcome. |
| terminal | archive | `archived` | admin/system | Retention policy. | Hide from active queue. |

Open questions:

- OQ-003: exact day-one statuses.
- OQ-001: read model vs persisted opportunity table.

## SM-OPP-002 — Event/Badge Lifecycle

Milestone: `V2-Core`  
FRs: FR-004..010, FR-015

Badges can be derived from existing data for the first read-only slice. Persist
as `opportunity_events` only when needed for workflow history.

| Event | Badge/state | Guards | Side effects |
|---|---|---|---|
| First known listing/candidate sighting | `First seen` | No prior sighting for candidate/listing. | Optional event. |
| Later sighting of same candidate/listing | `Seen again #N` | Prior sighting exists. | Preserve run identity. |
| Listing price differs from prior captured price | `Price changed` | Prior and current price exist. | Recompute spread if MMR exists. |
| Later sighting has VIN where prior did not | `VIN appeared` | Valid VIN present; prior identity weaker. | Prefer VIN valuation if available. |
| Mileage differs from prior captured mileage | `Mileage changed` | Prior and current mileage exist. | Mark updated row. |
| Year known, mileage missing | `Estimated miles` | Explicit mileage absent. | Calculate 15k/year estimate. |
| Style missing, catalog styles exist | `Estimated style` | First style selected as fallback. | Mark style estimated. |
| MMR uses estimated mileage or style | `Estimated MMR` | Valuation uses inferred input. | Mark valuation estimated. |
| Filtered/scored row is reviewable | `Near miss` | From `filtered_out`/score context. | Show reason/filter context. |
| Duplicate match is useful but uncertain | `Possible duplicate` | Fuzzy/low-confidence match. | Do not collapse rows. |
| User opens already claimed/evaluated row | `Already evaluated/claimed` | Claim/evaluation exists. | Show who/when warning. |

## SM-OPP-003 — Manual Submission Lifecycle

Milestone: `V2-Core`  
FRs: FR-011..013

| Current | Event | Next | Actor | Guards | Side effects |
|---|---|---|---|---|---|
| `draft` | submit URL | `submitted` | finder/buyer/admin | Valid URL. | Create manual submission. |
| `submitted` | match existing candidate/listing | `matched` | system | Candidate/listing match exists. | Link match; show seen-before warning. |
| `submitted` | no match | `unmatched` | system | No match found. | Queue as manual opportunity. |
| `submitted/matched/unmatched` | assign closer | `assigned` | finder/admin | Eligible closer. | Write assignment. |
| `submitted/matched/unmatched/assigned` | claim | `claimed` | closer/buyer/admin | Claimable. | Write claim. |
| any non-terminal | admin suppress | `suppressed` | admin | Reason provided. | Hide by default; preserve history. |

Open questions:

- OQ-006: minimum payload beyond URL.
- OQ-007: duplicate manual submission behavior.
- OQ-008: who can assign during first live testing.

## SM-CLAIM-001 — Claim Lifecycle

Milestone: `V2-Core`  
FRs: FR-014..016

| Current | Event | Next | Actor | Guards | Side effects |
|---|---|---|---|---|---|
| none | claim | `active` | buyer/closer/admin | No active claim. | Set `claimed_at`, `expires_at = claimed_at + 24h`. |
| none | concurrent claim loses | none | buyer/closer/admin | Active claim created first. | Return owner/timestamp warning. |
| `active` | release | `released` | claim owner/admin | Reason if required. | Preserve claim history. |
| `active` | expiration reached | `expired` | system/read model | `expires_at < now()`. | Eligible for reassignment/reclaim. |
| `active` | admin supersedes | `superseded` | admin | Reassignment or correction. | New claim may be written. |
| `expired/released/superseded` | claim again | `active` | buyer/closer/admin | No active claim. | New claim row. |

Rules:

- Active-claim uniqueness must be enforced server-side.
- Do not use a partial index with `now()`; use a status field or DB function.
- Expiration does not delete or erase the prior owner.

Open question:

- OQ-004: auto-release vs eligible-for-reassignment. Default: eligible only.

## SM-ASSIGN-001 — Assignment Lifecycle

Milestone: `V2-Core`  
FRs: FR-013, FR-017

| Current | Event | Next | Actor | Guards | Side effects |
|---|---|---|---|---|---|
| none | assign | `active` | finder/admin | Eligible closer; OQ-008 defaulted/decided. | Write assignment. |
| `active` | reassign | `superseded` + new `active` | admin | Eligible closer; reason if required. | Supersede old assignment. |
| `active` | clear assignment | `cleared` | admin | Reason if required. | Queue remains visible. |
| any | assigned user deactivated | `invalid` | system/admin | User inactive. | Admin correction required. |

Rules:

- Assignment does not hide the row from other buyers/closers in first live
  testing.
- Claim and assignment are related but distinct.

## SM-TOUCH-001 — Touch Lifecycle

Milestone: `V2.5`  
FRs: FR-020

Touches are append-only facts, not status by themselves.

| Current | Event | Next | Actor | Guards | Side effects |
|---|---|---|---|---|---|
| none | add touch | `recorded` | buyer/closer/admin | Touch type valid. | Append touch. |
| `recorded` | admin correction | `corrected` | admin | Correction reason. | Append correction event; do not rewrite history silently. |

Valid touch types:

- `call`
- `sms`
- `email`
- `note`
- `other`

## SM-OFFER-001 — Offer/Approval Lifecycle

Milestone: `V3`  
FRs: FR-024..028  
ADR: `ADR-0001`

| Current | Event | Next | Actor | Guards | Side effects |
|---|---|---|---|---|---|
| none | draft offer | `draft` | closer/senior/VIP | Amount valid. | Create offer. |
| `draft` | submit | `pending_approval` | junior/closer/senior above ceiling | Approval required. | Record required approver tier. |
| `draft` | self-approve/send | `approved` | senior/VIP | Tier allows. | Record approval actor/time. |
| `pending_approval` | approve | `approved` | eligible approver | Tier sufficient. | Record approver/time. |
| `pending_approval` | reject | `rejected` | eligible approver | Rejection reason. | Record rejection. |
| `approved` | send to customer | `sent` | authorized user | Offer not expired/superseded. | Record sent time. |
| `sent` | customer accepts | `accepted` | closer/admin | Acceptance confirmed. | Ready for disposition/purchase. |
| `sent` | customer declines | `declined` | closer/admin | Decline confirmed. | Can create counter/new offer. |
| `sent/approved/pending_approval` | supersede | `superseded` | closer/system | New offer exists. | Link superseding offer. |
| `sent/approved/pending_approval` | expire | `expired` | system | `expires_at < now()`. | No longer active. |

Rules:

- Approvers approve/reject; they do not edit submitter amount.
- Rejection reason is required.
- First offer implementation records offer-level audit only.
- Full approval audit, SLA timers, and delegated approval are `V3+`.

## SM-DISPOSITION-001 — Disposition Lifecycle

Milestone: `V3`  
FRs: FR-029

| Current | Event | Next | Actor | Guards | Side effects |
|---|---|---|---|---|---|
| active opportunity | dispose won | `won` | closer/admin | Required won fields. | Write disposition. |
| active opportunity | dispose lost | `lost` | closer/admin | Reason required. | Write disposition. |
| active opportunity | dispose duplicate | `duplicate` | closer/admin/system | Duplicate context. | Link duplicate if available. |
| active opportunity | dispose stale/removed | `stale_removed` | system/admin | Source status. | Preserve source context. |
| disposition exists | admin correction | `corrected` | admin | Correction reason. | Append correction; preserve original. |

Disposition types should be finalized in the glossary/data dictionary before
migration.

## SM-VALIDATION-001 — Disposition Validation Lifecycle

Milestone: `V3`  
FRs: FR-030

| Current | Event | Next | Actor | Guards | Side effects |
|---|---|---|---|---|---|
| not required | policy selects | `pending` | system | Validation mode. | Queue for validation. |
| `pending` | approve | `approved` | validator | Eligible validator. | Record validation. |
| `pending` | override | `overridden` | validator | Override reason/grade. | Record coaching signal. |
| `pending` | dispute | `disputed` | validator | Dispute reason. | Admin review later. |

Validation modes from business requirements:

- `all`
- `juniors_only`
- `sample_10`
- `off`

Open question:

- OQ-016: validators validating leads they touched. Default: block.

## SM-GOV-001 — Approval Governance Lifecycle

Milestone: `V3+`  
FRs: FR-032..034

These are intentionally deferred. They must not be smuggled into first offer PRs.

| Feature | Required prior state | Why |
|---|---|---|
| Approval SLA timers | on-duty/off-duty, eligible approver routing, notification transport | Timer without escalation ownership is noise. |
| Delegated approval | stable tier model, full audit, revocation policy | Delegation changes authority boundaries. |
| Approval analytics | shared event substrate, enough production data | Prevent noisy or misleading fraud/control reports. |

## First Code PR State Boundary

The first v2 code PR may implement:

- read-only `SM-OPP-001` row derivation
- read-only `SM-OPP-002` badges
- no persisted workflow transitions

It must not implement:

- `SM-CLAIM-001`
- `SM-ASSIGN-001`
- `SM-OPP-003`
- offers
- dispositions
- validation
- governance


# Functional Requirements — Buying-Side Platform

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`, `V3+`

This document converts the v2/v3 strategy into numbered, testable functional
requirements. Implementation PRs must cite the FR IDs they implement.

Primary sources:

- `docs/06-platform/source/TAV_Platform_Full_Review.md`
- `docs/06-platform/00-project-charter.md`
- `docs/06-platform/01-business-requirements.md`
- `docs/06-platform/13-open-questions-log.md`
- `docs/06-platform/15-current-architecture-map.md`
- `docs/06-platform/16-final-outcome-architecture-map.md`
- `docs/06-platform/19-v2-implementation-index.md`

## Traceability Rule

Every implementation PR must preserve this chain:

```text
Review source -> BR -> FR -> schema -> state machine -> API -> UX -> tests
```

Downstream docs are not written yet, so this FRD names planned schema/state/API
surfaces. The later docs must reuse these names or deliberately update this FRD.

## Milestone Tags

| Tag | Meaning |
|---|---|
| `V2-Core` | First live Opportunities workflow. |
| `V2.5` | Post-queue readiness before full negotiation. |
| `V3` | Offers, approvals, dispositions, validation, coaching. |
| `V3+` | Governance and optimization after V3 is proven. |
| `Future` | Useful but not approved now. |
| `Blocked` | Needs an external decision/dependency. |

## Requirement Index

| FR | Name | Milestone | Primary BRs | Planned API/UX |
|---|---|---|---|---|
| FR-001 | Read-only Opportunities queue | `V2-Core` | BR-003, BR-006, BR-013 | `GET /app/opportunities`, `/opportunities` |
| FR-002 | Opportunity preview pane | `V2-Core` | BR-006, BR-010, BR-011, BR-012 | `GET /app/opportunities/:id`, preview pane |
| FR-003 | Opportunity detail page | `V2-Core` | BR-006, BR-010, BR-011, BR-012 | `GET /app/opportunities/:id`, detail page |
| FR-004 | Near-miss visibility | `V2-Core` | BR-003, BR-013 | queue badges/filters |
| FR-005 | Seen-before and duplicate context | `V2-Core` | BR-010, BR-011, BR-012 | queue badges, detail timeline |
| FR-006 | Price-change resurfacing | `V2-Core` | BR-012 | queue badge, detail timeline |
| FR-007 | VIN-appeared resurfacing | `V2-Core` | BR-012 | queue badge, valuation refresh |
| FR-008 | Estimated mileage fallback | `V2-Core` | BR-015 | read model fields, estimated badge |
| FR-009 | Estimated style fallback | `V2-Core` | BR-015 | catalog/style fields, estimated badge |
| FR-010 | MMR valuation display and badges | `V2-Core` | BR-014, BR-015 | `/app/mmr/*`, valuation cards/cells |
| FR-011 | Manual opportunity submission backend | `V2-Core` | BR-004, BR-005, BR-006 | `POST /app/opportunities/manual-submissions` |
| FR-012 | Manual opportunity submission UI | `V2-Core` | BR-004, BR-005 | submit modal/page |
| FR-013 | Optional closer assignment at submission | `V2-Core` | BR-005, BR-008 | closer selector, assignment display |
| FR-014 | Claim an opportunity | `V2-Core` | BR-007, BR-008, BR-009 | `POST /app/opportunities/:id/claim` |
| FR-015 | Claim conflict/prior-evaluation warning | `V2-Core` | BR-010 | warning banner |
| FR-016 | 24-hour working window | `V2-Core` | BR-008 | claim expiration fields |
| FR-017 | Admin assignment/reassignment | `V2-Core` | BR-005, BR-008 | `POST /app/opportunities/:id/assign` |
| FR-018 | Opportunity status and filters | `V2-Core` | BR-006 | queue filters/tabs |
| FR-019 | Live testing readiness | `V2-Core` | BR-016 | smoke/runbook |
| FR-020 | Lead/opportunity touches | `V2.5` | BR-018 | touch composer/timeline |
| FR-021 | On-duty/off-duty readiness | `V2.5` | BR-019 | staff status controls |
| FR-022 | AppSheet cutover telemetry | `V2.5` | BR-017 | admin/reporting view |
| FR-023 | Shared event/audit substrate | `V2.5` | BR-030, BR-031 | internal event writer/timeline |
| FR-024 | Create customer-facing offer | `V3` | BR-020, BR-021, BR-023, BR-030 | offer composer |
| FR-025 | Approval gate | `V3` | BR-020, BR-021, BR-022, BR-023 | offer send gate |
| FR-026 | Approve/reject pending offer | `V3` | BR-021, BR-023, BR-030 | approval queue/actions |
| FR-027 | Record customer counter | `V3` | BR-024 | counter form/timeline |
| FR-028 | Supersede or expire offer | `V3` | BR-023, BR-024 | offer timeline/status |
| FR-029 | Dispose opportunity | `V3` | BR-025 | disposition form |
| FR-030 | Validate disposition | `V3` | BR-026 | validator queue |
| FR-031 | Closer dashboard modes | `V3` | BR-027 | hunting/working/awaiting/disposing |
| FR-032 | Approval SLA timers | `V3+` | BR-032 | escalation/notification layer |
| FR-033 | Delegated approval | `V3+` | BR-033 | delegation policy/admin controls |
| FR-034 | Approval analytics/fraud controls | `V3+` | BR-028, BR-031 | admin analytics |

## V2-Core Requirements

### FR-001 — Read-Only Opportunities Queue

Build the first queue from existing lead/candidate/source data without workflow
mutations. Include leads, active/open work, near-misses, repeated sightings,
price updates, VIN upgrades, and useful estimated-valuation rows.

Acceptance criteria:

- Returns rows from existing `leads`, filtered/scored listings, normalized
  listings, vehicle candidates, source runs, and valuation context where present.
- Preserves source/run identity and one row per operationally relevant sighting.
- Renders an empty state when no rows exist.
- Does not create claims, assignments, offers, dispositions, or manual
  submissions.

Trace: schema `opportunity_read_model`; state `SM-OPP-001`; tests
`T-OPP-001..003`.

### FR-002 — Opportunity Preview Pane

Single-clicking a row opens a preview without leaving the queue. Show all useful
known facts: vehicle, source link, run/source, price, mileage, MMR/spread,
badges, duplicate context, finder/assignee/claim context, and filter/reason
context.

Acceptance criteria:

- Preview updates on row selection and never mutates workflow state.
- Missing fields render as unavailable, not fake data.
- Estimated mileage/style/MMR is badged everywhere it appears.

Trace: schema `opportunity_read_model`; state `SM-OPP-001`; tests
`T-UX-001`, `T-API-OPP-DETAIL-001`.

### FR-003 — Opportunity Detail Page

Double-clicking or opening a row navigates to a full detail page with stable URL,
all preview facts, and future action/timeline areas.

Acceptance criteria:

- Detail URL is stable and shareable internally.
- Detail page does not expose future mutation controls until their FRs are built.
- Missing/archived source states are handled honestly.

Trace: schema `opportunity_read_model`; state `SM-OPP-001`; tests `T-UX-002`.

### FR-004 — Near-Miss Visibility

Show filtered/scored listings as reviewable near-miss opportunities with reason
and filter context. They must remain distinguishable from system-created leads.

Acceptance criteria:

- Near misses are explicitly badged.
- Reason/filter context appears when available.
- Queue filters can show/hide near misses without deleting them.

Trace: schema `filtered_out`, `score_attribution`; tests `T-OPP-NEAR-001`.

### FR-005 — Seen-Before and Duplicate Context

Identify when the same or likely same vehicle has been seen before. Preserve
separate rows with run identity when operationally useful.

Acceptance criteria:

- First-time sightings are labeled.
- Repeat sightings show prior seen timestamp/run context.
- Weak matches are labeled possible duplicate, not certain duplicate.

Trace: schema duplicate keys, `source_runs`; state `SM-OPP-002`; tests
`T-DUPE-001..002`.

### FR-006 — Price-Change Resurfacing

When asking price changes, surface the row as updated and show previous/current
price when both exist.

Acceptance criteria:

- Price-change badge appears.
- Spread is recomputed when MMR and price exist.
- Missing previous price does not invent a change.

Trace: schema listing snapshots, future `opportunity_events`; tests
`T-EVENT-PRICE-001`.

### FR-007 — VIN-Appeared Resurfacing

When a later sighting includes a VIN that earlier sightings lacked, surface it
as updated and prefer VIN-based valuation where available.

Acceptance criteria:

- VIN-appeared badge appears.
- Prior non-VIN context remains visible.
- Invalid VIN never becomes a valid VIN upgrade.

Trace: schema listing snapshots, `valuation_snapshots`; tests
`T-EVENT-VIN-001`.

### FR-008 — Estimated Mileage Fallback

If mileage is missing but year is known, estimate mileage at 15,000 miles/year.
At least one year of age should be used for current-year vehicles unless a later
state/API doc changes this.

Acceptance criteria:

- Explicit mileage is never overwritten.
- Estimated mileage is visibly badged.
- Unknown/future year does not produce invalid mileage.

Trace: derived read-model field `mileageEstimated`; tests `T-EST-MILES-001`.

### FR-009 — Estimated Style Fallback

If style is missing, year/make/model are known, and the live Cox/Manheim catalog
returns styles, select the first catalog style as an estimate.

Acceptance criteria:

- First option fallback is deterministic.
- Estimated style is visibly badged.
- Manual style selection removes the estimated-style badge.
- Any valuation using estimated style is also marked estimated.

Trace: derived field `styleEstimated`; tests `T-EST-STYLE-001`.

### FR-010 — MMR Valuation Display and Estimate Badges

Display real MMR when available through the server-side Cox/Manheim path. YMM
valuation requires style and mileage, explicit or estimated. Basic spread is
`MMR - asking price`.

Acceptance criteria:

- Real valuation renders with source/method.
- Vendor unavailable/not-provisioned/no-data renders honest unavailable state.
- Estimated mileage/style makes the valuation estimated.
- Browser never calls Cox/Manheim directly.

Trace: schema `valuation_snapshots`; API `/app/mmr/vin`, `/app/mmr/ymm`; tests
`T-MMR-001..003`.

### FR-011 — Manual Opportunity Submission Backend

Allow authenticated users to submit a listing URL and optional facts. This
preserves the current group-chat intake flow in structured form.

Acceptance criteria:

- URL-only submission succeeds.
- Optional fields include year/make/model/style, price, mileage, source/region,
  notes, and optional closer.
- Duplicate match returns seen-before warning rather than silently discarding.

Trace: schema `manual_submissions` or equivalent; state `SM-OPP-003`; tests
`T-MANUAL-001..002`.

### FR-012 — Manual Opportunity Submission UI

Provide a UI to submit a listing link, optional facts, and optional closer
routing from the web app.

Acceptance criteria:

- URL is required and validated.
- Optional fields can be left blank.
- Success returns or links to the created/updated opportunity.
- Duplicate/seen-before warning is visible when returned.

Trace: UX submit modal/page; tests `T-UX-MANUAL-001`, `T-E2E-MANUAL-001`.

### FR-013 — Optional Closer Assignment at Submission

Finder/buyer may route a submitted opportunity to a specific closer while the
queue remains visible to all buyers/closers during the first live phase.

Acceptance criteria:

- Selected closer is stored and visible.
- Inactive/deactivated closer cannot be assigned.
- Admin can correct assignment later.

Trace: schema `opportunity_assignments`; state `SM-ASSIGN-001`; tests
`T-ASSIGN-001`.

### FR-014 — Claim an Opportunity

Claim is the first required work action. Claiming is server-side, atomic, and
starts a 24-hour working window.

Acceptance criteria:

- Exactly one concurrent claim succeeds.
- Owner, claimed_at, and expires_at are recorded.
- Claim history is auditable.

Trace: schema `opportunity_claims`; state `SM-CLAIM-001`; tests
`T-CLAIM-001..002`.

### FR-015 — Claim Conflict and Prior-Evaluation Warning

When a user opens, evaluates, or tries to claim an opportunity already evaluated
or claimed by someone else, show who and when.

Acceptance criteria:

- Warning includes user/system identity and timestamp when available.
- Viewing remains allowed.
- Claim action follows claim state rules.

Trace: schema claims/valuations/events; tests `T-WARN-001`.

### FR-016 — 24-Hour Working Window

Successful claim creates a 24-hour window. Expiration should mark eligible for
reassignment unless the state-machine doc later chooses auto-release.

Acceptance criteria:

- Expiration is calculated server-side.
- UI shows expiration/countdown or expired state.
- Expiration does not delete ownership history.

Trace: state `SM-CLAIM-001`; tests `T-CLAIM-WINDOW-001`.

### FR-017 — Admin Assignment and Reassignment

Admins can assign/reassign opportunities to eligible users. Reassignment is
visible and auditable.

Acceptance criteria:

- Assignment is role-gated.
- Prior assignment history is preserved.
- Reassignment of claimed opportunity follows state-machine rule.

Trace: schema `opportunity_assignments`; state `SM-ASSIGN-001`; tests
`T-ASSIGN-002`.

### FR-018 — Opportunity Status and Filters

The main queue defaults to all active work-relevant rows and supports filters by
status, owner, badge, source, and type.

Acceptance criteria:

- Open/active/claimed/unclaimed/working/leads are visible by default.
- Filters are read-only and do not mutate state.
- Unknown status maps to safe fallback.

Trace: state `SM-OPP-001`; tests `T-FILTER-001`.

### FR-019 — Live Testing Readiness

Before live users test v2, provide smoke checklist, rollback path, known
limitations, and access confirmation for Rami plus one or two users.

Acceptance criteria:

- Smoke checklist exists.
- Known limitations are visible in handoff/runbook.
- No PR claims live readiness without smoke evidence.

Trace: runbook/test strategy; tests smoke checklist.

## V2.5 Requirements

### FR-020 — Lead/Opportunity Touches

Capture calls, SMS, email, notes, contact attempts, and contact outcomes as
timestamped user-attributed touches. Touches are not offers or dispositions.

Acceptance criteria: user can add touch; touch appears in timeline; touch is
auditable.

### FR-021 — On-Duty/Off-Duty Readiness

Define staff availability before real-time approvals or SLA timers depend on
human routing.

Acceptance criteria: authorized user/admin can set availability; future routing
logic can query it.

### FR-022 — AppSheet Cutover Telemetry

Measure whether the new platform can replace AppSheet. Default proposed
criterion: 95% daily intake for 14 days with no P1 incident.

Acceptance criteria: intake coverage and P1 window can be reviewed.

### FR-023 — Shared Event/Audit Substrate

Create append-only events for claims, assignments, touches, statuses,
valuations, offers, counters, dispositions, and validations. This supports full
approval audit and governance analytics later.

Acceptance criteria: events are user/system attributed, append-only, and usable
for timelines.

## V3 Requirements

### FR-024 — Create Customer-Facing Offer

Create offer record with amount, submitter, approval requirement, expiration,
and offer-level audit fields.

Acceptance criteria: amount validated; approval requirement computed
server-side; offer-level audit recorded.

### FR-025 — Approval Gate

Gate customer-facing offer sending by submitter tier, offer amount, and
approval rules.

Acceptance criteria: Junior/Closer require approval; Senior respects ceiling;
VIP can approve all; server enforces.

### FR-026 — Approve or Reject Pending Offer

Approvers approve or reject. They do not edit submitter amount. Rejection
requires reason.

Acceptance criteria: unauthorized approver rejected; approve/reject records
actor, time, and reason when required.

### FR-027 — Record Customer Counter

Customer counters are first-class negotiation records, not notes. Counters that
become customer-facing offers pass the same approval gate.

Acceptance criteria: counter stores amount, source, user, timestamp, and links
to opportunity/offer context.

### FR-028 — Supersede or Expire Offer

Offers can expire or be superseded. History remains visible.

Acceptance criteria: superseded offers remain in history; expired offers are no
longer active.

### FR-029 — Dispose Opportunity

Record final outcome such as won, lost, duplicate, stale, removed, no response,
bought too high, rejected by seller, or approved type.

Acceptance criteria: active workflow can exit through disposition; required
fields vary by type; disposition is auditable.

### FR-030 — Validate Disposition

Post-hoc validators approve, override, or dispute disposition quality. This is
training/calibration, not real-time offer approval.

Acceptance criteria: validator queue shows pending items; validator action is
auditable; self-validation rule follows open-question decision.

### FR-031 — Closer Dashboard Modes

Provide role-aware modes: hunting, working, awaiting, disposing.

Acceptance criteria: each mode has clear list and next action; role/tier changes
visible actions.

## V3+ Requirements

### FR-032 — Approval SLA Timers

Timers require on-duty state, eligible approver routing, escalation policy,
notification transport, and ownership of missed SLA outcomes. Do not implement
inside the first approval PR.

### FR-033 — Delegated Approval

Delegation requires policy, revocation, time windows, dollar ceilings, conflict
rules, and full audit. Do not implement until normal tier approval is proven.

### FR-034 — Approval Analytics and Fraud Controls

Admin-only analytics report approver/submitter frequency,
approval-to-MMR drift, disposition-grade drift, and override patterns. Requires
shared events and enough production data.

## First Implementation Slice Gate

The first v2 code PR may implement only:

- FR-001
- FR-002
- the read-only parts of FR-004 through FR-010

It must not implement:

- claim mutation
- assignment mutation
- manual submission mutation
- offer/counter/disposition/validation mutation
- approval governance

## Open Questions That Block Detailed Design

These must be resolved or explicitly defaulted before schema/API contracts are
finalized:

- OQ-001: read model only vs persisted `opportunities` table
- OQ-002: all filtered/scored listings vs thresholded near misses
- OQ-003: day-one statuses
- OQ-004: auto-release vs eligible-for-reassignment after claim expiration
- OQ-006: minimum manual submission payload
- OQ-007: duplicate manual submission behavior
- OQ-008: who can assign in first live testing
- OQ-025: whether implementation PRs are blocked without FR/ADR IDs
- OQ-026: read-only shadow vs limited live test


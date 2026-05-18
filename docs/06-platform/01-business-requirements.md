# Business Requirements — Buying-Side Platform

Status: Draft control doc
Date: 2026-05-18
Primary source: `docs/06-platform/source/TAV_Platform_Full_Review.md`

This document captures business rules in business language. It intentionally
separates `V2-Core` requirements from `V2.5` and `V3` rules so future platform
concepts do not accidentally become immediate implementation scope.

## Requirement Tags

| ID | Requirement | Milestone | Source |
|---|---|---|---|
| BR-001 | The platform is buying-side only: acquisition, opportunity review, closing workflow, and related audit. | `V2-Core` | Charter / Review scope |
| BR-002 | Logistics, titles, money movement, AR, and customer portal remain out of scope. | `V2-Core` | Review scope |
| BR-003 | Opportunities are the v2 operating surface; they can derive from leads, near-misses, repeated sightings, price updates, VIN upgrades, estimated valuations, and manual submissions. | `V2-Core` | V2 Opportunities spec |
| BR-004 | Manual buyer/finder submission must preserve current group-chat behavior while making it structured and auditable. | `V2-Core` | V2 Opportunities spec |
| BR-005 | Finder and closer are distinct business roles; the finder may recommend or assign a closer. | `V2-Core` | V2 Opportunities spec |
| BR-006 | All buyers and closers can see the entire Opportunities queue during the first live testing phase. | `V2-Core` | V2 Opportunities spec |
| BR-007 | Claim is the first required workflow action before working an opportunity. | `V2-Core` | V2 Opportunities spec |
| BR-008 | A claim grants a 24-hour working window unless a later decision changes the rule. | `V2-Core` | V2 Opportunities spec |
| BR-009 | Server-side claim concurrency must prevent silent double-ownership. | `V2-Core` | V2 Opportunities spec |
| BR-010 | If a user opens, evaluates, or runs MMR on an already evaluated/claimed opportunity, the UI must show who evaluated/claimed it and when. | `V2-Core` | V2 Opportunities spec |
| BR-011 | Repeated sightings stay visible as separate rows with candidate/run context; do not silently collapse them. | `V2-Core` | V2 Opportunities spec |
| BR-012 | Price changes, VIN appearances, mileage changes, and estimate updates should surface as Opportunity events/badges. | `V2-Core` | V2 Opportunities spec |
| BR-013 | Near-miss listings should remain reviewable with filter/reason context. | `V2-Core` | User decision / V2 Opportunities spec |
| BR-014 | Basic spread is the only v2 economics metric: MMR minus asking price. | `V2-Core` | User decision |
| BR-015 | Estimated mileage, estimated style, and estimated MMR are allowed only when visibly badged. | `V2-Core` | User decision |
| BR-016 | First live users are expected to be Rami and one or two others. | `V2-Core` | User decision |
| BR-017 | AppSheet remains the incumbent workflow until a written cutover criterion is met. | `V2.5` | Review E.3.3 |
| BR-018 | Lead/contact touches should capture calls, SMS, email, notes, and contact outcomes before full offer automation. | `V2.5` | Review E.1.4 |
| BR-019 | On-duty/off-duty state is needed before tiered approval routing is operationally safe. | `V2.5` | Review E.1.2 |
| BR-020 | Tier model gates only customer-facing offer submission, not claiming, working, internal review, or marking lost. | `V3` | Review A |
| BR-021 | Junior Closers and Closers cannot send offers without approval; Senior Closers can self-approve at or below the chosen ceiling; VIP Closers can approve all offers. | `V3` | Review A |
| BR-022 | The review proposes a Senior self-approval ceiling of $200,000; this is a default pending explicit lock. | `V3` | Review A / Open question |
| BR-023 | All customer-facing offers and counters must pass the same approval gate. | `V3` | Review B |
| BR-024 | Customer counters are first-class records, not notes attached to offers. | `V3` | Review B |
| BR-025 | Every lead leaving the active pipeline should eventually have one final disposition, except system stale/removed cases defined by policy. | `V3` | Review C |
| BR-026 | Validator queue is post-hoc training and calibration, not the same thing as real-time offer approval. | `V3` | Review C |
| BR-027 | The closer dashboard should be role-aware and mode-aware: hunting, working, awaiting, disposing. | `V3` | Review D |
| BR-028 | Fraud/collusion analytics around approver/submitter frequency and approval-to-MMR drift are admin-only controls. | `V3` | Review E.2.2 |
| BR-029 | Experiment infrastructure such as `bucket_id` is cheap to add early but does not require experiment workflows in v2. | `V2.5` | Review E.1.6 |
| BR-030 | The first `lead_offers` PR records minimum offer-level approval audit on the offer row; full cross-workflow audit is a later governance layer. | `V3` | [ADR-0001](14-decision-records/ADR-0001-progressive-approval-governance.md) |
| BR-031 | Full approval audit requires shared event infrastructure across claims, touches, offers, statuses, and dispositions. | `V3+` | [ADR-0001](14-decision-records/ADR-0001-progressive-approval-governance.md) |
| BR-032 | Approval SLA timers require on-duty state, eligible approver routing, escalation policy, and notification transport before implementation. | `V3+` | [ADR-0001](14-decision-records/ADR-0001-progressive-approval-governance.md) |
| BR-033 | Delegated approval is not part of the first approval implementation; it requires a separate delegation policy after normal tier approval is proven. | `V3+` | [ADR-0001](14-decision-records/ADR-0001-progressive-approval-governance.md) |

## V2-Core Business Rules

### Opportunity Sources

The first live queue includes:

- created leads
- near-miss listings
- manually submitted listing links
- repeated sightings
- price changes
- VIN upgrades
- estimated mileage/style valuation updates
- active working opportunities

### Claim and Assignment

- Claim is the first required action.
- The claim window is 24 hours for `V2-Core`.
- Admins can assign or reassign.
- A finder can recommend or choose a closer during manual submission.
- Reassignment and claim changes must be auditable.
- Claim expiration does not delete history.

### Display and Review

- The table, preview pane, and detail page must show finder, assignee/claimed
  owner, source/run identity, valuation status, and badges.
- Estimated values must be marked wherever displayed.
- Near-misses must show enough reason/filter context to explain why they were
  not created as leads.

## V2.5 Business Rules

- Add contact/touch capture before offer automation.
- Define AppSheet shadow/cutover policy.
- Add on-duty/off-duty and escalation readiness if real-time approvals are next.
- Consider `bucket_id` and outcome instrumentation before training data grows.

## V3 Business Rules

### Tier Model

| Tier | Customer-facing offer without approval | Approval required from |
|---|---|---|
| Junior Closer | Never | Senior or VIP |
| Closer | Never | VIP |
| Senior Closer | Yes, if offer is at or below the approved ceiling | VIP above ceiling |
| VIP Closer | Always | None |

### Offer Rules

- Approvers approve or reject; they do not edit a submitter's amount.
- Rejecting an internal offer is not a customer-facing disposition.
- Superseded offer expiration is informational only.
- Withdrawal is modeled as a superseding offer, not a special action.
- The first `lead_offers` implementation records offer-level audit only:
  submitter, amount, required approver tier, approver, approval/rejection time,
  rejection reason, sent time, expiration, supersession.
- Full approval audit beyond the offer row, approval SLA timers, and delegated
  approval are intentionally deferred until their dependencies exist.

### Approval Governance Deferrals

| Deferred feature | Milestone | Why deferred |
|---|---|---|
| Full approval audit beyond `lead_offers` | `V3+` | A complete audit log spans claims, touches, status changes, offers, counters, dispositions, validators, and users. Building it inside the first offer PR would turn that PR into global event infrastructure. |
| Approval SLA timers | `V3+` | Timers are not useful without on-duty state, eligible approver routing, escalation rules, notification transport, and ownership of missed SLA outcomes. |
| Delegated approval | `V3+` | Delegation creates authority chains, revocation, time windows, dollar ceilings, and conflict-of-interest rules. The normal tier path should be proven first. |

### Disposition and Validation Rules

- Dispositions are training data.
- System grade and closer grade may need separate meanings; this is still open.
- Validation mode can be `all`, `juniors_only`, `sample_10`, or `off`.
- The review recommends `all` for the first 30 days, then `juniors_only`, then
  permanent `sample_10`.

## AppSheet Cutover

Proposed default from the review:

```text
AppSheet closer screens are decommissioned 14 calendar days after the new
dashboard handles at least 95% of daily lead intake without a P1 incident.
```

Milestone: `V2.5`
Status: Proposed default, not locked.

## Business Context

- TAV average purchase price is approximately $45,000.
- Early live testing users are expected to be Rami and one or two others.
- Initial source mix is Apify/Facebook-heavy; more regions/sources are future
  expansion.
- Cox/Manheim MMR is production-bound and server-side only.

## Non-Negotiables

- No browser-to-Cox/Manheim calls.
- No fake catalog, fake MMR, fake people, or fake workflow data.
- No hidden collapse of repeated sightings.
- No implementation outside its milestone tag without an explicit doc change.

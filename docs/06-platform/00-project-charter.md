# Project Charter — Buying-Side Platform

Status: Draft control doc
Date: 2026-05-18
Milestone scope: `V2-Core`, `V2.5`, `V3`

## Problem Statement

Texas Auto Value has a working acquisition-intelligence pipeline, but the human
buying workflow still depends on scattered manual actions: marketplace scraping,
group-chat link sharing, repeated MMR checks, implicit closer routing, and
informal follow-up. The buying-side platform must turn those signals into a
single accountable operating workflow where opportunities can be surfaced,
claimed, assigned, worked, evaluated, and audited.

## In Scope

| Scope | Milestone | Notes |
|---|---|---|
| Opportunities queue for leads, near-misses, repeats, price updates, VIN upgrades, estimate updates, and manual submissions | `V2-Core` | The first live team workflow. |
| Manual buyer/finder submissions with optional assigned closer | `V2-Core` | Preserves current group-chat behavior in structured form. |
| Claim, assign, status, notes, and 24-hour working-window audit | `V2-Core` | First required action is claim. |
| Duplicate/seen-before visibility with run identity | `V2-Core` | Separate rows remain visible; candidate context is shown. |
| Estimated mileage/style/MMR display with clear badges | `V2-Core` | Estimates are allowed only when visibly identified. |
| Lead touches and contact-attempt capture | `V2.5` | Conversation context before the full offer module. |
| On-duty/off-duty and approval-routing readiness | `V2.5` | Needed before tiered offer approvals matter operationally. |
| Offers, counters, approval gates, dispositions, validator queue, coaching, and closer operating dashboard | `V3` | Full buying-side operating system. |

## Out of Scope

| Scope | Milestone | Rationale |
|---|---|---|
| Logistics, titles, money movement, transport, AR, and customer portal | `Future` | Remain in existing systems until buying side is stable. |
| Automated customer messaging or offer sending | `V3` | Requires approval policy, audit, and legal/ops review. |
| ML retraining or automated buy-box optimization | `Future` | Requires validated outcome data first. |
| Public/consumer-facing surfaces | `Future` | Current system is internal staff-only. |
| Re-enabling RuFlo / claude-flow autonomous execution | `Blocked` | Governance incident; explicit approval required. |

## Success Criteria

### V2-Core Success

- A buyer/finder can submit a listing link with relevant facts and optional
  closer routing.
- All useful open opportunities appear in one queue: leads, near-misses,
  repeated sightings, price changes, VIN upgrades, and estimate updates.
- A closer can claim an opportunity server-side without silent race conditions.
- Users can see who found, assigned, claimed, and last evaluated an opportunity.
- A 24-hour claim window is visible and audited.
- Estimated mileage/style/MMR values are displayed only with badges.
- Duplicate/seen-before context is visible without collapsing run-level rows.

### V2.5 Success

- Contact attempts and notes are captured as lead/opportunity touches.
- Assignment and claim behavior are observable enough for live team testing.
- The AppSheet cutover plan has measurable readiness criteria.

### V3 Success

- Offers and customer counters are first-class records.
- Tiered approval gates are enforced server-side.
- Dispositions and validation create trustworthy training data.
- Closer dashboard state matches the real working mode: hunting, working,
  awaiting, disposing.

## Stakeholders and Arbiter

| Role | Responsibility |
|---|---|
| Business owner | Defines operating workflow and final product decisions. |
| Decision arbiter | Makes final calls when requirements conflict. Default: Rami Albanna until delegated. |
| Buyers / finders | Surface marketplace opportunities and submit context. |
| Closers | Claim, work, and disposition opportunities. |
| Admins | Manage assignment, corrections, users, and audit. |
| Engineering agents | Implement only against approved FRs, ADRs, state machines, and milestone tags. |

## Glossary

| Term | Meaning |
|---|---|
| Opportunity | Buyer-facing work item derived from leads, near-misses, repeats, price changes, VIN upgrades, estimate updates, or manual submissions. |
| Lead | Existing system-created scored record tied to a normalized listing. One source of Opportunities. |
| Finder | Person who found/submitted the listing. Often a buyer in the current manual workflow. |
| Closer | Person expected to contact/negotiate/work the opportunity. |
| Assignee | Current closer expected to work the opportunity. |
| Claim | Server-side action that starts a working window for a user. |
| MMR | Manheim Market Report valuation. |
| Cox / Manheim | Licensed valuation and catalog provider used server-side only. |
| Buybox | TAV's target buying criteria and scoring logic. |
| Near miss | Listing that did not become a lead but remains reviewable due score/filter context. |
| Estimated MMR | MMR calculated using estimated mileage or estimated style. Must be badged. |
| AppSheet | Current incumbent workflow surface that the buying-side platform may eventually replace. |

## Operating Principles

- Preserve the four-concept rule: Raw Listing, Normalized Listing, Vehicle
  Candidate, Lead.
- Do not collapse an Opportunity into a source-of-truth concept unless a later
  ADR approves it.
- Keep source/run identity visible for repeated sightings.
- Never fabricate MMR, catalog, buyer, closer, or workflow data.
- Prefer auditable workflow events over hidden UI-only state.
- When uncertain, log an open question rather than implement a guess.


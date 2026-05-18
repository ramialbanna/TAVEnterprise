# ADR-0001 — Progressive Approval Governance

Status: Accepted
Date: 2026-05-18
Milestones: `V3`, `V3+`

## Context

The platform review defines a future buying-side operating system with tiered
offer approval, customer counters, dispositions, validator workflows, SLA
concerns, and audit needs. During review, three approval-adjacent features were
called out as out of scope for the first `lead_offers` implementation:

- full approval audit beyond the `lead_offers` row itself
- SLA timers on the approval step
- delegated approval

These features are important, but they depend on broader workflow primitives
that do not exist in the first approval slice.

## Decision

Build approval governance progressively.

The first `lead_offers` implementation will:

- enforce tier-based customer-facing offer submission gates
- record minimum offer-level audit fields on `lead_offers`
- support approve/reject with reason
- preserve offer/counter/supersession history

It will not implement:

- global approval audit analytics beyond the offer row
- approval SLA timers
- delegated approval

Those features move to `V3+` and require their dependencies to exist first.

## Required Dependencies

| Deferred feature | Dependencies |
|---|---|
| Full approval audit | `tav.users`, claim events, assignment events, `lead_touches`, `lead_offers`, status transitions, dispositions, validator actions, shared `lead_events` or equivalent audit substrate. |
| Approval SLA timers | on-duty/off-duty state, eligible approver routing, escalation policy, notification transport, missed-SLA ownership. |
| Delegated approval | stable tier model, production-proven normal approval path, delegation grant/revoke policy, duration, dollar ceiling, conflict-of-interest rules, full audit visibility. |

## Consequences

Good:

- The first approval PR remains buildable and testable.
- The platform still records enough offer-level audit to know who submitted,
  who approved/rejected, when, and why.
- Later governance work has a clear dependency path.
- We avoid implementing fake timers or delegation semantics before the business
  process is proven.

Bad:

- The first approval version will not answer every compliance/audit question.
- Approval queue SLA risk remains a process risk until on-duty/escalation exists.
- Delegated approvals require manual handling until the later governance layer.

## Implementation Rule

Any PR touching offer approval must state which layer it implements:

1. **Offer-level approval** — `lead_offers` audit only.
2. **Governance layer** — full audit, SLA timers, or delegation.

If a PR tries to implement layer 2 before the dependencies above exist, it must
stop and update `docs/06-platform/13-open-questions-log.md` instead of guessing.


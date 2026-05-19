# V2/V3 Buying-Side Platform Control Docs

Status: Active pre-build control layer
Date: 2026-05-18

This folder turns the buying-side platform review into implementation controls.
It exists so v2/v3 work is built from explicit requirements, state machines,
API contracts, UX contracts, tests, and decision records instead of repeated
prompt-by-prompt rediscovery.

## Source Hierarchy

When docs conflict, use this order:

1. Current repo architecture and live production behavior.
2. Approved v2 Opportunities direction in `docs/02-product/v2-opportunities.md`.
3. Source platform review in `docs/06-platform/source/TAV_Platform_Full_Review.md`.
4. Open questions in `docs/06-platform/13-open-questions-log.md`.

The review is a proposal source, not an automatic override. If it conflicts
with approved v2 scope, preserve the conflict in the open questions log.

## Milestone Tags

Every requirement, table, state transition, API, UX surface, and test plan must
carry one of these tags:

| Tag | Meaning |
|---|---|
| `V2-Core` | Required for the first live Opportunities workflow. |
| `V2.5` | Required after the queue is usable, before the full negotiation system. |
| `V3` | Buying-side operating-system features: offers, approvals, dispositions, validation, coaching. |
| `V3+` | Governance/optimization features after the V3 workflow is proven. |
| `Future` | Useful but not approved for the current platform build. |
| `Blocked` | Cannot proceed until a named external decision or dependency is resolved. |

## Traceability Rule

Before writing code for any v2/v3 task, identify the FR IDs and ADRs it
implements. If the work conflicts with an FR, ADR, state machine, API contract,
UX spec, test strategy, or milestone boundary, stop and update
`docs/06-platform/13-open-questions-log.md` instead of guessing.

Required traceability chain:

```text
Review source -> FR -> schema -> state machine -> API -> UX -> tests
```

No implementation PR is ready for review until the chain is complete for every
included `V2-Core` requirement.

## Doc Set

| File | Purpose | Status |
|---|---|---|
| `00-project-charter.md` | Scope, ownership, success criteria, glossary. | Created |
| `01-business-requirements.md` | Business rules in business language. | Created |
| `02-functional-requirements.md` | Numbered FRs by capability. | Created |
| `03-data-model.md` | Schema design and traceability. | Created |
| `04-state-machines.md` | Lead/opportunity, claim, offer, disposition transitions. | Created |
| `05-api-contract.md` | Worker and web API contracts. | Pending |
| `06-ux-spec.md` | Role-aware screens, controls, empty/error states. | Pending |
| `07-non-functional-requirements.md` | Performance, security, audit, retention, reliability. | Pending |
| `08-metrics-and-observability.md` | KPIs and instrumentation. | Pending |
| `09-test-strategy.md` | Unit, integration, E2E, manual QA, shadow mode. | Pending |
| `10-glossary-and-data-dictionary.md` | Enum/status/grade dictionary. | Pending |
| `11-migration-and-rollout-plan.md` | Shadow mode, AppSheet cutover, rollback. | Pending |
| `12-security-and-access.md` | Role/tier access matrix and audit policy. | Pending |
| `13-open-questions-log.md` | Living decision log. | Created |
| `14-decision-records/` | Short ADRs for durable choices. | Started with [ADR-0001](14-decision-records/ADR-0001-progressive-approval-governance.md) |
| `15-current-architecture-map.md` | Current live architecture map used to ground v2 design work. | Created |
| `16-final-outcome-architecture-map.md` | Target buying-side platform architecture after v2/v3 are complete. | Created |
| `17-current-file-by-file-review.md` | Active file/group review with purpose, risk, v2 relevance, and next action. | Created |
| `18-new-developer-handoff.md` | Clean new-developer handoff for understanding current state and guardrails. | Created |
| `19-v2-implementation-index.md` | Execution index for required docs and phased v2/v3 work packages. | Created |

## Strategic Implementation Approach

Build the platform in dependency order. Do not pull later governance features
into earlier workflow PRs just because the final design needs them.

```text
V2-Core: Opportunities queue and accountable human ownership
  -> V2.5: touches, on-duty state, cutover readiness, richer audit substrate
  -> V3: offers, approval gates, dispositions, validation, closer dashboard
  -> V3+: approval SLA automation, full audit analytics, delegation
```

### Approval Governance Strategy

The first `lead_offers` implementation should enforce the customer-facing offer
gate and write the offer-level audit fields on the offer row. It should not
also build global audit analytics, SLA timers, or delegated approval.

Those features are deliberately sequenced later because they depend on broader
workflow primitives:

| Feature | Earliest milestone | Required dependency |
|---|---|---|
| Full approval audit beyond `lead_offers` | `V3+` | `lead_events`, `lead_touches`, dispositions, status transitions, user identity. |
| Approval SLA timers | `V3+` | on-duty/off-duty state, escalation policy, notification transport, eligible approver routing. |
| Delegated approval | `V3+` | stable tier model, normal approval path in production, delegation policy, revocation/audit rules. |

This keeps the first approval PR buildable while preserving the governance
requirements instead of pretending they do not exist.

## Implementation Gate

The next implementation PR should not start until:

- `V2-Core` open questions are either decided or explicitly deferred.
- Every `V2-Core` FR has matching schema, state machine, API, UX, and test
  coverage in the docs.
- The PR states which FRs and ADRs it implements.
- The PR does not implement `V2.5`, `V3`, or `Future` items unless the milestone
  tag was deliberately changed in a prior docs PR.
- If a PR touches offer approval, it must cite the approval governance ADR and
  explicitly state whether it is implementing offer-level audit only or a later
  governance layer.

## New Developer Entry Point

For a clean start, read these three files first:

1. `18-new-developer-handoff.md`
2. `19-v2-implementation-index.md`
3. `15-current-architecture-map.md`

Then read `16-final-outcome-architecture-map.md`,
`17-current-file-by-file-review.md`, `docs/02-product/v2-opportunities.md`, and
`13-open-questions-log.md` before writing any implementation plan.

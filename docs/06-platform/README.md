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
| `02-functional-requirements.md` | Numbered FRs by capability. | Pending |
| `03-data-model.md` | Schema design and traceability. | Pending |
| `04-state-machines.md` | Lead/opportunity, claim, offer, disposition transitions. | Pending |
| `05-api-contract.md` | Worker and web API contracts. | Pending |
| `06-ux-spec.md` | Role-aware screens, controls, empty/error states. | Pending |
| `07-non-functional-requirements.md` | Performance, security, audit, retention, reliability. | Pending |
| `08-metrics-and-observability.md` | KPIs and instrumentation. | Pending |
| `09-test-strategy.md` | Unit, integration, E2E, manual QA, shadow mode. | Pending |
| `10-glossary-and-data-dictionary.md` | Enum/status/grade dictionary. | Pending |
| `11-migration-and-rollout-plan.md` | Shadow mode, AppSheet cutover, rollback. | Pending |
| `12-security-and-access.md` | Role/tier access matrix and audit policy. | Pending |
| `13-open-questions-log.md` | Living decision log. | Created |
| `14-decision-records/` | Short ADRs for durable choices. | Pending |

## Implementation Gate

The next implementation PR should not start until:

- `V2-Core` open questions are either decided or explicitly deferred.
- Every `V2-Core` FR has matching schema, state machine, API, UX, and test
  coverage in the docs.
- The PR states which FRs and ADRs it implements.
- The PR does not implement `V2.5`, `V3`, or `Future` items unless the milestone
  tag was deliberately changed in a prior docs PR.


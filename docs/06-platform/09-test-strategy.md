# Test Strategy — V2 Opportunities

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`, `V3+`

This document defines the test coverage required before v2 implementation PRs
are accepted. Tests must prove the traceability chain:

```text
Review source -> FR -> schema -> state machine -> API -> UX -> tests
```

## Test Levels

| Level | Purpose | Examples |
|---|---|---|
| Unit | Pure functions and mapping logic. | read-model composition, badges, estimate calculations, parsers. |
| Persistence/contract | DB/query boundaries and API envelopes. | opportunity query shape, claim atomicity later. |
| Component/RTL | UI behavior without full browser. | table rows, preview pane, badges, disabled future controls. |
| E2E | Real browser workflow through Next proxy mocks or test Worker. | `/opportunities` load, preview, detail, error states. |
| Manual smoke | Production/live-data confidence after deploy. | first-user testing checklist. |

## First Code Slice Coverage

The first v2 code PR may implement only:

- FR-001
- FR-002
- read-only parts of FR-004 through FR-010

Required test IDs:

| Test ID | Level | FRs | Required proof |
|---|---|---|---|
| T-OPP-001 | Unit | FR-001 | Existing lead rows map to `OpportunityRow`. |
| T-OPP-002 | Unit | FR-001, FR-004 | Near-miss rows map with reason/filter context. |
| T-OPP-003 | Unit | FR-005 | Repeated sightings preserve run identity and seen count. |
| T-BADGE-001 | Unit | FR-004..010 | Badge derivation covers near-miss, price change, VIN appeared, estimates, duplicate. |
| T-EST-MILES-001 | Unit | FR-008 | Missing mileage estimates at 15k/year and never overwrites explicit mileage. |
| T-EST-STYLE-001 | Unit | FR-009 | Missing style selects first catalog option and marks estimated. |
| T-MMR-001 | Unit | FR-010 | Spread is `MMR - price`; missing values return null. |
| T-MMR-002 | Unit | FR-010 | Estimated MMR flag is true when mileage or style was estimated. |
| T-API-001 | Contract | FR-001 | `GET /app/opportunities` returns envelope and row schema. |
| T-API-002 | Contract | FR-002 | `GET /app/opportunities/:id` returns detail or honest not-found. |
| T-UX-001 | RTL | FR-001, FR-002 | Table renders rows and single click opens preview. |
| T-UX-002 | RTL | FR-004..010 | Badges and unavailable states render text labels. |
| T-E2E-001 | E2E | FR-001 | Empty queue renders empty state. |
| T-E2E-002 | E2E | FR-001, FR-002 | Mocked rows render; preview opens. |
| T-E2E-003 | E2E | FR-003 | Double click navigates to detail route. |
| T-E2E-004 | E2E | FR-004..010 | Estimated/near-miss/duplicate badges render. |
| T-E2E-005 | E2E | FR-001 | API error shows retry state without fake data. |
| T-GUARD-001 | Unit/E2E | First-slice boundary | No claim/assign/manual/offer/disposition mutation calls exist. |

## V2-Core Later Mutation Coverage

### Manual Submission

FRs: FR-011..013

| Test ID | Level | Required proof |
|---|---|---|
| T-MANUAL-001 | Unit/API | URL-only submission succeeds. |
| T-MANUAL-002 | Unit/API | Optional facts persist when supplied. |
| T-MANUAL-003 | Unit/API | Duplicate/manual match returns warning, not silent discard. |
| T-MANUAL-004 | RTL/E2E | Form validates URL and shows success. |
| T-ASSIGN-001 | Unit/API | Optional closer assignment persists and displays. |

### Claim and Assignment

FRs: FR-014..017

| Test ID | Level | Required proof |
|---|---|---|
| T-CLAIM-001 | Unit/API | Claim writes owner, claimed_at, expires_at. |
| T-CLAIM-002 | Integration | Concurrent claims allow exactly one success. |
| T-CLAIM-003 | API | Already-claimed returns current owner and timestamp. |
| T-CLAIM-004 | Unit/API | Expired claim becomes eligible but preserves history. |
| T-ASSIGN-002 | API | Admin assignment/reassignment is role-gated and auditable. |
| T-WARN-001 | RTL/E2E | Prior evaluator/claim warning renders who/when. |

## V2.5 Coverage

| Area | FRs | Required tests |
|---|---|---|
| Touches | FR-020 | Add touch, render timeline, preserve append-only behavior. |
| Staff availability | FR-021 | Set availability, query availability, reject invalid status. |
| AppSheet cutover | FR-022 | Coverage metric calculation and P1 window logic. |
| Shared events | FR-023 | Append-only event writer, timeline ordering, no destructive update. |

## V3 Coverage

| Area | FRs | Required tests |
|---|---|---|
| Offers | FR-024 | Amount validation, offer-level audit fields. |
| Approval gate | FR-025 | Junior/Closer require approval, Senior ceiling, VIP all. |
| Approve/reject | FR-026 | Permission, rejection reason, actor/time audit. |
| Counters | FR-027 | Counter is first-class record linked to offer/opportunity. |
| Supersede/expire | FR-028 | Superseded/expired offers remain in history. |
| Disposition | FR-029 | Required fields by disposition type, immutable except admin correction. |
| Validation | FR-030 | Pending/approve/override/dispute flows. |
| Dashboard modes | FR-031 | Role-aware hunting/working/awaiting/disposing views. |

## V3+ Coverage

Do not test or implement these until their dependencies exist:

- FR-032 approval SLA timers
- FR-033 delegated approval
- FR-034 approval analytics/fraud controls

When implemented, tests must include governance edge cases, revocation, missed
SLA handling, and admin-only access.

## Required CI Commands

Every v2 implementation PR must run the repo's normal loop:

```bash
npm run lint
npm run typecheck
npm test
```

Web changes must also run the relevant web/e2e suite. If the repo uses `pnpm`
inside `web`, use the package scripts documented in the current README/runbook
for that workspace.

## Manual Smoke for First Live Test

Before giving Rami plus one or two users access to a v2 slice:

1. Confirm production deploy is from clean `main`.
2. Confirm `/opportunities` loads with live data or honest empty state.
3. Confirm no browser request goes directly to Supabase/Cox/Manheim.
4. Confirm badges appear on known mocked/test rows before relying on live data.
5. Confirm API error state is visible and non-destructive.
6. Confirm mutation controls are absent or disabled if not implemented.
7. Record known limitations in `docs/04-operations/handoff.md`.

## Review Checklist

Before review, every implementation PR must answer:

- Which FR IDs does this implement?
- Which schema section does it depend on?
- Which state transitions are introduced or used?
- Which API contracts are implemented?
- Which UX states are covered?
- Which tests prove the behavior?
- Which milestone boundaries were intentionally not crossed?

If any answer is missing, the PR is not ready.


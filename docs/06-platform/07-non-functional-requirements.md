# Non-Functional Requirements — V2 Opportunities

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`, `V3+`

This document defines the operating qualities required for the buying-side
platform. Functional behavior lives in
[02-functional-requirements.md](02-functional-requirements.md); this file covers
performance, reliability, security, audit, retention, and supportability.

## NFR Matrix

| ID | Requirement | Milestone | Applies to | Acceptance Signal |
|---|---|---|---|---|
| NFR-001 | Read-only Opportunities list loads within 2s p95 for the first live team. | `V2-Core` | FR-001 | Browser/e2e and production smoke show usable load time. |
| NFR-002 | Opportunity detail/preview opens without mutating data. | `V2-Core` | FR-002, FR-003 | No write route is called during preview/detail. |
| NFR-003 | Badge derivation is deterministic and test-covered. | `V2-Core` | FR-004..FR-010 | Unit matrix in [09-test-strategy.md](09-test-strategy.md) passes. |
| NFR-004 | Missing mileage/style estimates are always visibly marked. | `V2-Core` | FR-008, FR-009 | UX badge and API estimate fields render together. |
| NFR-005 | Browser never calls Supabase, Cox, Manheim, or other vendor services directly. | `V2-Core` | All web/API FRs | Network guard tests and code review. |
| NFR-006 | Secrets never appear in repo docs, GitHub issues/PRs, Obsidian, screenshots, or logs. | `V2-Core` | All | Secret-leak guard plus manual review. |
| NFR-007 | Claim mutation, when introduced, resolves atomically and prevents silent double ownership. | `V2-Core` | FR-014 | Concurrent claim integration test. |
| NFR-008 | Claim ownership history is retained even after expiration/release. | `V2-Core` | FR-014..FR-017 | Audit row/event remains queryable. |
| NFR-009 | Manual submissions preserve source URL and submitter identity. | `V2-Core` | FR-011..FR-013 | DB/API contract tests. |
| NFR-010 | Every production write path emits enough audit context to reconstruct who did what and when. | `V2.5` | FR-020, FR-023 | `lead_events`/touches coverage. |
| NFR-011 | Offer and disposition records are append-oriented; destructive updates require admin-only correction flow. | `V3` | FR-024..FR-030 | Row immutability tests and role gates. |
| NFR-012 | Approval governance features do not ship without on-duty/routing/escalation dependencies. | `V3+` | FR-032..FR-034 | ADR-0001 cited by PR. |

## Performance Budgets

| Surface | Milestone | Budget | Notes |
|---|---|---|---|
| `/opportunities` initial load | `V2-Core` | <= 2s p95 for first team usage | Can use pagination/default filters if data volume grows. |
| Preview pane open | `V2-Core` | <= 500ms p95 after list data is present | Prefer using row payload first, then fetch detail on demand. |
| Detail page load | `V2-Core` | <= 2s p95 | Honest loading/error states required. |
| Claim write | `V2-Core` | <= 500ms p95 server-side target | Atomic correctness is more important than speed. |
| Catalog/MMR lookup | Existing/#45 | Vendor-dependent; must show loading/unavailable honestly | Never fake vendor values. |

## Reliability and Failure Behavior

- Empty states are valid outcomes; do not fabricate rows.
- API failures must render retry/error states without losing user context.
- Vendor unavailable/not-provisioned states must remain distinct from internal
  application errors.
- Background ingestion failures should not block the existing queue from
  rendering prior data.
- Future mutation actions must be idempotent where repeated browser submissions
  are plausible.

## Security and Privacy

- Production staff auth remains mandatory for app surfaces.
- Admin/service secrets stay server-side only.
- Seller phone/email, when added, are PII and must be access-controlled.
- Role/tier gates are enforced server-side; disabled UI is not a security
  boundary.
- Screenshots and logs must avoid licensed valuation payloads and secrets.

## Retention and Audit

| Data | Milestone | Retention Position |
|---|---|---|
| Raw/normalized listing evidence | Existing / `V2-Core` | Keep as long as needed for duplicate detection and training. |
| Opportunity events | `V2.5` | Append-only operational audit. |
| Offers/counters | `V3` | Preserve history; supersede rather than overwrite. |
| Dispositions/validation | `V3` | Preserve as training data; corrections should be explicit. |
| Approval analytics | `V3+` | Admin-only governance reporting. |

## Implementation Gate

Every implementation PR must state:

- Which NFRs apply.
- Which tests prove the NFR is respected.
- Which NFRs are intentionally deferred by milestone.


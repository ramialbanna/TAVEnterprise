# Security and Access — V2 Opportunities

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`, `V3+`

This document defines staff roles, access expectations, and security rules for
the buying-side platform. It complements
[07-non-functional-requirements.md](07-non-functional-requirements.md).

## Roles

| Role | Meaning | Milestone |
|---|---|---|
| Admin | Can manage users, assignments, corrections, and system settings. | `V2-Core` |
| Buyer/Finder | Surfaces opportunities and may submit links/facts. | `V2-Core` |
| Closer | Works opportunities and contacts sellers/customers. | `V2-Core` |
| Junior Closer | Closer tier requiring approval before customer-facing offers. | `V3` |
| Senior Closer | Can self-approve offers at or below approved ceiling. | `V3` |
| VIP Closer | Can approve all offers. | `V3` |
| Validator | Reviews dispositions for training/calibration. | `V3` |

## Access Matrix

| Action | Admin | Buyer/Finder | Closer | Senior | VIP | Validator | Milestone |
|---|---|---|---|---|---|---|---|
| View Opportunities queue | Yes | Yes | Yes | Yes | Yes | Yes | `V2-Core` |
| View preview/detail | Yes | Yes | Yes | Yes | Yes | Yes | `V2-Core` |
| Submit manual opportunity | Yes | Yes | Yes | Yes | Yes | No by default | `V2-Core` |
| Recommend closer | Yes | Yes | Yes | Yes | Yes | No by default | `V2-Core` |
| Claim opportunity | Yes | Yes | Yes | Yes | Yes | No by default | `V2-Core` |
| Assign/reassign | Yes | Optional finder recommendation only | No | No | Optional | No | `V2-Core` |
| Add touch | Yes | Yes if involved | Yes | Yes | Yes | No by default | `V2.5` |
| Create offer | Yes | No by default | Yes | Yes | Yes | No | `V3` |
| Approve offer | Yes | No | No | Up to ceiling | Yes | No | `V3` |
| Dispose opportunity | Yes | If owner/involved | If owner/involved | If owner/involved | If owner/involved | No | `V3` |
| Validate disposition | Yes | No | No | Optional | Optional | Yes | `V3` |
| View governance analytics | Yes | No | No | Limited if approved | Yes | Limited | `V3+` |

## Tier Approval Rules

| Submitter Tier | Customer-Facing Offer Rule |
|---|---|
| Junior Closer | Requires Senior or VIP approval. |
| Closer | Requires VIP approval. |
| Senior Closer | Can self-approve at or below configured ceiling; VIP above ceiling. |
| VIP Closer | Can approve all offers. |

Full approval audit analytics, SLA timers, and delegated approval are deferred
per [ADR-0001](14-decision-records/ADR-0001-progressive-approval-governance.md).

## Server-Side Enforcement

- UI role hiding is convenience only.
- Every mutation route must enforce identity and role/tier server-side.
- Service-to-service calls use server secrets only.
- Browser calls go only to same-origin app routes.
- Vendor credentials never leave Workers/server-side boundaries.

## Sensitive Data

| Data | Handling |
|---|---|
| Cox/Manheim credentials/tokens | Server-side secrets only; never logged. |
| Licensed MMR values | Display only in approved app UI; avoid public logs/docs. |
| Seller/customer phone/email | Treat as PII; role-gate and avoid broad logs. |
| Staff identity/actions | Store for audit; do not expose governance analytics broadly. |
| GitHub/Obsidian docs | Names, field names, IDs, and classifications only; no secrets. |

## Admin Actions

Admin actions should emit audit context:

- user created/deactivated
- role/tier changed
- opportunity assigned/reassigned
- claim corrected
- offer/disposition corrected
- validation override/dispute resolved

## Production Review Checklist

Before shipping a mutation PR:

- Auth is enforced server-side.
- Role/tier matrix row is cited.
- Secret scan passes.
- No browser-to-vendor path exists.
- Audit fields or event rows exist.
- Failure path is honest and non-destructive.


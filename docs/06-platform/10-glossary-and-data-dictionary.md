# Glossary and Data Dictionary — V2 Opportunities

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`, `V3+`

This document defines platform terms, statuses, badges, enums, and business
language. Use these names consistently in code, UI, issues, and docs.

## Core Terms

| Term | Definition | Milestone |
|---|---|---|
| Raw Listing | Source payload from a marketplace/API before cleanup. | Existing |
| Normalized Listing | Parsed/canonical listing facts extracted from raw data. | Existing |
| Vehicle Candidate | Dedupe identity for the same likely vehicle across sightings. | Existing / `V2-Core` |
| Lead | Existing persisted acquisition record created from eligible candidate/listing data. | Existing |
| Opportunity | V2 operating row that may represent a lead, near-miss, manual submission, repeated sighting, or update worth review. | `V2-Core` |
| Near-Miss | A listing/candidate that was filtered/scored but not created as a lead and should remain reviewable with reason context. | `V2-Core` |
| Finder | Person who submits or surfaces an opportunity. | `V2-Core` |
| Closer | Person expected to work/close the opportunity. | `V2-Core` |
| Claim | A time-bounded ownership window for working an opportunity. | `V2-Core` |
| Touch | A contact/action note such as call, SMS, email, or internal note. | `V2.5` |
| Offer | Internal/customer-facing offer record subject to tier approval rules. | `V3` |
| Counter | Seller/customer response amount or terms, modeled as a first-class record. | `V3` |
| Disposition | Final outcome/training record for why an opportunity was won, lost, passed, duplicated, stale, or removed. | `V3` |
| Validation | Post-hoc review of disposition quality for training/calibration. | `V3` |

## Opportunity Source Types

| Value | Meaning | Milestone |
|---|---|---|
| `lead` | Existing lead record. | `V2-Core` |
| `near_miss` | Filtered/scored row worth human review. | `V2-Core` |
| `manual_submission` | Buyer/finder-submitted listing URL or facts. | `V2-Core` |
| `repeat_sighting` | Same candidate seen again in a later run. | `V2-Core` |
| `price_change` | Candidate/listing appeared with a changed asking price. | `V2-Core` |
| `vin_appeared` | Candidate was previously VIN-missing and later surfaced with VIN. | `V2-Core` |
| `estimate_update` | Missing mileage/style valuation was estimated and should be reviewed. | `V2-Core` |

## Badges

| Badge | Meaning | Milestone |
|---|---|---|
| `first_seen` | First observed row for this candidate/opportunity. | `V2-Core` |
| `seen_before` | Same likely vehicle appeared in a previous run/source. | `V2-Core` |
| `price_changed` | Asking price changed since a prior sighting. | `V2-Core` |
| `vin_appeared` | VIN became available after prior missing state. | `V2-Core` |
| `near_miss` | Filtered/scored but not promoted to lead. | `V2-Core` |
| `estimated_mileage` | Mileage estimated at 15k miles/year because explicit mileage was missing. | `V2-Core` |
| `estimated_style` | Style was missing and first catalog option was used. | `V2-Core` |
| `estimated_mmr` | MMR result depends on estimated mileage/style. | `V2-Core` |
| `claimed` | Currently owned by a user. | `V2-Core` |
| `assigned` | Assigned/recommended to a closer. | `V2-Core` |

## Claim Statuses

| Status | Meaning | Milestone |
|---|---|---|
| `unclaimed` | No active claim exists. | `V2-Core` |
| `claimed` | User owns the 24-hour working window. | `V2-Core` |
| `expired` | Claim window expired but history remains. | `V2-Core` |
| `released` | User/admin released ownership. | `V2-Core` |
| `reassigned` | Admin reassigned ownership. | `V2-Core` |

## Manual Submission Statuses

| Status | Meaning | Milestone |
|---|---|---|
| `submitted` | URL/facts accepted. | `V2-Core` |
| `matched_existing` | Submission matched an existing candidate/opportunity. | `V2-Core` |
| `needs_review` | Submission lacks enough facts for clean identity. | `V2-Core` |
| `promoted` | Submission produced/linked to an Opportunity row. | `V2-Core` |
| `rejected` | Submission was invalid or out of buying scope. | `V2-Core` |

## Offer Statuses

| Status | Meaning | Milestone |
|---|---|---|
| `draft` | Not submitted for approval/sending. | `V3` |
| `pending_approval` | Awaiting approver decision. | `V3` |
| `approved` | Approved internally but not necessarily sent. | `V3` |
| `rejected` | Rejected internally with reason. | `V3` |
| `sent` | Customer/seller-facing offer sent. | `V3` |
| `accepted` | Customer/seller accepted. | `V3` |
| `countered` | Customer/seller countered. | `V3` |
| `superseded` | Replaced by a newer offer/counter. | `V3` |
| `expired` | Offer window elapsed. | `V3` |

## Disposition Outcomes

| Outcome | Meaning | Milestone |
|---|---|---|
| `won` | Vehicle acquired or ready for purchase handoff. | `V3` |
| `lost_price` | Lost primarily due to economics. | `V3` |
| `lost_contact` | Could not reach seller/customer. | `V3` |
| `lost_condition` | Vehicle condition/history made it undesirable. | `V3` |
| `duplicate` | Same vehicle already represented elsewhere. | `V3` |
| `stale` | No longer actionable due to age/window. | `V3` |
| `removed` | Listing disappeared/was removed. | `V3` |
| `out_of_scope` | Not a buying-side opportunity. | `V3` |

## Validation Statuses

| Status | Meaning | Milestone |
|---|---|---|
| `not_required` | No validation needed under current mode. | `V3` |
| `pending` | Waiting for validator. | `V3` |
| `approved` | Validator agrees. | `V3` |
| `overridden` | Validator changes/overrides outcome. | `V3` |
| `disputed` | Requires follow-up decision. | `V3` |

## Validation Modes

| Mode | Meaning | Milestone |
|---|---|---|
| `all` | Validate every eligible disposition. | `V3` |
| `juniors_only` | Validate dispositions from junior users. | `V3` |
| `sample_10` | Validate 10% sample. | `V3` |
| `off` | Validation disabled. | `V3` |


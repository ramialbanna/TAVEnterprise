# UX Spec — V2 Opportunities

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`

This document defines the first v2 user surface. It is intentionally operational:
buyers and closers should be able to scan, inspect, and understand opportunities
without guessing what is real, estimated, claimed, repeated, or near-miss.

## UX Principles

- The first screen is the work queue, not a landing page.
- Dense, scannable, staff-operations UI beats marketing UI.
- Show data provenance and uncertainty directly in the row.
- Estimated values are useful only when visibly badged.
- First code slice is read-only: no claim, assignment, manual submission, offer,
  disposition, or approval controls until their FRs are implemented.

## Routes

| Route | Milestone | Purpose | FRs |
|---|---|---|---|
| `/opportunities` | `V2-Core` | Main table plus preview pane. | FR-001, FR-002, FR-004..010, FR-018 |
| `/opportunities/:id` | `V2-Core` | Full detail page. | FR-003 |
| `/opportunities/new` or modal | `V2-Core` later slice | Manual submission. | FR-011..013 |
| `/opportunities/:id/work` areas | `V2-Core` later slices | Claim/assignment. | FR-014..017 |
| `/opportunities/:id/offers` areas | `V3` | Offers/counters/approval. | FR-024..028 |

## Main Table

Milestone: `V2-Core`  
FRs: FR-001, FR-004..010, FR-018  
API: `GET /app/opportunities`

### Required Columns

| Column | Content | Notes |
|---|---|---|
| Priority | Grade/score or near-miss label. | Compact color + text, never color only. |
| Vehicle | Year/make/model/trim/title. | VIN shown as secondary when present. |
| Badges | Event and estimate badges. | Wrap to two lines max; overflow in preview. |
| Price | Asking price. | `--` when missing. |
| MMR | MMR value/status. | Estimated/unavailable clearly marked. |
| Spread | `MMR - price`. | Only if both values exist. |
| Source | Source + region. | Include run/source identity in tooltip/secondary text. |
| Seen | First/last seen. | Repeat rows show seen-again badge. |
| Owner | assignee/claim state. | Read-only placeholder in first slice. |
| Status | active/new/near-miss/etc. | Business-readable. |

### Default Sorting

1. Active/urgent updates first: price changed, VIN appeared, claimed/assigned.
2. Higher grade/score next.
3. Most recent `lastSeenAt` next.

### Filters

Initial filters:

- status
- type
- source
- region
- owner: all / unclaimed / claimed / assigned
- badge
- search text

Filters are read-only and client/server safe. Filtering must not mutate row
state.

## Preview Pane

Milestone: `V2-Core`  
FRs: FR-002, FR-005, FR-010, FR-015  
Trigger: single click row

### Layout

```text
┌──────────────────────────────────────────────┐
│ Vehicle title                         badges │
│ price · MMR · spread · source/run            │
├──────────────────────────────────────────────┤
│ Ownership                                    │
│ finder · assignee · claimed by · expires     │
├──────────────────────────────────────────────┤
│ Valuation                                    │
│ MMR method · explicit/estimated inputs       │
├──────────────────────────────────────────────┤
│ Why surfaced                                 │
│ lead score · near-miss reasons · changes     │
├──────────────────────────────────────────────┤
│ Seen before / duplicate context              │
│ first seen · last seen · seen count · runs    │
└──────────────────────────────────────────────┘
```

### Rules

- Single click opens/updates pane.
- Pane never mutates workflow state in first code slice.
- If row has already been claimed/evaluated, show warning with who/when.
- Missing values display as `--` or an honest unavailable label.
- Estimated values use badge text: `Estimated miles`, `Estimated style`,
  `Estimated MMR`.

## Detail Page

Milestone: `V2-Core`  
FRs: FR-003  
Trigger: double click row or explicit open action

Required sections:

1. Header: vehicle, status, badges, source link.
2. Economics: asking price, MMR, spread, estimate context.
3. Identity: VIN, year/make/model/style, candidate id, listing id.
4. Source/run: source, region, run id, first/last seen, scraped/posted dates.
5. Score/reasons: grade, final score, reason codes, near-miss reason.
6. Duplicate/seen-before: candidate matches and repeated runs.
7. Timeline: read-only events where available.
8. Future action slots: claim, assign, touches, offers, disposition. Disabled or
   omitted until their FRs ship.

## Badge Vocabulary

| Badge | Meaning | FR |
|---|---|---|
| `First seen` | First known appearance. | FR-005 |
| `Seen again #N` | Same candidate/listing appeared again. | FR-005 |
| `Price changed` | Asking price changed. | FR-006 |
| `VIN appeared` | New sighting has VIN where earlier did not. | FR-007 |
| `Mileage changed` | Mileage changed from prior value. | FR-005 |
| `Estimated miles` | Mileage inferred at 15k/year. | FR-008 |
| `Estimated style` | First catalog style selected as fallback. | FR-009 |
| `Estimated MMR` | MMR used estimated mileage/style. | FR-010 |
| `Near miss` | Scored/filtered listing remains reviewable. | FR-004 |
| `Possible duplicate` | Useful but uncertain duplicate match. | FR-005 |
| `Already claimed` | Active/prior claim exists. | FR-015 |
| `Already evaluated` | Prior user/system valuation exists. | FR-015 |

Badges must be text labels, not color-only chips.

## Empty / Loading / Error States

| State | UI |
|---|---|
| Initial loading | Skeleton rows and disabled preview pane. |
| Empty queue | "No active opportunities found." Include filter reset if filters active. |
| API error | Inline error with retry. Do not clear prior loaded rows if refetch fails. |
| Detail not found | "Opportunity no longer available" with source/run context if known. |
| MMR unavailable | Show `--` plus missing reason label; do not block row display. |
| Catalog/vendor issue | Show unavailable valuation state; no browser vendor call. |

## First Code Slice: Allowed UX

The first v2 code PR may add:

- `/opportunities`
- read-only table
- read-only preview pane
- badges
- filters/search
- loading/empty/error states
- typed client calls for `GET /app/opportunities*`

It must not add:

- claim button that writes
- assignment form that writes
- manual submission form that writes
- notes/touches composer
- offer/counter/disposition controls
- approval controls

Disabled future-action placeholders are allowed only if they reduce confusion and
clearly say "coming later" or "not available in this slice."

## Mobile Rules

Milestone: `V2-Core`

- Phone: table becomes list; preview becomes full-screen drawer.
- Tablet/desktop: table + side preview.
- Do not require phone for offer drafting in V3; phone is acceptable for quick
  claim/dispose/VIP approval later.

## Role Visibility

First live testing: buyers and closers see the full queue.

| Role | V2-Core visibility | V2-Core actions |
|---|---|---|
| Buyer/finder | Full queue. | Read-only first slice; manual submit later. |
| Closer | Full queue. | Read-only first slice; claim later. |
| Admin | Full queue. | Read-only first slice; assignment later. |

V3 role/tier actions are controlled by the future offer/approval UX.

## UX Acceptance Tests

Minimum E2E scenarios for first code PR:

1. Empty queue renders empty state.
2. Rows render from mocked `GET /app/opportunities`.
3. Single click opens preview pane.
4. Double click opens detail route.
5. Estimated mileage/style/MMR badges render.
6. Near-miss and duplicate badges render.
7. API error shows retry state.
8. No claim/assign/manual/offer/disposition mutation calls are possible.


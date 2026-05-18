# New Developer Handoff — V2/V3 Buying-Side Platform

Status: Active handoff  
Date: 2026-05-18  
Audience: New engineer, agent session, reviewer, or product/engineering lead

This handoff is the shortest safe path into the project. It tells you what the
system is, what is already built, where the active v2/v3 controls live, and what
to do next without damaging the current production pipeline.

## 1. Project In One Paragraph

TAV-AIP is Texas Auto Value's internal acquisition intelligence platform. Today
it ingests marketplace inventory, normalizes listings, groups same-vehicle
candidates, runs Cox/Manheim MMR valuation, scores buybox fit, creates leads, and
serves an authenticated web app. The next product phase is **v2 Opportunities**:
a buyer/closer operating workflow where automated signals and manual submissions
become accountable, claimable, auditable work.

## 2. Current Production Reality

| Area | Current state |
|---|---|
| Main Worker | Cloudflare Worker `tav-aip-production`; handles `/ingest`, `/app/*`, `/admin/*`, stale sweep. |
| Intelligence Worker | Cloudflare Worker `tav-intelligence-worker-production`; owns Cox/Manheim credentials and MMR calls. |
| Web app | Next.js on Vercel; authenticated internal app with Dashboard, Ingest, MMR Lab, Historical, Admin. |
| Database | Supabase Postgres schema `tav`. |
| MMR | Production Cox Storefront path: `/wholesale-valuations/vehicle/mmr-lookup/*` and `/wholesale-valuations/vehicle/mmr/search/*`. |
| V2 status | Requirements/control docs started; implementation has not started. |

## 3. Non-Negotiable Rules

- Preserve the four-concept boundary:
  1. Raw Listing
  2. Normalized Listing
  3. Vehicle Candidate
  4. Lead
- Do not collapse these into one table, one UI concept, or one "lead blob."
- Do not fabricate catalog, MMR, people, seller, workflow, or outcome data.
- Do not call Cox/Manheim from the browser.
- Do not expose `APP_API_SECRET`, `ADMIN_API_SECRET`, Supabase service-role key,
  Cox credentials, or licensed valuation payloads in logs, PRs, issues, docs, or
  screenshots.
- Do not restart RuFlo / claude-flow automation. It caused unauthorized commits
  and PR activity. Keep it off unless a future governance decision explicitly
  reintroduces it.

## 4. Read This In Order

| Step | File | Why |
|---:|---|---|
| 1 | `docs/06-platform/README.md` | Source hierarchy, milestone tags, traceability rule. |
| 2 | `docs/06-platform/18-new-developer-handoff.md` | This handoff. |
| 3 | `docs/06-platform/19-v2-implementation-index.md` | The exact next-doc and next-PR sequence. |
| 4 | `docs/06-platform/15-current-architecture-map.md` | What exists today. |
| 5 | `docs/06-platform/16-final-outcome-architecture-map.md` | Where the platform is going. |
| 6 | `docs/06-platform/17-current-file-by-file-review.md` | Which files are risky and v2-relevant. |
| 7 | `docs/02-product/v2-opportunities.md` | Approved v2 product direction. |
| 8 | `docs/06-platform/13-open-questions-log.md` | Decisions still open; do not guess these. |

After that, read `docs/03-api/app-api.md`, `docs/03-api/manheim-cox.md`, and
`docs/04-operations/runbook.md` only as needed for the specific task.

## 5. Current Architecture In Plain English

```text
Apify / source data
  -> main Worker /ingest
  -> Supabase raw/normalized/candidate/lead tables
  -> intelligence Worker for Cox/Manheim MMR
  -> main Worker /app/*
  -> Next.js web app
```

The current system is good at:

- collecting and normalizing marketplace data
- preserving raw source payloads
- identifying same-vehicle candidates
- creating leads from scored listings
- calling Cox/Manheim MMR server-side
- showing operational/admin/MMR views in the web app

The current system is not yet good at:

- manual buyer/finder submissions
- a unified Opportunities queue
- claim/assignment with a 24-hour work window
- structured contact/touch history
- offer/counter workflow
- approval gates
- disposition validation and coaching

Those are the v2/v3 build.

## 6. V2 Product Direction

V2 is **Opportunities**, not "make the current leads table prettier."

An Opportunity can come from:

- a created lead
- a near-miss listing
- a repeated sighting
- a price change
- a VIN appearance/upgrade
- an estimated mileage/style valuation update
- a manual buyer/finder-submitted link

The first live queue should show all useful open/active work. Repeated sightings
remain visible as separate rows with run/candidate context; they are not silently
collapsed.

## 7. The Traceability Gate

Before code, the task must identify the chain:

```text
Review source -> FR -> schema -> state machine -> API -> UX -> tests
```

If the chain is incomplete, do not implement. Write or update the relevant
control doc first.

Minimum active docs required before the first v2 implementation PR:

- `02-functional-requirements.md`
- `03-data-model.md`
- `04-state-machines.md`
- `05-api-contract.md`
- `06-ux-spec.md`
- `09-test-strategy.md`

## 8. Safe First Implementation Slice

The safest first v2 code PR is:

```text
Read-only Opportunities list
  - from existing leads + filtered_out + normalized/candidate/run context
  - no claim writes yet
  - no offers
  - no dispositions
  - table + preview pane + tests
```

Why this first:

- It validates the Opportunity read model without writing new workflow state.
- It proves whether the existing data has enough structure for live queue use.
- It gives Rami and initial testers something real to inspect.
- It avoids mixing read-model design with claim/assignment concurrency.

## 9. Things To Avoid

| Avoid | Why |
|---|---|
| Adding claim writes before the state machine exists | Race conditions and unclear ownership rules. |
| Forcing manual submissions into `leads` immediately | Manual items may not have normalized/scored data yet. |
| Hiding near-misses | User explicitly wants filtered/scored listings visible with filters/reasons. |
| Collapsing repeats into one row | User wants separate rows with run identity. |
| Building offers before touches/claim basics | Offer workflow depends on ownership and contact context. |
| Building full approval governance in first offer PR | ADR-0001 sequences this later. |
| Treating archived docs as current truth | Archives preserve history; active docs are under numbered folders. |

## 10. Live Testing Goal

The near-term objective is a working live environment where Rami and one or two
others can assign, claim, and test live data. That means the platform must have:

- a queue users trust
- visible source/run/candidate context
- clear estimated-value badges
- manual submission path
- assignment/claim flow
- basic notes/touches soon after
- enough audit to answer "who had this and when?"

It does not yet require offers, counters, full disposition validation, approval
SLA automation, or delegated approval.

## 11. Current Risks To Respect

| Risk | Guardrail |
|---|---|
| Scope creep into v3 | Use milestone tags. Do not implement `V3` from a `V2-Core` PR. |
| Data model drift | Finish `03-data-model.md` before migrations. |
| Hidden workflow race conditions | Finish `04-state-machines.md` before claim writes. |
| Agent guessing | Keep `13-open-questions-log.md` live. |
| MMR/license leakage | Never log licensed payloads or secrets. |
| Automation recurrence | Keep RuFlo/claude-flow disabled. |

## 12. Definition Of Ready For First V2 Code PR

First v2 code PR is ready only after:

- `V2-Core` FRs exist.
- Opportunity data model/read-model choice is documented.
- Claim/assignment state transitions are defined, even if not implemented in the
  first read-only PR.
- `/app/opportunities` API contract is written.
- `/opportunities` UX spec has table, preview pane, empty/loading/error states.
- Test strategy maps each shipped FR to unit/integration/e2e coverage.

## 13. Definition Of Done For First V2 Slice

The first read-only v2 slice is done when:

- `/app/opportunities` returns real rows from existing production-safe data.
- The web app shows an authenticated `/opportunities` page.
- Rows show source, run identity, vehicle identity, price, MMR/spread, badges,
  status/reason context, and candidate history where available.
- Clicking a row opens a preview pane.
- No write workflow is exposed yet.
- Unit/API/web/e2e tests are green.
- Docs are updated with any discovered gaps.

## 14. Handoff Summary

The current system is a strong acquisition-intelligence foundation. The next
developer should not rebuild ingestion or MMR. They should build the buyer-facing
Opportunity layer on top of the existing raw/normalized/candidate/lead/valuation
foundation, using the traceability docs as the guardrails.


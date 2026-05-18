# Open Questions Log — Buying-Side Platform

Status: Living control doc
Date: 2026-05-18

Use this file when a requirement, milestone boundary, state transition, API, UX,
or schema decision is unclear. Do not implement a guess when the answer changes
workflow, data ownership, or future training data.

## Legend

| Field | Meaning |
|---|---|
| Question | The unresolved decision. |
| Milestone | Earliest milestone affected. |
| Default | Recommended position from the platform review or current docs. |
| Status | `Open`, `Decided`, `Deferred`, or `Rejected`. |
| Decision | Final answer once made. |
| Owner | Person who can decide. |
| Date | Decision date. |
| Rationale | Why the decision was made. |

## V2-Core Questions

| ID | Question | Milestone | Default | Status | Decision | Owner | Date | Rationale |
|---|---|---|---|---|---|---|---|---|
| OQ-001 | Should an Opportunity remain a read model only, or should workflow needs create a persisted `opportunities` table? | `V2-Core` | Start as read model; persist events/manual submissions. | Open | | Rami | | Impacts schema and API shape. |
| OQ-002 | Should every filtered/scored listing appear as a near-miss, or only rows above a threshold? | `V2-Core` | Start broad, but filter out stale/removed/noise. | Open | | Rami | | Controls queue volume. |
| OQ-003 | Which v2 statuses are required on day one? | `V2-Core` | `new`, `assigned`, `claimed`, `watch`, `passed`, `closed/suppressed` filters later. | Open | | Rami | | Impacts state machine and UI filters. |
| OQ-004 | Does claim expiration auto-release after 24 hours or only mark eligible for reassignment? | `V2-Core` | Mark eligible; do not delete or erase owner history. | Open | | Rami | | Impacts trust and audit. |
| OQ-005 | Can a finder also be the closer/claim owner? | `V2-Core` | Yes. | Open | | Rami | | Common in small-team launch. |
| OQ-006 | What is the minimum manual submission payload? | `V2-Core` | URL required; all other facts optional but encouraged. | Open | | Rami | | Impacts form and validation. |
| OQ-007 | What should happen when manual submission matches an existing candidate or active opportunity? | `V2-Core` | Create separate event/row and show seen-before warning. | Open | | Rami | | Impacts duplicate process. |
| OQ-008 | Who can assign opportunities in first live testing: admin only, finder, or any authenticated staff? | `V2-Core` | Finder can recommend/choose; admin can correct. | Open | | Rami | | Impacts access rules. |

## V2.5 Questions

| ID | Question | Milestone | Default | Status | Decision | Owner | Date | Rationale |
|---|---|---|---|---|---|---|---|---|
| OQ-009 | Should on-duty/off-duty state be required before any offer approval work? | `V2.5` | Yes. | Open | | Rami | | Prevents approval SLA failures. |
| OQ-010 | What is the AppSheet cutover criterion? | `V2.5` | 95% daily intake for 14 days with no P1 incident. | Open | | Rami | | Prevents permanent dual-entry. |
| OQ-011 | Should `lead_touches` be added before or with `lead_offers`? | `V2.5` | Before offers, or in same PR as offers if tightly scoped. | Open | | Rami | | Validator/offer context depends on conversation history. |
| OQ-012 | Should `bucket_id` be added early for future experiments? | `V2.5` | Yes, cheap now. | Open | | Rami | | Future A/B and scoring comparisons. |

## V3 Questions — Tiers, Offers, Dispositions

| ID | Question | Milestone | Default | Status | Decision | Owner | Date | Rationale |
|---|---|---|---|---|---|---|---|---|
| OQ-013 | Senior-approves-Senior above the ceiling: allowed or VIP-only? | `V3` | VIP-only above ceiling. | Open | | Rami | | Review A.9. |
| OQ-014 | Internal rejection visibility: submitter-only or team-wide training feed? | `V3` | Submitter-only for now. | Open | | Rami | | Training value vs embarrassment/noise. |
| OQ-015 | Is the Senior self-approval ceiling locked at $200,000? | `V3` | $200,000. | Open | | Rami | | Needs a business owner decision. |
| OQ-016 | Should validators be blocked from validating leads they touched earlier? | `V3` | Yes. | Open | | Rami | | Conflict-of-interest control. |
| OQ-017 | Override notification behavior: immediate, digest, or none? | `V3` | Immediate on override; digest on approvals. | Open | | Rami | | Coaching feedback loop. |
| OQ-018 | Validate closed-won deals too, or only losses? | `V3` | Both. | Open | | Rami | | Bought-too-high is also training data. |
| OQ-019 | Are teammates' active leads visible to everyone? | `V3` | Visible. | Open | | Rami | | Competition vs privacy. |
| OQ-020 | Phone scope: claim/dispose/VIP approval only, or offer drafting too? | `V3` | Tablet+ for offer drafting; phone for claim/dispose/VIP approval. | Open | | Rami | | Prevents high-cost input errors. |
| OQ-021 | Is approver note required on approve? | `V3` | Optional on approve; required on rejection. | Open | | Rami | | Speed vs audit richness. |
| OQ-022 | Is a release-lead reason required? | `V3` | Yes, one-line reason. | Open | | Rami | | Release should not be friction-free. |
| OQ-023 | Should closer/system grade comparison split initial judgment from final outcome? | `V3` | Yes: `closer_initial_grade` and `closer_final_grade`. | Open | | Rami | | Prevents polluted calibration signal. |

## Process Questions

| ID | Question | Milestone | Default | Status | Decision | Owner | Date | Rationale |
|---|---|---|---|---|---|---|---|---|
| OQ-024 | Who is the final decision arbiter when requirements conflict? | `V2-Core` | Rami until delegated. | Open | | Rami | | Required to prevent endless re-litigation. |
| OQ-025 | Should every implementation PR be blocked unless it lists FR IDs and ADRs? | `V2-Core` | Yes. | Open | | Rami | | Traceability guardrail. |
| OQ-026 | Should v2 start with a read-only shadow period before live team actions? | `V2-Core` | Yes if timeline allows; otherwise limited live test with 1-3 users. | Open | | Rami | | Review calls 30-day shadow mode highest leverage. |


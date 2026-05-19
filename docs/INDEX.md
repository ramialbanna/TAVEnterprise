# TAV-AIP Documentation Index

Status: Active handoff index  
Date: 2026-05-18  
Audience: New developers, reviewers, product leads, and AI coding agents

This is the front door for the project documentation. Start here when joining
the project or opening a new implementation session.

## 1. First 30 Minutes

Read these in order:

| Order | Doc | Purpose |
|---:|---|---|
| 1 | [Repository README](../README.md) | Project overview, topology, setup, deployment, guardrails. |
| 2 | [Documentation README](README.md) | Map of active docs vs archive. |
| 3 | [Final Handoff Checklist](04-operations/final-handoff-checklist.md) | Current handoff status and exact next action. |
| 4 | [New Developer Handoff](06-platform/18-new-developer-handoff.md) | Shortest safe path into v2/v3. |
| 5 | [V2 Implementation Index](06-platform/19-v2-implementation-index.md) | Ordered implementation sequence. |

## 2. Current System

| Doc | Use When |
|---|---|
| [System Overview](01-architecture/system-overview.md) | You need the current runtime/data model. |
| [Current Architecture Map](06-platform/15-current-architecture-map.md) | You need the live architecture grounded for v2 planning. |
| [Current File-by-File Review](06-platform/17-current-file-by-file-review.md) | You need to know which files matter and where risk lives. |
| [App API](03-api/app-api.md) | You are touching app/Worker routes. |
| [Cox/Manheim](03-api/manheim-cox.md) | You are touching MMR/catalog/valuation behavior. |
| [Runbook](04-operations/runbook.md) | You need deploy, smoke, or rollback steps. |

## 3. V2/V3 Control Docs

Every implementation PR should cite the relevant docs in this section.

| Doc | Purpose |
|---|---|
| [Platform README](06-platform/README.md) | Source hierarchy, milestone tags, traceability rule. |
| [Project Charter](06-platform/00-project-charter.md) | What the project is and is not. |
| [Business Requirements](06-platform/01-business-requirements.md) | Business rules in business language. |
| [Functional Requirements](06-platform/02-functional-requirements.md) | Numbered FRs by capability and milestone. |
| [Data Model](06-platform/03-data-model.md) | Schema/read-model plan and migration sequence. |
| [State Machines](06-platform/04-state-machines.md) | Allowed transitions and guards. |
| [API Contract](06-platform/05-api-contract.md) | Worker/app route contracts. |
| [UX Spec](06-platform/06-ux-spec.md) | Table, preview, detail, badges, states. |
| [Non-Functional Requirements](06-platform/07-non-functional-requirements.md) | Performance, reliability, privacy, audit. |
| [Metrics and Observability](06-platform/08-metrics-and-observability.md) | Events, KPIs, dashboards, logging rules. |
| [Test Strategy](06-platform/09-test-strategy.md) | Required tests and acceptance gates. |
| [Glossary and Data Dictionary](06-platform/10-glossary-and-data-dictionary.md) | Canonical terms, badges, statuses, enums. |
| [Migration and Rollout Plan](06-platform/11-migration-and-rollout-plan.md) | Phases, go/no-go, rollback. |
| [Security and Access](06-platform/12-security-and-access.md) | Role/tier matrix and access rules. |
| [Open Questions Log](06-platform/13-open-questions-log.md) | Decisions that must not be guessed. |
| [Decision Records](06-platform/14-decision-records/) | Durable architectural/product decisions. |

## 4. First V2 Code Slice

After the handoff docs merge, the first implementation slice is:

```text
Read-only Opportunities
  -> GET /app/opportunities
  -> GET /app/opportunities/:id
  -> /opportunities table + preview pane
  -> badges + honest empty/error states
  -> no claim/manual/offer/disposition mutations yet
```

Required source docs:

- [Functional Requirements](06-platform/02-functional-requirements.md): FR-001,
  FR-002, and read-only FR-004 through FR-010.
- [Data Model](06-platform/03-data-model.md): Opportunity read model.
- [State Machines](06-platform/04-state-machines.md): read-only states and badge
  events.
- [API Contract](06-platform/05-api-contract.md): `/app/opportunities*`.
- [UX Spec](06-platform/06-ux-spec.md): list, preview, detail, badges.
- [Test Strategy](06-platform/09-test-strategy.md): first-code-slice matrix.

## 5. Cleanup Summary

The repository was recently reorganized to reduce noise before v2 handoff.

What changed:

- Current docs were moved into numbered folders under `docs/`.
- Historical MVP, staging, UAT, and superseded notes were moved under
  `docs/archive/`.
- The active v2 platform control packet was consolidated under
  `docs/06-platform/`.
- The new developer handoff and implementation index were made explicit.
- Obsidian entry notes were updated to point to the same docs.
- RuFlo / claude-flow automation material is treated as incident history only;
  do not recreate it.

Why this helps:

- New developers no longer need to sift through old session artifacts to find
  the current plan.
- Historical context is preserved but no longer competes with current source of
  truth.
- v2 work has one traceability path:

```text
review source -> FR -> schema -> state machine -> API -> UX -> tests
```

## 6. Archive Rules

- Files in `docs/archive/` are historical unless a current doc links to them.
- Do not delete archive files casually; they explain prior decisions.
- Do not build from archived Make.com, staging, UAT, or superseded product docs
  unless a current doc explicitly reactivates that content.

## 7. Obsidian Sync

The repo is the source of truth. Obsidian should mirror entry points, not
duplicate every doc.

Sync these vault notes:

- `Topics/TAV-AIP.md`
- `ClaudeCode/TAV-AIP/START HERE.md`
- `Sessions/2026-05-18-tav-aip-v2-handoff-docs.md`
- `Sessions/2026-05-18-tav-aip-environment-cleanup.md`

They should point to:

- this index
- the platform README
- the new developer handoff
- the v2 implementation index
- the full platform control packet


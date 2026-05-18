# TAV-AIP Documentation

This folder separates current project truth from historical context.

Use the numbered folders for active development. Files under `docs/archive/` are
preserved for history and should not be treated as current instructions unless a
current doc links to them explicitly.

## Current Docs

### 01 — Architecture

- [System Overview](01-architecture/system-overview.md) — system topology, data model, and four-concept boundary.
- [Identity](01-architecture/identity.md) — current auth/identity direction.
- [Scale Architecture](01-architecture/scale-architecture.md) — scale, stale, and dedupe architecture notes.
- [ADRs](01-architecture/adr/) — durable architecture decisions.

### 02 — Product

- [Roadmap](02-product/roadmap.md) — current execution roadmap.
- [V2 Opportunities](02-product/v2-opportunities.md) — active v2 product spec.

### 03 — API

- [App API](03-api/app-api.md) — frontend product API contract.
- [Cox/Manheim](03-api/manheim-cox.md) — production Cox/Manheim integration notes.
- [Intelligence Contracts](03-api/intelligence-contracts.md) — main Worker to intelligence Worker contracts.

### 04 — Operations

- [Runbook](04-operations/runbook.md) — deploy, smoke, rollback, and operations.
- [Handoff](04-operations/handoff.md) — current branch/state handoff for the next session.
- [Verification](04-operations/verification.md) — required verification loop.

### 05 — Process

- [GitHub](05-process/github.md) — GitHub workflow and PR rules.
- [Voice](05-process/voice.md) — communication style.
- [Followups](05-process/followups.md) — scoped follow-up log.
- [Plan Prompts](05-process/plan-prompts/) — task planning templates.

### 06 — Platform

- [V2/V3 Platform Control Docs](06-platform/README.md) — buying-side platform charter, requirements, traceability, and decision controls.
- [Project Charter](06-platform/00-project-charter.md) — scope, success criteria, stakeholders, glossary.
- [Business Requirements](06-platform/01-business-requirements.md) — business rules tagged by milestone.
- [Open Questions Log](06-platform/13-open-questions-log.md) — unresolved decisions that must not be guessed during implementation.
- [Current Architecture Map](06-platform/15-current-architecture-map.md) — current live runtime, data, route, and integration map for v2 planning.
- [Final Outcome Architecture Map](06-platform/16-final-outcome-architecture-map.md) — target buying-side operating-system architecture for v2/v3.
- [Current File-by-File Review](06-platform/17-current-file-by-file-review.md) — active file/group review with purpose, risk, v2 relevance, and next action.

## Archive

- [2026-05 MVP Archive](archive/2026-05-mvp/) — historical MVP plans, specs, handoffs, staging/UAT notes, and retired scripts.
- [2026-05 Doc Consolidation Archive](archive/2026-05-doc-consolidation/) — detailed docs superseded by the current docs spine.

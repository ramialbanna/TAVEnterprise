# TAV-AIP Documentation

This folder separates current project truth from historical context.

Use the numbered folders for active development. Historical material lives in
[`../archive/`](../archive/) (outside this folder) and should not be treated as
current instructions unless an active doc links to it explicitly.

**Start here for what to do next:** [NEXT_STEPS.md](NEXT_STEPS.md)  
**MaxBuy + workflow/UI build plan (Cursor):** [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md)  
**Agent MCP / tools reference:** [tools.md](tools.md)

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

- [Next Steps](NEXT_STEPS.md) — living checklist (phases, follow-ups, PR order).
- [Runbook](04-operations/runbook.md) — deploy, smoke, rollback, and operations.
- [Handoff](04-operations/handoff.md) — current branch/state handoff for the next session.
- [Diagnostics](04-operations/diagnostics.md) — production ingest / lead-creation analysis (living index).
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

## Archive (repo root)

- [Documentation archive](../archive/README.md) — MVP history, doc consolidation, MaxBuy pre-code audits (not indexed for Cursor context by default).

# TAV-AIP Documentation

This folder separates current project truth from historical context.

Use the numbered folders for active development. Files under `docs/archive/` are
preserved for history and should not be treated as current instructions unless a
current doc links to them explicitly.

## Start Here

- [Master Documentation Index](INDEX.md) — first stop for new developers.
- [Final Handoff Checklist](04-operations/final-handoff-checklist.md) — current handoff readiness and exact next action.
- [New Developer Onboarding Email](04-operations/onboarding-email.md) — copy/paste email for incoming developers.

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
- [New Developer Handoff](06-platform/18-new-developer-handoff.md) — clean handoff for understanding current state, guardrails, and first safe implementation slice.
- [V2 Implementation Index](06-platform/19-v2-implementation-index.md) — ordered docs and PR sequence for v2/v3 work.

### 07 — Buybox (MaxBuy)

MaxBuy is TAV's internal adaptive buybox decision engine. This folder is the
complete pre-code documentation set. Nothing under `apps/maxbuy/` ships until
the punch list is closed.

- [MaxBuy Documentation Set](07-buybox/README.md) — entry point and reading guide for the doc set.
- [00 — Leadership Brief](07-buybox/00-LEADERSHIP-BRIEF.md) — executive strategic doc: what MaxBuy is, the 6-phase plan, the four owner decisions.
- [01 — Charter](07-buybox/01-CHARTER.md) — mission, scope, non-goals, acceptance criteria, owner decisions DEC-1..4.
- [02 — Architecture](07-buybox/02-ARCHITECTURE.md) — system context, online/offline split, serving decision, offline pipeline.
- [03 — Technical Spec](07-buybox/03-TECHNICAL-SPEC.md) — engineering contract: SQL DDL, serving API, decision replay, governance.
- [04 — Risk Register](07-buybox/04-RISK-REGISTER.md) — 18 risks across 5 reviewer lenses with mitigations.
- [05 — Punch List](07-buybox/05-PUNCH-LIST.md) — ordered 18-item pre-code execution checklist.
- [06 — Execution Plan](07-buybox/06-EXECUTION-PLAN.md) — dev-facing pre-code execution plan derived from the punch list.
- [Pre-code Audits & Spikes](07-buybox/audits/) — read-only audit/spike kits for the dev-owned punch-list items.

## Archive

- [2026-05 MVP Archive](archive/2026-05-mvp/) — historical MVP plans, specs, handoffs, staging/UAT notes, and retired scripts.
- [2026-05 Doc Consolidation Archive](archive/2026-05-doc-consolidation/) — detailed docs superseded by the current docs spine.

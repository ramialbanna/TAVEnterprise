# TAV-AIP

**TAV-AIP** is the Texas Auto Value AI platform for internal automotive operations, acquisition support, scoring logic, source integrations, and workflow automation.

This repository is being built as the operational backbone for disciplined, AI-assisted decision support inside TAV. The focus is not just shipping features fast, but building a system that is explainable, safe to deploy, integration-aware, and reliable under real business workflows.

---

## Overview

TAV-AIP is intended to centralize business-critical workflows that currently live across spreadsheets, fragmented tools, manual review steps, and source-specific logic.

The platform is being designed around a few core principles:

- **Operational safety** — protect high-risk write paths, deploy carefully, and keep rollback simple
- **Explainability** — scoring, reason codes, and business decisions should be inspectable
- **Data integrity** — VINs, listing states, and normalized source records must remain trustworthy
- **Integration resilience** — external source adapters and vendor payloads should fail safely
- **AI-assisted development** — use Claude Code productively, but with strong repo rules and guardrails

---

## What this repo includes

This repository is the working home for:

- CI/CD and staging deployment workflows
- Claude Code project guidance and local rules
- runbooks and incident response procedures
- security and secrets-handling conventions
- environment templates for local development
- future application code for sourcing, scoring, integrations, and internal workflows

At the moment, the repo is in a structured bootstrap phase: documentation, workflow safety, and repository conventions are being put in place before the product surface expands.

---

## Architecture

The exact implementation will evolve, but the intended architecture is organized around a few durable layers:

### 1. Source ingestion
External marketplaces, vendor feeds, and internal inputs are collected through controlled adapters and normalized into shared internal shapes.

Examples of likely responsibilities:
- source-specific payload parsing
- VIN-aware normalization
- deduplication support
- resilience to upstream schema drift

### 2. Business logic and scoring
Operational logic should live in explicit, testable services rather than hidden in route handlers or one-off scripts.

Examples of likely responsibilities:
- scoring and ranking
- reason-code generation
- validation and gating rules
- workflow status/state decisions

### 3. Internal APIs and workflows
The platform is expected to expose internal endpoints and workflow logic for review tools, sync jobs, dashboards, and downstream automations.

Design goals:
- thin handlers
- typed contracts
- explicit validation
- predictable error handling
- safe write behavior

### 4. Deployment and operations
Deployments, secrets, health checks, and staging approvals are treated as part of the product, not afterthoughts.

Operational goals:
- gated staging deploys
- secret hygiene
- clean CI behavior during bootstrap
- rollback-first incident handling
- documented runbooks

---

## Repository structure

```text
.
├── CLAUDE.md
├── README.md
├── .claude/
├── .github/workflows/
├── docs/
│   ├── PRODUCT_SPEC.md
│   ├── RUNBOOK.md
│   └── SECURITY.md
└── .dev.vars.example
```

### Key files

- `CLAUDE.md` — project-level operating instructions for Claude Code
- `.claude/` — local settings, rules, hooks, and Claude-specific project behavior
- `.github/workflows/` — CI, staging deploy, and automated review workflows
- `docs/RUNBOOK.md` — deploy wiring, incident response, and operational procedures
- `docs/PRODUCT_SPEC.md` — product direction, intended scope, and open questions
- `docs/SECURITY.md` — baseline security expectations, secrets handling, and safeguards
- `.dev.vars.example` — local environment template for development

---

## Workflows

### CI

The repository uses GitHub Actions for CI.

Current behavior:
- CI runs on pushes and pull requests
- Node-specific steps are skipped until `package.json` and `package-lock.json` exist
- secret scanning and TAV-specific guardrails continue to run during bootstrap

This lets the repo stay healthy while infrastructure and documentation are being set up before full application code lands.

### Staging deploy

A staging deploy workflow is already wired in principle and depends on GitHub-side configuration that does **not** live in the repo:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLAUDE_CODE_OAUTH_TOKEN`
- `STAGING_HEALTH_URL`
- GitHub `staging` environment with a required reviewer

See `docs/RUNBOOK.md` for the exact checklist.

### PR review automation

The repository also uses Claude-driven PR review workflows. These are useful once secrets and OAuth wiring are in place, but they are intentionally separate from the main CI path so documentation/setup gaps do not break the entire repo.

---

## Local setup

This project is currently optimized for a careful bootstrap workflow rather than one-command application startup.

### Initial setup

1. Clone the repository.
2. Review `CLAUDE.md` before making structural changes.
3. Copy `.dev.vars.example` to `.dev.vars`.
4. Replace placeholder values in `.dev.vars` with local development values.
5. Confirm GitHub secrets, variables, and the `staging` environment if you want deploy workflows enabled.
6. Once the app package exists, run the project-specific install and test commands.

### Local env file

Use `.dev.vars` for local-only secrets and configuration.

Important rules:
- never commit `.dev.vars`
- keep `.dev.vars.example` placeholder-only
- do not paste live credentials into docs, issues, or screenshots

---

## Security posture

TAV-AIP is intended to handle business-critical operational logic, so the repo is being structured with security discipline from the beginning.

Priority areas include:
- secret hygiene
- safe deploy gating
- validated inputs
- constrained write paths
- operational auditability
- careful handling of VINs, inventory state, scoring outputs, and integration credentials

See `docs/SECURITY.md` for the baseline expectations.

---

## Incident response

This repository includes operational guidance for failure handling, not just code guidance.

The runbook covers:
- CI/CD wiring
- staging deploy dependencies
- incident severity definitions
- first-response containment
- rollback guidance
- recovery validation
- post-incident follow-up

See `docs/RUNBOOK.md`.

---

## Roadmap

The roadmap below reflects the current intended direction and should be refined as product requirements firm up.

### Phase 0 — Bootstrap and guardrails
- Establish Claude Code project rules
- Wire CI and staging deploy workflows
- Add runbook, security docs, and local environment templates
- Set GitHub secrets, variables, and staging environment approvals

### Phase 1 — Core application skeleton
- Add application package structure
- Define shared types and contracts
- Create first health and status endpoints
- Stand up base validation, error handling, and config layers

### Phase 2 — Source and normalization layer
- Add source adapters
- Normalize inbound records into shared internal models
- Establish VIN-aware validation and deduplication patterns
- Add tests for payload drift and contract safety

### Phase 3 — Scoring and workflow logic
- Implement scoring engine and reason-code patterns
- Add workflow state handling and review support
- Separate advisory logic from write-enabled logic
- Add TAV-specific invariants and regression tests

### Phase 4 — Internal tooling and dashboards
- Add operator-facing review flows
- Expose workflow status, confidence, and reasoning
- Improve observability and operational diagnostics
- Support safer review, override, and audit trails

### Phase 5 — Hardening
- Expand automated tests
- improve health checks and deploy diagnostics
- tighten incident-response loops
- strengthen security controls and operational visibility

---

## Design principles

A few principles should remain true even as the implementation changes:

- Prefer explicitness over magic
- Keep business logic out of thin transport layers
- Treat writes as riskier than reads
- Favor rollback over heroic hotfixes
- Build for operational trust, not just feature completeness
- Make automation inspectable and recoverable

---

## Contributing

This is currently an internal project, and contributions should follow the repo’s documented conventions.

Before major changes:
- read `CLAUDE.md`
- review `.claude/rules/`
- check `docs/RUNBOOK.md`
- confirm any new secret, deploy, or integration behavior is documented

When changing workflows, contracts, or operational logic, prefer additive and reversible changes over broad rewrites.

---

## Status

This repository is under active setup and early architecture work.

That means some workflows, docs, and placeholders exist before the full app exists on purpose. The goal is to make sure TAV-AIP grows on top of a clean operational foundation instead of accumulating risky shortcuts.
# Current File-by-File Review

Status: Active current-state review  
Date: 2026-05-18  
Scope: Current `main` architecture and v2 readiness

This is the active replacement for the archived MVP-era file review at
`docs/archive/2026-05-mvp/root/ENGINEERING_REVIEW_AND_EXECUTION_PLAN.md`.
It is not a line-by-line code review. It is a planning map: what each major file
or file group owns, how risky it is, how it relates to v2, and what should happen
next.

Risk scale:

| Risk | Meaning |
|---|---|
| Low | Stable/supporting surface. Touch only when needed. |
| Medium | Important v2 dependency; changes need tests and traceability. |
| High | Core data/workflow/security boundary. Changes need careful plan + review. |

## 1. Root Control Files

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `README.md` | Repo front door, topology, setup, deploy, secrets, MMR status. | Medium | New contributors use this first. | Keep current; update when v2 routes ship. |
| `CLAUDE.md` | Agent/project operating rules. | High | Controls future coding sessions. | Keep lean; do not let memory dumps reappear. |
| `AGENTS.md` | Local generated memory stub. | Low | None for product. | Locally skip-worktree; do not use as product truth. |
| `package.json` | Root Worker scripts and dependencies. | Medium | Verification/deploy commands. | Keep deploy scripts explicit/manual. |
| `wrangler.toml` | Main Worker production/staging config. | High | Worker bindings, Apify, MMR mode. | Avoid casual edits; any env change needs runbook note. |
| `.dev.vars.example` | Local secret/config template. | High | Onboarding/local smoke. | Keep names only; never commit values. |

## 2. Active Documentation

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `docs/README.md` | Active documentation index. | Low | Navigation. | Keep all new v2 docs linked here. |
| `docs/01-architecture/system-overview.md` | Long-form architecture reference; some historical/target content remains. | Medium | Useful but not sole source. | Prefer `docs/06-platform/15-current-architecture-map.md` for current-state planning. |
| `docs/01-architecture/identity.md` | Project identity and scope. | Medium | Buying-side boundaries. | Keep aligned with charter. |
| `docs/01-architecture/scale-architecture.md` | Scale/stale/dedupe notes. | Medium | Future ingest scale. | Revisit after v2 queue proves traffic. |
| `docs/01-architecture/adr/*` | Durable architecture decisions. | High | Prevents re-litigation. | Add ADRs for new irreversible v2 decisions. |
| `docs/02-product/roadmap.md` | Execution roadmap. | Medium | Milestone framing. | Update only after doc spine decisions are made. |
| `docs/02-product/v2-opportunities.md` | Approved v2 Opportunities direction. | High | Product source of truth for v2. | Drive FR/data/state/API/UX docs from this. |
| `docs/03-api/app-api.md` | Main Worker `/app/*` contract. | High | v2 API additions must land here. | Update before implementation, not after. |
| `docs/03-api/intelligence-contracts.md` | Main/intelligence worker contract seams. | High | MMR/cache/user context stability. | Any contract change needs ADR. |
| `docs/03-api/manheim-cox.md` | Production Cox/Manheim path. | High | Valuation/catalog boundary. | Keep production-bound; no legacy `/valuations/*` drift. |
| `docs/04-operations/runbook.md` | Deploy, smoke, rollback. | High | Live testing safety. | Add v2 smoke checks once routes exist. |
| `docs/04-operations/handoff.md` | Current state handoff. | Medium | Next-session entry point. | Keep short; update after major PRs. |
| `docs/04-operations/verification.md` | Verification loop. | Medium | PR acceptance. | Add v2-specific test gates later. |
| `docs/05-process/github.md` | GitHub workflow. | Medium | Branch/PR hygiene. | Keep autopilot governance clear. |
| `docs/05-process/followups.md` | Known follow-ups. | Medium | Avoid forgotten cleanup. | Promote V2 blockers into open questions/FRs. |
| `docs/05-process/plan-prompts/*` | Task planning templates. | Low | Agent consistency. | Keep; update buyer-workflow prompt after v2 docs complete. |

## 3. Platform Control Docs

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `docs/06-platform/README.md` | Source hierarchy, milestone tags, traceability gate. | High | Governs all v2/v3 work. | Do not bypass. |
| `docs/06-platform/00-project-charter.md` | Scope, success criteria, glossary. | High | Prevents scope creep. | Stable; update only through deliberate docs PR. |
| `docs/06-platform/01-business-requirements.md` | Business rules by milestone. | High | BR source for FRs. | Expand only when decisions are made. |
| `docs/06-platform/13-open-questions-log.md` | Living decision log. | High | Blocks guessing. | Resolve V2-Core questions before code. |
| `docs/06-platform/14-decision-records/ADR-0001-progressive-approval-governance.md` | Approval governance sequencing. | High | Prevents overbuilding first offer PR. | Cite in any approval/offers work. |
| `docs/06-platform/15-current-architecture-map.md` | Current live architecture. | High | Grounds v2 against reality. | Use before writing FR/data/API docs. |
| `docs/06-platform/16-final-outcome-architecture-map.md` | Target final architecture. | High | Keeps v2 aligned to broader system. | Use to avoid dead-end v2 shortcuts. |
| `docs/06-platform/17-current-file-by-file-review.md` | This file. | Medium | Implementation planning index. | Refresh after major structural PRs. |
| `docs/06-platform/source/TAV_Platform_Full_Review.md` | Preserved source review. | High | Source proposal for v2/v3. | Do not edit; cite or distill into control docs. |

Missing active docs still required before v2 code:

| Pending file | Why it matters |
|---|---|
| `02-functional-requirements.md` | Converts BRs/open questions into testable FRs. |
| `03-data-model.md` | Prevents ad hoc migrations and concept collapse. |
| `04-state-machines.md` | Defines claim/assignment/status transitions. |
| `05-api-contract.md` | Lets frontend/backend work stay aligned. |
| `06-ux-spec.md` | Defines table, preview pane, detail, mobile/empty/error states. |
| `09-test-strategy.md` | Forces traceability from review to tests. |

## 4. Main Worker Entry And Routes

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `src/index.ts` | Cloudflare Worker entry; routes `/health`, `/ingest`, `/apify-webhook`, `/admin/*`, `/app/*`; scheduled stale sweep. | High | All v2 app API routes hang from here through `src/app/routes.ts`. | Keep route dispatch simple; avoid business logic here. |
| `src/app/routes.ts` | Product API consumed by web app; MMR, KPIs, ingest runs, historical sales. | High | Will receive `/app/opportunities*`. | Add routes only after API contract + tests. |
| `src/admin/routes.ts` | Ops/admin APIs; outcomes import, market settings, contract probe. | High | Admin/user/workflow ops may expand later. | Keep separate from product `/app/*`; do not leak admin secret to web. |
| `src/ingest/handleIngest.ts` | Full ingest pipeline from validated payload to leads. | High | Opportunities depend on this data. | Avoid v2 workflow writes here until data model is explicit. |
| `src/apify/webhookHandler.ts` | Apify bridge into ingest core. | High | Live source path. | Keep dedupe/config behavior observable. |
| `src/apify/datasetFetch.ts` | Fetches Apify dataset items. | Medium | Source quality/input volume. | Monitor no-output/dedup-heavy runs. |
| `src/apify/payloadAdapter.ts` | Converts Apify payloads to ingest shape. | Medium | Opportunity source completeness. | Add fields only with tests. |
| `src/apify/payloadSchema.ts` | Apify bridge schema. | Medium | Ingest reliability. | Keep strict enough to catch drift. |
| `src/apify/regionMap.ts` | Maps Apify tasks/regions. | Medium | Regional expansion. | Add regions deliberately with task IDs. |

## 5. Ingest, Identity, And Source Logic

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `src/validate.ts` | Zod ingest schemas. | High | Controls what can enter the system. | Any manual opportunity ingest reuse must not weaken validation. |
| `src/sources/facebook.ts` | Facebook parser and drift detector. | High | Primary source today. | Preserve VIN-optional behavior; expand source facts for opportunities carefully. |
| `src/dedupe/fingerprint.ts` | Identity key computation. | High | Drives seen-before/repeat behavior. | V2 event badges depend on correctness here. |
| `src/dedupe/matcher.ts` | Dedupe matching helpers. | Medium | Future duplicate context. | Review before building Opportunity duplicate UX. |
| `src/stale/scorer.ts` | Stale scoring. | Medium | Queue filtering/badges. | Make stale suppression visible in Opportunities. |
| `src/stale/engine.ts` | Scheduled stale sweep. | Medium | Keeps queue clean. | Add v2 smoke for stale impacts once queue exists. |
| `src/types/domain.ts` | Shared domain types. | High | Core concept vocabulary. | Avoid stuffing v2-only concepts here before schema is settled. |
| `src/types/env.ts` | Worker env bindings. | High | Secrets/services. | Update with config changes only. |
| `src/types/envValidation.ts` | Secret/config presence checks. | High | Auth/runtime safety. | Keep strict for production paths. |
| `src/types/intelligence.ts` | Intelligence Worker envelope types. | High | MMR/API parsing. | Keep in sync with intel worker tests. |

## 6. Valuation And MMR

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `src/valuation/workerClient.ts` | Main Worker client for intelligence Worker MMR calls. | High | All production MMR lookup flows. | Do not bypass service binding or error classification. |
| `src/valuation/mmr.ts` | Direct/legacy valuation path. | Medium | Still present; production uses worker mode. | Keep until deliberately removed. |
| `src/valuation/lookupMode.ts` | Selects direct vs worker lookup. | High | Production MMR behavior. | Keep production in worker mode. |
| `src/valuation/manheimResponseParser.ts` | Parses Manheim/Cox responses. | High | MMR display and stored values. | Extend only with fixtures/tests; never log licensed payloads. |
| `src/valuation/valuationResult.ts` | Normalizes valuation result semantics. | High | Estimate/unavailable behavior. | Preserve null/missing-reason distinction. |
| `src/valuation/normalizeMmrParams.ts` | Normalizes request parameters. | High | Catalog/YMM consistency. | Keep exact with Cox expectations. |
| `src/valuation/selectCatalogStyle.ts` | Style selection fallback/estimate support. | High | Estimated style badge behavior. | Do not hide estimates; surface flags. |
| `src/valuation/selectCatalogModelVariant.ts` | Model variant matching. | Medium | Catalog fit. | Keep tests as catalog grows. |
| `src/valuation/extractTitleTrim.ts` | Extracts trim from titles. | Medium | Estimate/style matching. | Useful for Opportunities enrichment. |
| `src/valuation/loadMmrReferenceData.ts` | Reference data loader. | Medium | Alias/normalization support. | Keep aligned with current Cox catalog. |

## 7. Scoring And Buybox

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `src/scoring/lead.ts` | Freshness/source/region/final score helpers. | High | Queue ranking and reason context. | Do not change without recalibrating queue meaning. |
| `src/scoring/deal.ts` | Deal score. | High | Current lead grade quality. | V2 should expose score explanation, not hide it. |
| `src/scoring/buyBox.ts` | Buybox matching. | High | Lead/near-miss decisions. | Near-miss queue needs filter/reason context from here. |
| `src/scoring/hybrid.ts` | Hybrid buybox score. | Medium | Current scoring blend. | Keep surfaced in attribution. |
| `src/scoring/segment.ts` | Segment profit score. | Medium | Future learning. | Avoid over-weighting until outcomes improve. |
| `src/scoring/demand.ts` | Market demand scoring. | Medium | Queue prioritization. | Validate against real outcomes later. |
| `src/scoring/mmrMileage.ts` | Mileage normalization/scoring. | High | Estimated mileage behavior. | Badges must follow any inference. |
| `src/alerts/alerts.ts` | Excellent-lead alerts. | Medium | Human notification layer. | Revisit once Opportunities owns assignment/claiming. |

## 8. Persistence Layer

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `src/persistence/supabase.ts` | Service-role Supabase client. | High | All DB writes. | Keep Worker-only. |
| `src/persistence/retry.ts` | Retry wrapper. | Medium | Reliability. | Use for transient DB/external writes. |
| `src/persistence/sourceRuns.ts` | Source-run idempotency/status. | High | Run identity shown in Opportunities. | Preserve run IDs for row context. |
| `src/persistence/rawListings.ts` | Raw listing insert. | High | Audit/source replay. | Never bypass. |
| `src/persistence/normalizedListings.ts` | Normalized listing upsert. | High | Opportunity facts. | V2 data model should reference, not duplicate blindly. |
| `src/persistence/vehicleCandidates.ts` | Vehicle candidate upsert. | High | Seen-before identity. | Central to repeat/VIN appeared badges. |
| `src/persistence/duplicateGroups.ts` | Listing-candidate links. | High | Duplicate context. | Use for Opportunity history. |
| `src/persistence/leads.ts` | Lead upsert. | High | Existing scored work items. | Do not force all v2 Opportunity behavior into this table. |
| `src/persistence/filteredOut.ts` | Filtered-out business rejections. | High | Near-miss source. | V2 must expose reviewable near-misses with reasons. |
| `src/persistence/deadLetter.ts` | Infra/transient failure writes. | Medium | Operational visibility. | Keep separate from near-miss business rejects. |
| `src/persistence/schemaDrift.ts` | Source drift events. | Medium | Source trust. | Surface source quality later. |
| `src/persistence/valuationSnapshots.ts` | Valuation hit/miss persistence. | High | MMR, missing reasons, estimates. | V2 must show honest valuation state. |
| `src/persistence/vehicleEnrichments.ts` | Enrichment payloads. | Medium | MMR normalization details. | Useful for detail page. |
| `src/persistence/buyBoxRules.ts` | Active buybox rules. | High | Lead/near-miss decisions. | Link reason codes to Opportunities. |
| `src/persistence/buyBoxScoreAttributions.ts` | Score explanation persistence. | High | Explainability. | Important for preview/detail. |
| `src/persistence/cronRuns.ts` | Scheduled job audit. | Medium | Ops status. | Include in admin health. |
| `src/persistence/ingestRuns.ts` | Ingest run list/detail. | Medium | Ingest monitor. | Good existing model for v2 run context. |
| `src/persistence/importBatches.ts`, `importRows.ts` | Outcome import batches and row audit. | Medium | Historical outcome ingestion. | Keep separate from live buying workflow. |
| `src/persistence/purchaseOutcomes.ts` | Purchase/sale outcomes. | High | Future learning/calibration. | Do not train from incomplete/unclean outcomes. |
| `src/persistence/historicalSales.ts` | Historical sales reads. | Medium | Comp context. | Useful but not first v2 queue dependency. |
| `src/persistence/marketDemandIndex.ts`, `marketExpenses.ts` | Market assumptions and demand. | Medium | Future prioritization/economics. | Keep basic spread-only in v2. |

## 9. Auth, Logging, And Outcomes

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `src/auth/bearerAuth.ts` | Bearer secret verification. | High | `/app/*` and `/admin/*`. | Keep timing-safe behavior. |
| `src/auth/hmac.ts` | Ingest HMAC verification. | High | Source integrity. | Do not weaken. |
| `src/auth/userContext.ts` | User context extraction. | High | Future user/tier work. | Replace env allowlists with DB roles when ready. |
| `src/logging/logger.ts` | Structured logs and serialization. | High | Compliance/ops. | Never log secrets or licensed MMR payloads. |
| `src/outcomes/import.ts` | Parses outcome imports. | Medium | Training data quality. | Validate before outcome-driven learning. |
| `src/outcomes/fingerprint.ts` | Outcome dedupe. | Medium | Import integrity. | Keep deterministic. |
| `src/outcomes/conditionGrade.ts` | Condition grade normalization. | Medium | Disposition/validation future. | Align with v3 grade semantics later. |

## 10. Intelligence Worker

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `workers/tav-intelligence-worker/wrangler.toml` | Intelligence Worker env/KV config. | High | Production Cox path. | Public URL off at steady state; secrets per env. |
| `workers/tav-intelligence-worker/src/routes/index.ts` | Intel route dispatcher. | High | Catalog/MMR route surface. | Keep service identity bypass tight. |
| `workers/tav-intelligence-worker/src/clients/manheimHttp.ts` | Cox/Manheim HTTP client. | High | MMR/catalog production boundary. | Most sensitive integration file; require tests. |
| `workers/tav-intelligence-worker/src/clients/manheim.ts` | Client interface/types. | High | Main/intel contracts. | Changing interface requires coordinated tests. |
| `workers/tav-intelligence-worker/src/clients/valuationsContractProbe.ts` | Redacted contract probe. | Medium | Future vendor verification. | Keep redacted; no licensed values in output. |
| `workers/tav-intelligence-worker/src/services/mmrLookup.ts` | MMR lookup orchestration/cache. | High | VIN/YMM result correctness. | Preserve missing-reason behavior. |
| `workers/tav-intelligence-worker/src/services/mmrLookupDeps.ts` | Lookup dependencies. | Medium | Testability. | Keep dependency injection clean. |
| `workers/tav-intelligence-worker/src/cache/*` | KV cache/lock/cache key logic. | High | MMR cost/perf/reliability. | Contract changes need ADR/cache migration. |
| `workers/tav-intelligence-worker/src/handlers/mmrVin.ts` | VIN handler. | High | MMR Lab/current valuation. | Keep result envelope stable. |
| `workers/tav-intelligence-worker/src/handlers/mmrYearMakeModel.ts` | YMM/style/mileage handler. | High | Live catalog valuation. | Enforce style + mileage gate. |
| `workers/tav-intelligence-worker/src/handlers/mmrCatalog.ts` | Catalog handler. | High | Dropdowns and future Opportunity enrichment. | No fake catalog fallback. |
| `workers/tav-intelligence-worker/src/handlers/valuationsContractProbe.ts` | Admin probe handler. | Medium | Ops verification. | Keep admin-gated and redacted. |
| `workers/tav-intelligence-worker/src/handlers/activityFeed.ts`, `activityVin.ts` | User activity. | Medium | Prior evaluator warnings. | Useful for v2 "already evaluated" notices. |
| `workers/tav-intelligence-worker/src/handlers/intelMmrQueries.ts`, `intelMmrCacheKey.ts`, `kpisSummary.ts` | MMR analytics/admin detail. | Medium | Observability. | Keep out of buyer-facing UI unless sanitized. |
| `workers/tav-intelligence-worker/src/handlers/salesUpload.ts` | Sales upload route. | Medium | Outcome ingestion. | Keep separate from live workflow. |

## 11. Web App

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `web/app/api/app/[...path]/route.ts` | Server-only proxy from browser/web to Worker `/app/*`. | High | All v2 web API calls. | Never expose `APP_API_SECRET`; keep timeout/error semantics. |
| `web/proxy.ts` | Auth gate for pages and APIs. | High | Staff-only access. | Keep JSON 401 for API. |
| `web/lib/env.ts` | Server env validation. | High | Web startup/secrets. | Add env names only when needed. |
| `web/lib/auth.ts` | Auth.js config. | High | Staff identity. | v2 roles still need DB model later. |
| `web/lib/app-api/client.ts` | Browser-safe API client. | High | New v2 UI calls. | Add Opportunity functions after API contract. |
| `web/lib/app-api/server.ts` | RSC server API client. | High | First-paint data. | Keep parallel with client parsers. |
| `web/lib/app-api/parse.ts`, `schemas.ts` | API response validation/parsing. | High | Contract safety. | Add Opportunity schemas before UI. |
| `web/app/(app)/layout.tsx` | Authenticated app shell. | Medium | New nav entry for Opportunities. | Add route only when first slice exists. |
| `web/app/(app)/dashboard/page.tsx` | KPI dashboard. | Medium | Future metrics. | Not first v2 surface. |
| `web/app/(app)/ingest/page.tsx` | Ingest monitor. | Medium | Source run visibility. | Useful reference for Opportunity run context. |
| `web/app/(app)/mmr-lab/page.tsx` | MMR Lab. | High | Valuation UI pattern and catalog integration. | Reuse APIs carefully; do not turn into Opportunity workflow. |
| `web/app/(app)/historical/page.tsx` | Historical sales. | Medium | Future context. | Link, do not overload. |
| `web/app/(app)/admin/page.tsx` | Admin/integrations status. | Medium | Ops controls. | Future user/admin controls likely branch from here. |
| `web/components/app-shell/*` | Navigation/topbar/sidebar/theme/user. | Medium | Opportunities navigation and role context. | Keep dense operational style. |
| `web/components/data-table/*` | Generic table components. | Medium | Opportunities table candidate. | Ensure supports badges, preview selection, density. |
| `web/components/data-state/*` | Empty/loading/error/unavailable states. | Medium | Honest missing/backend states. | Reuse for Opportunity empty/error states. |
| `web/components/ui/*` | shadcn primitives. | Low | UI building blocks. | Use existing primitives. |
| `web/lib/recommendation.ts` | Orphaned legacy recommendation helper. | Low | Not part of v2. | Candidate cleanup later; do not resurrect. |

## 12. Supabase Schema And Migrations

| Path | Purpose | Risk | V2 relevance | Action |
|---|---|---:|---|---|
| `supabase/schema.sql` | Canonical schema snapshot. | High | Source for data model review. | Keep in sync with migrations. |
| `supabase/migrations/0001_initial_schema.sql` | Initial schema. | High | Historical base. | Do not edit; add new migrations. |
| `supabase/migrations/0002_*`-`0044_*` | Incremental schema evolution. | High | Existing constraints and views. | New v2 migrations must be additive and trace to data model doc. |
| `supabase/repair-functions.sql` | Repair utilities. | Medium | Operational only. | Use carefully; document any run. |

Current schema strengths:

- Four-concept base is present: raw listings, normalized listings, vehicle candidates, leads.
- Rejection/observability tables exist: filtered out, dead letters, schema drift, source runs.
- Valuation and MMR query/cache tables exist.
- Outcome and historical sales tables exist.

Current schema gaps for v2:

- No first-class Opportunity read model/table yet.
- Manual submissions are not modeled.
- Claim/assignment audit is too light for 24-hour ownership workflow.
- Touch/contact history is not structured enough.
- Users/roles/tiers are not first-class in `tav` schema.
- Offer/disposition/validation/event tables are not present.

## 13. Tests And Quality Gates

| Area | Current coverage | V2 action |
|---|---|---|
| Root Worker unit tests | Strong coverage across ingest, scoring, valuation, auth, stale, routes. | Add tests per FR/state/API route. |
| Intelligence Worker tests | Strong around MMR cache, Cox HTTP, handlers, contract probe. | Keep before touching catalog/MMR. |
| Web unit tests | API parsers/client, components, env/auth. | Add Opportunity parser/component tests first. |
| E2E | Existing dashboard/MMR flows. | Add `/opportunities` table/preview/detail flows once built. |
| CI gates | Secret scan, TAV gates, verification loop, reviewer subagents. | Keep every v2 PR green before merge. |

## 14. Highest-Leverage Next Actions

Before implementation:

1. Complete `docs/06-platform/02-functional-requirements.md`.
2. Complete `docs/06-platform/03-data-model.md`.
3. Complete `docs/06-platform/04-state-machines.md`.
4. Complete `docs/06-platform/05-api-contract.md`.
5. Complete `docs/06-platform/06-ux-spec.md`.
6. Complete `docs/06-platform/09-test-strategy.md`.

First implementation should be a small `V2-Core` slice:

```text
read-only Opportunities list
  -> from existing leads + filtered_out + normalized/candidate/run context
  -> no claim writes yet
  -> no offers/dispositions yet
  -> table + preview pane + tests
```

That slice validates the read model without risking workflow write complexity.

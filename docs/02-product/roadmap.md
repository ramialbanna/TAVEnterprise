# TAV-AIP Execution Roadmap — v2 Opportunities

Date: 2026-05-18  
Status: Active execution plan (Phase 5 complete as of 2026-05-22)  
Owner model: Claude Code executes phase PRs; Codex reviews as architect, business analyst, coordinator, and orchestrator.

## Executive decision

Start v2 as the **Opportunities** workflow.

The v1.5 foundations are in place: production ingest visibility exists, live
Cox/Manheim catalog + YMM valuation is connected, and estimated mileage/style
inputs are explicitly badged. The next milestone is v2: an Opportunities queue
that lets buyers inspect created leads, near-misses, repeats, price changes, VIN
upgrades, estimated valuations, and manually submitted listing links routed to
specific closers.

The durable v2 product spec is `docs/02-product/v2-opportunities.md`.

Target sequence:

```text
Ingest + MMR Foundations -> v2 Opportunities Read Model -> Manual Submission + Assignment -> Workflow Mutations
```

## Current state

- Production frontend is live on Vercel.
- Production Worker `/app/*` API is live.
- Apify production bridge is enabled.
- `tav-tx-east` Apify schedule is enabled every 5 minutes and verified.
- `tav-tx-west`, `tav-tx-south`, and `tav-ok` remain disabled pending separate soaks.
- The frontend surfaces Dashboard, **Opportunities** (`/opportunities`), Ingest Monitor, VIN/MMR Lab, Historical Data, and Admin/Integrations.
- `/opportunities` shows read-only leads and near-misses with MMR spread and event badges (Phase 5 shipped 2026-05-22, commit `5975d1e`).
- `/ingest` explains Apify/source runs and why runs did or did not create leads.
- `/mmr-lab` uses the live Cox/Manheim catalog and can value YMM + style + miles.
- Missing mileage/style can be estimated, but must be badged clearly wherever surfaced.
- **Next:** manual submission, assign/claim, and workflow mutations (Phase 6–7).

## Why v2 is still needed

The data path exists:

```text
Apify -> ingest -> normalize/dedupe/value/score -> Supabase
```

The buyer workflow path does not yet exist:

```text
Supabase leads/near-misses/listings/candidates -> /app/opportunities -> /opportunities UI
```

The Ingest Monitor answers operational questions. V2 Opportunities answers buyer
questions: what should we call, watch, pass, or tune?

## Timeline

| Phase | Duration | Outcome |
|---|---:|---|
| Phase 0 | 0.5 day | Repo/env/schema hygiene locked |
| Phase 1 | 1 day | Backend hardening before more product work |
| Phase 2 | 2 days | `/app/ingest-runs` backend API |
| Phase 3 | 2 days | `/ingest` frontend Ingest Monitor |
| Phase 4 | 1 day | Production validation and lead-creation diagnosis |
| Phase 5 | 3-5 days | v2 Opportunities read model |
| Phase 6 | 4-7 days | manual submission + assignment foundation |
| Phase 7 | 4-7 days | v2 workflow mutations |
| Phase 8 | Ongoing | Region expansion, observability, optimization |

Practical planning estimate:

- 1 week to a trustworthy Apify-facing app.
- 2 weeks to read-only v2 Opportunities.
- 3-4 weeks to live assignment testing.
- 4+ weeks to useful workflow v2.

## Phase 0 — Hygiene and baseline

Goal: make sure local/project state is clean enough that Claude Code is not building on stale assumptions.

Claude Code tasks:

1. Clean local runtime config documentation.
2. Confirm which env files are intentionally local-only.
3. Update handoff docs with current production state.
4. Sync `supabase/schema.sql` with migrations `0043` and `0044`.
5. Verify `main` is clean except known local untracked artifacts.

Acceptance criteria:

- `supabase/schema.sql` includes `source_runs.status = truncated`.
- `valuation_snapshots.missing_reason` and the hit-or-miss constraint are reflected in the schema snapshot.
- No real secrets are in committed files.
- Handoff clearly states Apify `tav-tx-east` schedule is live and other regions are disabled.

Validation:

```bash
npm run typecheck
npm run lint
npm test -- --run
```

Codex review gate:

- Review schema changes.
- Confirm no accidental Supabase permission broadening.
- Confirm no secret values entered docs or fixtures.

## Phase 1 — Backend hardening

Goal: remove the sharp edges before expanding product surface.

Claude Code tasks:

1. Centralize bearer auth comparison into one constant-time helper.
2. Apply it to `/app/*`, `/admin/*`, and `/apify-webhook`.
3. Fix the Apify ingest contract mismatch:
   - either cap Apify dataset ingestion at 500 items, or
   - chunk Apify items into multiple validated ingest envelopes.
4. Add AbortController timeouts to Apify dataset/run fetches.
5. Expand CI secret scan to include:
   - `APP_API_SECRET`
   - `APIFY_TOKEN`
   - `APIFY_WEBHOOK_SECRET`
   - `AUTH_SECRET`
   - `AUTH_GOOGLE_SECRET`
   - generic `apify_api_` tokens
6. Add focused tests.

Acceptance criteria:

- Internal Apify bridge no longer silently bypasses intended ingest limits.
- Auth comparisons are consistent.
- Secret scan catches the class of mistakes already encountered during launch.
- Existing Apify webhook behavior remains compatible.

Codex review gate:

- Review security posture.
- Review four-concept integrity: Raw, Normalized, Vehicle Candidate, Lead.
- Confirm no unrelated refactors are bundled in the hardening PR.

## Phase 2 — Backend v1.5 Ingest API

Goal: expose Apify results through the product API.

Add:

```text
GET /app/ingest-runs
GET /app/ingest-runs/:id
```

Claude Code tasks:

1. Create persistence functions for source-run list/detail.
2. Add `/app/ingest-runs` route.
3. Add `/app/ingest-runs/:id` route.
4. Return summary fields:
   - run id
   - source
   - region
   - status
   - item count
   - processed
   - rejected
   - created leads
   - started/created time
   - scraped time
   - error message
5. Return detail fields:
   - raw listing count
   - normalized listing count
   - filtered-out count grouped by reason
   - valuation miss count grouped by reason
   - schema drift events
   - dead letters
   - created lead ids/count
6. Update `docs/03-api/app-api.md`.
7. Add unit tests.

Acceptance criteria:

- Admin still works.
- Existing `/app/*` contracts are unchanged.
- New endpoints are read-only.
- No browser-to-Supabase direct access is introduced.

Codex review gate:

- Review API shape before frontend work begins.
- Confirm names distinguish latest run, run history, processed listings, rejected listings, and created leads.

## Phase 3 — Frontend v1.5 Ingest Monitor

Goal: make Apify visible to the operator.

Add:

```text
/web/app/(app)/ingest/page.tsx
```

Claude Code tasks:

1. Add nav entry: Ingest Monitor.
2. Add typed API client methods:
   - `listIngestRuns`
   - `getIngestRun`
3. Add Zod/client schemas.
4. Build recent runs table:
   - status
   - source
   - region
   - run id
   - processed/rejected/leads
   - started/finished/scraped time
5. Build run detail drawer:
   - summary
   - rejection reasons
   - valuation misses
   - schema drift
   - raw/normalized/lead counts
   - source run id copy affordance
6. Add empty/error/loading states.
7. Add tests and MSW fixtures.
8. Add Playwright smoke test.

Acceptance criteria:

- User can answer: "What happened with the last Apify run?"
- User can answer: "Why did this run create zero leads?"
- User can distinguish latest run from cumulative totals.
- No fake/demo data is shown in production.

Codex review gate:

- Review UX language.
- Confirm labels say "latest run", "run history", "processed listings", "rejected listings", and "created leads" instead of vague "results".
- Verify screenshots across desktop and narrow viewports.

## Phase 4 — Production validation and diagnosis

Goal: use the new monitor to diagnose actual business behavior.

Claude Code tasks:

1. Deploy v1.5.
2. Watch several `tav-tx-east` scheduled runs.
3. Capture run stats:
   - item count
   - processed
   - rejected
   - created leads
   - top rejection reasons
   - top valuation miss reasons
4. Identify why `created_leads=0`.
5. Produce one diagnosis doc.

Likely causes to test:

- Listings do not match buy-box rules.
- MMR is missing due trim/mileage gaps.
- Adapter data quality is low.
- Leads are duplicates.
- Score threshold is too strict.
- Runs are simply too small.

Acceptance criteria:

- We know whether the blocker is sourcing, normalization, valuation, scoring, or product visibility.
- We have one concrete recommendation before enabling more regions.

Codex review gate:

- Decide from evidence whether to tune scoring, adapter mapping, buy-box rules, or source configuration.

## Phase 5 — v2 read-only Opportunities

Start only after Phase 4.

Goal: show actual acquisition opportunities without allowing users to mutate state yet.

Backend:

```text
GET /app/opportunities
GET /app/opportunities/:id
```

Frontend:

```text
/opportunities
```

Claude Code tasks:

1. Add opportunity list endpoint joining:
   - lead
   - near-miss / filtered-out listing where reviewable
   - normalized listing
   - vehicle candidate
   - duplicate group context
   - latest valuation
   - score components
   - source run/source
2. Add opportunity detail endpoint.
3. Build Opportunities page:
   - vehicle
   - price
   - MMR
   - spread vs MMR
   - score
   - reason codes
   - source
   - first/last seen
   - run identity
   - event badges: First seen, Seen again, Price changed, VIN appeared, Estimated miles/style/MMR, Near miss
   - status if available
4. Add preview pane on single click.
5. Add full detail page on double click.
6. Keep it read-only.

Acceptance criteria:

- TAV can inspect created leads and reviewable near-misses.
- TAV can identify first sightings, repeat sightings, price changes, and VIN upgrades.
- Estimated mileage/style/MMR are clearly badged.
- No assignment/status/notes yet.
- No user ownership model is required yet.

Codex review gate:

- Review business usefulness. If the Opportunities queue does not help decide "call, watch, tune, or pass", it is not v2-ready.

## Phase 6 — manual submission + assignment foundation

Goal: add manual submission and safe assignment so live users can test the real
current workflow.

Claude Code tasks:

1. Add user/profile/role model.
2. Decide identity path:
   - Auth.js identity forwarded server-side, or
   - Cloudflare Access/JWT-based backend identity.
3. Add manual opportunity submission:
   - listing URL
   - optional known vehicle facts
   - submitter/finder
   - optional assigned closer
   - notes/context
4. Add assignment routing:
   - assign owner
   - claim unassigned opportunity
   - set 24-hour claim window
   - show claim/evaluation collision warning with user and timestamp
   - reassign
   - unassign
5. Add audit table/events for submission and assignment.
6. Add concurrency protection for claim/assign.

Acceptance criteria:

- Buyer/finder can submit a listing link into the Opportunities queue.
- Buyer/finder can route it to a specific closer.
- Closers can see assigned opportunities.
- All buyers and closers can see the entire queue during live testing.
- Claim is the first required action.
- Claim owner, timestamp, and 24-hour expiration are visible.
- Users are warned when another person already evaluated/claimed an opportunity.
- Assignment changes are audited with actor and timestamp.
- Two users cannot silently claim the same opportunity.

Codex review gate:

- Review identity, authorization, and audit before live user testing.

## Phase 7 — v2 workflow mutations

Goal: turn the product into an operating tool.

Claude Code tasks:

1. Add opportunity workflow mutations:
   - mark reviewed
   - mark contacted
   - mark bought
   - mark passed
   - add note
2. Every mutation writes an audit action.
3. Add optimistic UI only after server audit is correct.

Acceptance criteria:

- Every mutation has actor, timestamp, old/new state.
- No anonymous shared bearer-only writes.
- Opportunity history is inspectable.

Codex review gate:

- Review authZ, auditability, and operational safety before production deploy.

## Phase 8 — Region expansion

Goal: scale ingestion only after visibility exists.

Order:

1. Keep `tav-tx-east` running.
2. Enable `tav-tx-west`.
3. Soak.
4. Enable `tav-tx-south`.
5. Soak.
6. Enable `tav-ok`.
7. Soak.

Acceptance criteria per region:

- No duplicate run ids.
- No stuck `running` rows.
- Reasonable rejection rate.
- No webhook retries.
- No unexpected lead explosion.
- Monitor shows every run clearly.

## GitHub/Claude Code execution model

Claude Code should execute one phase at a time as small PRs.

Recommended PR sequence:

1. `chore: sync schema and harden secrets guard`
2. `fix: harden app/admin/apify auth and apify ingest limits`
3. `feat: add ingest-runs app api`
4. `feat(web): add ingest monitor`
5. `docs: add apify run diagnosis`
6. `feat: add read-only lead app api`
7. `feat(web): add lead review`
8. `feat: add lead workflow mutations`

Every PR should include:

- changed files
- migration impact
- test commands run
- screenshots for frontend
- production risk
- rollback plan

Codex reviews each PR for:

- architecture boundaries
- data model correctness
- product usefulness
- security posture
- operational risk
- test adequacy
- whether it advances the roadmap or just adds surface area

## Next Claude Code prompt

Use this as the next execution request:

```text
Implement Phase 0 and Phase 1 only.

Scope:
- Sync supabase/schema.sql with migrations 0043 and 0044.
- Add a shared constant-time bearer auth helper and use it in app/admin/apify auth paths.
- Fix the Apify bridge ingest contract mismatch by validating or chunking so it no longer bypasses IngestRequestSchema max item limits.
- Add fetch timeouts to Apify dataset/run fetches.
- Expand CI secret scan for APP_API_SECRET, APIFY_TOKEN, APIFY_WEBHOOK_SECRET, AUTH_SECRET, AUTH_GOOGLE_SECRET, and apify_api_ tokens.
- Add focused tests.
- Do not build /ingest yet.
- Do not touch v2 lead workflow yet.
```

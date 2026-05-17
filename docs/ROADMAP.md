# TAV-AIP Execution Roadmap — v1.5 to v2

Date: 2026-05-16  
Status: Active execution plan  
Owner model: Claude Code executes phase PRs; Codex reviews as architect, business analyst, coordinator, and orchestrator.

## Executive decision

Do not start v2 yet.

TAV-AIP is in a strong but incomplete v1 state. The Apify backend path is live, and `tav-tx-east` is scheduled in production, but the product does not yet expose the operational visibility needed to trust and tune ingestion. The next milestone is v1.5: an Ingest Monitor that explains every Apify run and why it did or did not produce leads.

Target sequence:

```text
Stabilize -> Ingest Visibility -> Lead Diagnosis -> v2 Read-Only Lead Review -> v2 Workflow Mutations
```

## Current state

- Production frontend is live on Vercel.
- Production Worker `/app/*` API is live.
- Apify production bridge is enabled.
- `tav-tx-east` Apify schedule is enabled every 5 minutes and verified.
- `tav-tx-west`, `tav-tx-south`, and `tav-ok` remain disabled pending separate soaks.
- The frontend v1 surfaces only Dashboard, VIN/MMR Lab, Historical Data, and Admin/Integrations.
- Admin/Integrations shows latest source-run health only. It is not the Apify results screen.
- The designed Apify results surface is `/ingest`, planned as v1.5.

## Why the user still does not see Apify results

The data path exists:

```text
Apify -> /apify-webhook -> ingestCore -> Supabase
```

The product visibility path does not yet exist:

```text
Supabase source_runs/raw/normalized/rejections -> /app/ingest-runs -> /ingest UI
```

The current `/app/system-status` endpoint reads `tav.v_source_health`, which is a latest-health summary. Seeing one row or one processed item can be correct because it represents the latest run for the enabled source/region, not cumulative results and not a lead queue.

## Timeline

| Phase | Duration | Outcome |
|---|---:|---|
| Phase 0 | 0.5 day | Repo/env/schema hygiene locked |
| Phase 1 | 1 day | Backend hardening before more product work |
| Phase 2 | 2 days | `/app/ingest-runs` backend API |
| Phase 3 | 2 days | `/ingest` frontend Ingest Monitor |
| Phase 4 | 1 day | Production validation and lead-creation diagnosis |
| Phase 5 | 3-5 days | v2 read-only Lead Review |
| Phase 6 | 4-7 days | v2 lead workflow mutations |
| Phase 7 | Ongoing | Region expansion, observability, optimization |

Practical planning estimate:

- 1 week to a trustworthy Apify-facing app.
- 2 weeks to read-only v2 Lead Review.
- 3-4 weeks to useful workflow v2.

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
6. Update `docs/APP_API.md`.
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

## Phase 5 — v2 read-only Lead Review

Start only after Phase 4.

Goal: show actual acquisition opportunities without allowing users to mutate state yet.

Backend:

```text
GET /app/leads
GET /app/leads/:id
```

Frontend:

```text
/leads
```

Claude Code tasks:

1. Add lead list endpoint joining:
   - lead
   - normalized listing
   - vehicle candidate
   - latest valuation
   - score components
   - source run/source
2. Add lead detail endpoint.
3. Build Lead Review page:
   - vehicle
   - price
   - MMR
   - spread
   - score
   - reason codes
   - source
   - first/last seen
   - status if available
4. Keep it read-only.

Acceptance criteria:

- TAV can inspect opportunities.
- No assignment/status/notes yet.
- No user ownership model is required yet.

Codex review gate:

- Review business usefulness. If the lead list does not help decide "call or pass", it is not v2-ready.

## Phase 6 — v2 workflow mutations

Goal: turn the product into an operating tool.

Claude Code tasks:

1. Add user/profile/role model.
2. Decide identity path:
   - Auth.js identity forwarded server-side, or
   - Cloudflare Access/JWT-based backend identity.
3. Add lead mutations:
   - assign owner
   - mark reviewed
   - mark contacted
   - mark bought
   - mark passed
   - add note
4. Add audit table.
5. Add frontend controls.
6. Add optimistic UI only after server audit is correct.

Acceptance criteria:

- Every mutation has actor, timestamp, old/new state.
- No anonymous shared bearer-only writes.
- Lead history is inspectable.

Codex review gate:

- Review authZ, auditability, and operational safety before production deploy.

## Phase 7 — Region expansion

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


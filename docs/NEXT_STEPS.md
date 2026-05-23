# Next Steps

**Last updated:** 2026-05-23  
**Owner:** Engineering (update this file when priorities shift)

Living checklist for what to do next. For phase detail and acceptance criteria, see
[roadmap](02-product/roadmap.md). For branch/PR state and secrets, see
[handoff](04-operations/handoff.md). For small scoped items, see
[followups](05-process/followups.md).

---

## Current focus

**North star:** v2 Opportunities is **feature-complete** for buyer workflow (queue → assign → claim → status → notes).

**Immediate engineering priority:** Phase 8 — region expansion soak, plus tactical follow-ups (ingest Playwright smoke, near-miss filter polish).

**Product gap today:** None blocking live buyer workflow testing. Region expansion and KPI polish remain.

---

## Status legend

- `[ ]` — not started or not verified done
- `[~]` — in progress or partially done (verify before checking off)
- `[x]` — done (add date in commit or here when closing)

---

## Phase checklist (execution order)

Aligned with [roadmap](02-product/roadmap.md). Do not skip Phase 4 before Phase 5.

### Phase 0 — Hygiene and baseline (~0.5 day)

- [x] Sync `supabase/schema.sql` with migrations `0043` and `0044` (2026-05-20 — verified locally; 0044 applied to Supabase)
- [x] Confirm local-only env files are documented (`.dev.vars`, `web/.env.local`) (2026-05-20 — templates + README/handoff/system-overview aligned)
- [x] Update [handoff](04-operations/handoff.md) if production state changed (2026-05-23 — Phase 6 deploy, migrations 0045–0047, repo HEAD)
- [x] Verify `main` is clean except known local-only artifacts (2026-05-21 — confirmed by operator)
- [x] Confirm no secrets in committed files (2026-05-21 — CI pattern + local grep clean; examples use `replace_me` only)

### Phase 1 — Backend hardening (~1 day)

- [x] Centralize bearer auth into one constant-time helper (`/app/*`, `/admin/*`, `/apify-webhook`) (2026-05-21 — `src/auth/bearerAuth.ts`)
- [x] Fix Apify bridge ingest limit: cap at 500 items or chunk into validated envelopes (2026-05-21 — cap + `IngestRequestSchema` validation in webhook handler)
- [x] Add `AbortController` timeouts to Apify dataset/run fetches (2026-05-21 — `AbortSignal.timeout` in `datasetFetch.ts`)
- [x] Expand CI secret scan (`APP_API_SECRET`, `APIFY_*`, `AUTH_*`, `apify_api_` tokens) (2026-05-21 — `.github/workflows/ci.yml` secret-scan job)
- [x] Add focused tests for the above (2026-05-21 — bearerAuth, apify webhook/datasetFetch, ingestCap; 57 tests pass)

### Phase 2 — Ingest runs API (~2 days)

- [x] `GET /app/ingest-runs` and `GET /app/ingest-runs/:id` (2026-05 — verify against [app-api](03-api/app-api.md))
- [x] Persistence + unit tests for ingest-runs

### Phase 3 — Ingest Monitor UI (~2 days)

- [x] `/ingest` page with run list + detail drawer (2026-05)
- [ ] Playwright smoke for ingest path (if not already green in CI)

### Phase 4 — Production validation (~1 day)

- [x] Watch several live `tav-tx-east` scheduled runs in production (2026-05-21 — verified via Supabase through 2026-05-21 UTC)
- [x] Record: items, processed, rejected, created leads, top rejection/valuation-miss reasons (2026-05-21 — see diagnosis doc)
- [x] Diagnose why `created_leads = 0` when it happens (2026-05-21 — adapter reject + valuation miss + pass-grade economics; not outage)
- [x] Write one short diagnosis note (2026-05-21 — [diagnostics.md](04-operations/diagnostics.md) + [2026-05-21 snapshot](04-operations/apify-production-diagnosis-2026-05-21.md))
- [x] Decide whether to tune scoring, adapter, buy-box, or source config before enabling more regions (2026-05-21 — keep east only; ship v2 near-miss visibility; source/valuation tuning in follow-up PRs)

### Phase 5 — v2 read-only Opportunities (3–5 days)

**Spec:** [v2-opportunities](02-product/v2-opportunities.md) · **Platform controls:** [06-platform](06-platform/README.md)

- [x] `GET /app/opportunities` and `GET /app/opportunities/:id` (2026-05-22)
- [x] `/opportunities` UI: list, preview, detail, event badges (read-only) (2026-05-22)
- [x] Clear badges for estimated mileage / style / MMR (2026-05-22)
- [x] Update [app-api](03-api/app-api.md) and tests (2026-05-22)

### Phase 6 — Manual submit + assignment (4–7 days)

- [x] User/profile/role model — `tav.users` + Auth.js identity forwarded via proxy (2026-05-22)
- [x] Manual listing URL submission + optional closer routing (2026-05-22 — API + `/opportunities` submit dialog)
- [x] Assign / claim / 24h window / collision warnings + audit events (2026-05-23)

### Phase 7 — Workflow mutations (4–7 days)

- [x] reviewed / contacted / negotiating / bought (`purchased`) / passed / notes (2026-05-23 — migration 0048, status + notes APIs, web UI)
- [x] Every mutation audited (actor, timestamp, old/new state) (2026-05-23 — `status_changed` + `note_added` in `tav.opportunity_actions`)
- [x] No anonymous shared-bearer-only writes (2026-05-23 — Auth.js identity required via proxy headers)

### Phase 8 — Region expansion (ongoing)

- [x] `tav-tx-east` schedule live (5 min) — verify still healthy
- [ ] Soak + enable `tav-tx-west`
- [ ] Soak + enable `tav-tx-south`
- [ ] Soak + enable `tav-ok`

---

## Tactical follow-ups

From [followups](05-process/followups.md) — check off here when done, then remove from followups or mark done there too.

### Product / data

- [ ] True sell-through KPI (blocked until bought-not-sold inventory is persisted)
- [ ] Confirm stale sweep cron wrote `tav.cron_runs` and `staleSweep.lastRunAt` appears in system status

### MMR / Cox

- [ ] Monitor production Cox catalog/YMMT; track badge/cost/UI refinements
- [ ] Add `cox.environment` (or equivalent) to `GET /app/system-status`
- [ ] Run `pnpm test:contract` against staging after Cox production cutover

### Web / CI

- [ ] Recheck local `web` dev after `web/.env.local` is populated
- [ ] Decide if `web-ci` should run `next build` before `typecheck` with `typedRoutes`
- [ ] Dashboard e2e error-state scenarios (when worth the mock plumbing)

### Ops / cleanup

- [ ] Staging-strip cleanup — **separate PR**, do not mix with feature work
- [ ] Review orphaned recommendation code after MMR Lab legacy removal
- [ ] Keep RuFlo / claude-flow autopilot disabled unless governance approves

---

## Scale / efficiency (later)

Not blocking v2. Revisit when ingest volume or region fan-out stresses the sync pipeline.

- [ ] Thin ingest: persist raw → async enrich (Cloudflare Queues or equivalent)
- [ ] Throttle/batch MMR calls; avoid blocking full batch on per-item Cox latency
- [ ] Revisit [ADR queue deferral](01-architecture/adr/0001-drop-make-com.md) when batches routinely hit 500 items or 25s deadline

---

## Recommended PR sequence

1. `chore: sync schema and harden secrets guard` (Phase 0)
2. `fix: harden app/admin/apify auth and apify ingest limits` (Phase 1)
3. `docs: apify run diagnosis` (Phase 4)
4. `feat: add read-only opportunities app api` (Phase 5)
5. `feat(web): add opportunities queue` (Phase 5)
6. `feat: manual submission + assignment` (Phase 6) — **shipped** (`cf76a9c`, deployed 2026-05-23)
7. `feat: opportunity workflow mutations` (Phase 7) — **shipped** (2026-05-23 — Worker `efda0005`, migration 0048, web UI)

---

## How to update this file

1. Change **Last updated** at the top.
2. Check off items when verified (tests + deploy/smoke if applicable).
3. Move completed phase sections to a short **Done** note at the bottom (optional) or leave `[x]` for history.
4. Keep [handoff](04-operations/handoff.md) in sync for branch/PR-specific state.
5. Do not duplicate long specs here — link to roadmap / v2-opportunities / platform docs instead.

---

## Done (recent)

| Date | Item |
|------|------|
| 2026-05-23 | Phase 7 complete — status + notes APIs, action history UI, migration 0048; Worker deploy `tav-aip-production` version `efda0005` |
| 2026-05-23 | Production deploy — `tav-aip-production` version `647ec3e7`; Vercel green after `1a4b936`; Supabase 0045–0047 applied |
| 2026-05-23 | Wrangler setup — `account_id` pinned in `wrangler.toml` (`73dbe6d`) |
| 2026-05-23 | Phase 6 Slice C — assign/claim/evaluate API, workflow tables, `/opportunities` assignment UI (`cf76a9c`) |
| 2026-05-22 | Phase 6 Slice B — identity, manual submit API, `/opportunities` submit dialog |
| 2026-05-21 | Phase 4 production diagnosis — [diagnostics.md](04-operations/diagnostics.md) + east ingest snapshot |
| 2026-05-21 | Phase 0 + Phase 1 verified complete (secret scan, bearer auth, Apify cap/timeouts/tests) |
| 2026-05-21 | Refreshed `handoff.md` production state (Apify east live, schema 0044, lead-creation gap) |
| 2026-05-20 | Documented local-only env files (`.dev.vars`, `web/.env.local`) across templates and ops docs |
| 2026-05-20 | Synced `supabase/schema.sql` with migrations 0043/0044; applied 0044 (`truncated` status) to Supabase |
| 2026-05 | Cox/Manheim catalog + YMM on `main`; MMR Lab live |
| 2026-05 | Ingest runs API + Ingest Monitor UI shipped |
| 2026-05 | Dropped Make.com from target architecture ([ADR 0001](01-architecture/adr/0001-drop-make-com.md)) |

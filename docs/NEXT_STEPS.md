# Next Steps

**Last updated:** 2026-05-26  
**Owner:** Engineering (update this file when priorities shift)

Living checklist for what to do next. For phase detail and acceptance criteria, see
[roadmap](02-product/roadmap.md). For branch/PR state and secrets, see
[handoff](04-operations/handoff.md). For small scoped items, see
[followups](05-process/followups.md).

---

## Current focus

**North star:** v2 Opportunities is **feature-complete** for buyer workflow (queue → assign → claim → status → notes).

**Immediate engineering priority:** Phase 8 soak — enable Apify schedules per [apify-phase8-regions](04-operations/apify-phase8-regions.md) (west → south → ok).

**Product gap today:** Backend workflow is live; **UI polish** is the main gap for everyday buyers, closers, and finders (see [UI / product polish](#ui--product-polish-user-friendly-web-app) below). Region expansion soak continues in parallel.

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
- [~] Soak + enable `tav-tx-west` (code + migration 0049 shipped; enable schedule `KD49MXipQmFUEiIRc` per phase8 runbook)
- [~] Soak + enable `tav-tx-south` (mapped `san_antonio_tx`; enable schedule `6yk59JRahCfbTy2h8` after west soak)
- [~] Soak + enable `tav-ok` (2026-05-26 — `oklahoma_city_ok` migration 0050 + map; enable schedule `0qdlWHsaojVZxEb1s` after south soak)

---

## UI / product polish (user-friendly web app)

**Audience:** Buyers, closers, and finders who are comfortable with normal business apps (email, CRM, spreadsheets) but should not need to know internal codes (`dallas_tx`, Apify, near-miss reason enums, etc.).

**Goal:** Make `/opportunities` the obvious daily home — easy to scan, filter, claim, update status, and submit links — with plain language, clear actions, and helpful empty/error states.

**Spec reference:** [v2-opportunities](02-product/v2-opportunities.md) (near-miss filter, valuation index, and badge rules still apply).

### Suggested priority

| Tier | When | Focus |
|------|------|--------|
| **P0** | First UI sprint | Wording, filters, money columns, claim timer, workflow clarity, submit flow, vehicle summary |
| **P1** | Second sprint | Search/sort, pagination, tooltips, nav labels, multi-region, onboarding, friendlier errors |
| **P2** | Later | Column toggles, ingest simplification for non-admins, dashboard “my team”, keyboard shortcuts |

---

### A. Wording and trust (quick wins)

- [ ] **#1** Update outdated help text on Opportunities — page still says claim/notes are “coming later”; features are live (Phase 6–7)
- [ ] **#2** Replace internal jargon in page headers — e.g. Ingest “Apify / source runs” → “Marketplace import runs”; explain “Near miss” as “Almost qualified” or “Close, but filtered out” with a short tooltip
- [ ] **#3** Human region names everywhere — show “Dallas, TX” not `dallas_tx` in tables, filters, and detail (submit dialog already uses friendly labels; extend to queue + detail)
- [ ] **#4** Explain badges on hover — one-line tooltips for “Estimated mileage”, “Price changed”, “Seen again”, etc.
- [ ] **#5** Review sidebar nav labels — e.g. keep “Opportunities” or use “Buyer queue”; consider “Import activity” instead of “Ingest Monitor” for non-technical users

---

### B. Opportunities queue (main daily screen)

- [ ] **#6** Simple filter bar — dropdowns/chips: what to show, market, status, assigned to (wire existing API filters; no raw enum typing)
- [ ] **#7** Preset views (one click) — “My work”, “Unassigned”, “Hot leads only”, “Manual submissions”, “Needs follow-up” (contacted / negotiating)
- [ ] **#8** Search box — by title, make/model, or listing URL fragment
- [ ] **#9** Sort options — newest first, best score, biggest spread (asking vs MMR)
- [ ] **#10** Show more than 50 rows — “Load more” or pagination so users know the list isn’t complete
- [ ] **#11** Clear empty states — “No vehicles match these filters” + reset filters button
- [ ] **#12** Queue summary in plain English — e.g. “12 ready to call · 5 waiting for a closer · 3 submitted today” (not only raw type counts)

---

### C. Table and list readability

- [ ] **#13** Fewer columns by default; optional “Show more columns” — reduce overwhelm on laptop/mobile
- [ ] **#14** Highlight the money story — group asking price, MMR, and spread visually (core buy decision)
- [ ] **#15** Color-coded deal quality — green / yellow / gray for lead grade or spread band + short legend
- [ ] **#16** Claim timer in the list — e.g. “Claim expires in 4h 12m” so closers don’t lose work silently
- [ ] **#17** Single “Owner” column — assignee + claimed-by at a glance (initials/avatar if available)
- [ ] **#18** Obvious “Open listing” action — opens marketplace URL in new tab from row and detail

---

### D. Workflow (assign, claim, status, notes)

- [ ] **#19** Guided status steps — show path: New → Reviewed → Contacted → Negotiating → Bought / Passed with current step highlighted
- [ ] **#20** Plain status labels — user-facing words (e.g. “Purchased” if that matches how the team talks)
- [ ] **#21** Prominent “Claim” / “I’m working this” — primary when unclaimed; clear disabled state when someone else holds the claim
- [ ] **#22** Friendly collision messages — e.g. “Alex claimed this 2 hours ago — expires at 3:00 PM” instead of generic errors
- [ ] **#23** Notes as a conversation — author, time, visible thread + clear “Add note” (not buried)
- [ ] **#24** Reassign without leaving the page — assign closer in preview panel and detail page
- [ ] **#25** Confirm before Pass / Bought — short confirmation to prevent mis-clicks

---

### E. Submit a listing (finders)

- [ ] **#26** Keep “Submit listing” as a visible hero action; optional 3-step “How it works” (paste URL → pick market → optional closer)
- [ ] **#27** Auto-detect market from URL when possible — pre-fill region; user can override
- [ ] **#28** Minimal required fields — URL + market only; collapse “Add details (optional)” for year/make/model/price
- [ ] **#29** Clear success path — “Added to queue” + “View this vehicle” + what happens next for assigned closer
- [ ] **#30** Friendlier duplicate URL message — “This link is already in the system — open the existing record” with link

---

### F. Detail and preview panels

- [ ] **#31** One-screen vehicle summary — listing link, price vs MMR, key badges, owner, status, primary actions at top
- [ ] **#32** “Why is this here?” for near-misses — one plain sentence (e.g. “Could not read year/make/model from the listing title”)
- [ ] **#33** Action history as human timeline — “Maria assigned to John · 9:14 AM” not raw event codes
- [ ] **#34** Interaction hint — “Click row for quick view · Open full page for everything”

---

### G. Multi-region (Phase 8)

- [ ] **#35** Market filter includes all live regions — Dallas, Lubbock, San Antonio, Oklahoma City (friendly names)
- [ ] **#36** Remember each user’s last-selected market — submit form + queue filters (localStorage or profile)
- [ ] **#37** Ingest: per-market summary cards (ops/managers) — last run, processed count, leads created; optional hide for pure closers

---

### H. Ingest Monitor (mostly ops; simplify if buyers see it)

- [ ] **#38** Role-based visibility — full diagnostics for admins; simplified or hidden for closers if not needed daily
- [ ] **#39** “Latest run” in plain English — e.g. “Dallas import finished 6 minutes ago · 7 listings · 0 new leads (normal)”
- [ ] **#40** Link from zero-lead run — “See vehicles that almost qualified in Dallas” → Opportunities with filters applied

---

### I. Onboarding and errors

- [ ] **#41** First-visit tips on Opportunities (dismissible) — submit a link, claim a vehicle, update status
- [ ] **#42** Loading copy — “Loading your queue…” instead of blank areas
- [ ] **#43** Actionable errors — sign-in, retry, contact admin; avoid exposing internal error codes to users
- [ ] **#44** Keyboard-friendly table (optional) — arrow keys + Enter for preview (power users)

---

### J. Dashboard and other pages (lower priority for daily closers)

- [ ] **#45** Dashboard “Today for my team” — new leads, my claimed count, claims expiring soon
- [ ] **#46** Keep MMR Lab clearly separate — “Pricing tool”, not required for normal queue work
- [ ] **#47** Historical / Admin — label as reporting/settings, not daily workflow

---

### Backend / API items that unblock UI (track separately)

- [ ] Near-miss reason-code filter on `GET /app/opportunities` (v2 spec — reduces junk in queue; pairs with **#6**, **#32**)
- [ ] Valuation snapshots index on `(normalized_listing_id, fetched_at DESC)` (v2 spec — faster detail/preview loads)

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
7. `feat: opportunity workflow mutations` (Phase 7) — **shipped** (`f5e73ec`, 2026-05-23 — Worker `efda0005`, migration 0048, web UI)
8. `feat: add lubbock_tx region for Phase 8 tav-tx-west` — **shipped** (`4afdd9e`, `b5247cc` CI test fix)

---

## How to update this file

1. Change **Last updated** at the top.
2. Check off items when verified (tests + deploy/smoke if applicable).
3. Move completed phase sections to a short **Done** note at the bottom (optional) or leave `[x]` for history.
4. Keep [handoff](04-operations/handoff.md) in sync for branch/PR-specific state.
5. Do not duplicate long specs here — link to roadmap / v2-opportunities / platform docs instead.
6. UI backlog: edit or delete items in [UI / product polish](#ui--product-polish-user-friendly-web-app) after team review; check off when shipped.

---

## Done (recent)

| Date | Item |
|------|------|
| 2026-05-26 | Phase 8 code complete — `oklahoma_city_ok` (ADR 0004, migration 0050 applied), all four Apify tasks mapped; [apify-phase8-regions](04-operations/apify-phase8-regions.md) for schedule soak |
| 2026-05-24 | CI fix — `b5247cc` Apify webhook tests for `lubbock_tx` mapping (Verification Loop + staging deploy green) |
| 2026-05-23 | Git push — `4afdd9e` on `main` (Phase 8 `lubbock_tx`); Vercel auto-deploy; migration 0049 applied |
| 2026-05-23 | Git push — `f5e73ec` + `55ecfab` on `main` (Phase 7 status/notes/UI); Vercel auto-deploy |
| 2026-05-23 | Phase 8 start — `lubbock_tx` region (migration 0049), `tav-tx-west` map, Worker `b81fae54` |
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

# NEXT SESSION START POINT — TAV-AIP

> **Source of truth for v1 scope:** [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md).
> When this file conflicts with the spec, the spec wins.

## Where We Are (2026-05-11)

**Backend foundation is in production.** Frontend scaffold exists at `web/` but is essentially empty (sign-in page + auth-gate proxy + API schema parser landed today). All four product surfaces from the spec are still to build.

### What is live
- Apify → `/ingest` → raw → normalized → vehicle candidates → leads (end-to-end on staging + production).
- `tav-aip` Worker exposes `/ingest`, `/admin/*`, `/app/*`, `/health` — `/app/*` API contract is **frozen** (`docs/APP_API.md`).
- `tav-intelligence-worker` does MMR via Cox sandbox + KV cache + anti-stampede lock (`docs/CACHE_STRATEGY.md`, `docs/INTELLIGENCE_CONTRACTS.md`).
- Supabase schema is in place (30+ tables: `raw_listings`, `normalized_listings`, `vehicle_candidates`, `leads`, `lead_actions`, `purchase_outcomes`, `historical_sales`, `mmr_cache`, `mmr_queries`, `import_batches`, `user_activity`, etc.).
- Cloudflare Access fronts Google Workspace; identity contract is locked.
- Today's web/ commits: sign-in page, auth-gate proxy, app API worker proxy, app API schemas + parser.

### What exists in data
- **18 weeks of 2026 sales** loaded into `tav.historical_sales` (Jan 1 → early May 2026, Wednesday-anchored). The dashboard is not empty on launch — see `docs/PRODUCT_SPEC.md` §17.

### What is NOT done
- Every product surface in `docs/PRODUCT_SPEC.md` §§6–9 (TAV-MMR, Performance Dashboard, Buy Box Queue, Acquisition Entry).
- Role-detection middleware in `web/` (Cloudflare Access headers → app context).
- The new `/app/*` endpoints listed in `docs/PRODUCT_SPEC.md` §11.2.
- The Sale Week surface and its Manheim sales integration (`docs/PRODUCT_SPEC.md` §7.13).
- Commission schema and computation hooks (`docs/PRODUCT_SPEC.md` §7.5).
- The §17 backfill migrations for the 18 weeks of 2026 sales.

---

## First commands next session

```
# 1. Read the spec in Plan Mode
"Read docs/PRODUCT_SPEC.md end to end, then docs/APP_API.md,
docs/INTELLIGENCE_CONTRACTS.md, docs/architecture.md, docs/identity.md.
Confirm understanding of the four surfaces, the role matrix, the
universal KPI grammar, the Sale Week cycle, and the §17 backfill plan."

# 2. Propose the Phase 0 work order
"In Plan Mode, propose the file-by-file work order for Phase 0:
Cloudflare Access role-detection middleware in web/, typed /app/*
client in web/lib/app-api/, and the app shell with stub pages for
the four product surfaces. Include the ADR you'll write for SSE vs
WebSocket (decision deferred but documented)."
```

---

## Next Tasks (Priority Order)

### Phase 0 — Foundation (1 sprint) — START HERE
Per `docs/PRODUCT_SPEC.md` §14.

- [ ] Cloudflare Access role-detection middleware in `web/middleware.ts` — reads `Cf-Access-Authenticated-User-Email` + `Cf-Access-Authenticated-User-Roles`, exposes a typed `UserContext` to every server component and route handler. Mirrors `src/auth/userContext.ts` on the worker side.
- [ ] Typed `/app/*` client in `web/lib/app-api/` — TanStack Query wrappers over the 5 existing endpoints (`/app/system-status`, `/app/kpis`, `/app/import-batches`, `/app/historical-sales`, `/app/mmr/vin`). Add typed stubs for the new endpoints in §11.2 so UI work isn't blocked.
- [ ] App shell — sidebar with four product surfaces (TAV-MMR, Dashboard, Buy Box, Entry), header with system-status badge + notification bell stub, breadcrumb component (needed everywhere in the dashboard hierarchy).
- [ ] Empty stub pages for all four surfaces.
- [ ] ADR `docs/adr/0003-real-time-transport.md` — decide SSE vs WebSocket (recommendation in the spec: SSE for v1).
- [ ] ADR `docs/adr/0004-frontend-stack-lockdown.md` — confirm Next.js 15 + TanStack Query + Zustand + shadcn/ui + React Hook Form + Zod.

### Phase 1 — TAV-MMR (1 sprint)
Per `docs/PRODUCT_SPEC.md` §6.

- [ ] Backend: `POST /app/mmr/ymm` on `tav-aip` mirroring `/app/mmr/vin`.
- [ ] Backend: extend `/app/mmr/vin` response with `tavValue`, `tavValueVersion`, `cacheHit`, `duplicateOf` (additive only).
- [ ] Backend: TAV Value v1.0 formula in `tav-intelligence-worker` (`docs/PRODUCT_SPEC.md` §6.4) — sourced from `tav.historical_sales` + `tav.v_segment_profit`. Versioned.
- [ ] Frontend: VIN + YMM tabbed input with client-side validation.
- [ ] Frontend: Result panel with role-gated duplicate-pull banner (B/C never sees prior TAV offer).
- [ ] Frontend: Force-refresh button (Manager/Admin only — server and UI both enforce).
- [ ] Every lookup writes a row to `tav.mmr_queries`.

### Phase 2 — Performance Dashboard (3 sprints)
Per `docs/PRODUCT_SPEC.md` §7.

**Sprint 2a — Data foundation (blocking; do these first)**
- [ ] §17 backfill migrations:
  - [ ] Add `sale_week_id text` column + index + trigger on `tav.historical_sales`.
  - [ ] Seed `tav.sale_weeks` with `2026-W01` … `2026-W18` (`status='reconciled'`).
  - [ ] Backfill `tav.tav_weekly_units` from existing sales (`ownership='owned'`).
  - [ ] Identity remap job + Admin `/admin/historical-sales/remap` tool; `legacy_unmapped` bucket for unmappable rows.
- [ ] New rollup tables: `metrics_daily_user`, `metrics_daily_region`, `metrics_daily_team`, `metrics_daily_enterprise`. Nightly cron + on-demand backfill (`POST /admin/metrics/rebuild`).
- [ ] Commission schema: `commission_plans`, `commission_plan_assignments`, `commissions`. Compute hooks on `purchase_outcomes` write and `historical_sales.sale_price` set. Frozen `plan_snapshot` per row.
- [ ] `tav.performance_goals`, `tav.dashboard_views`, `tav.dashboard_subscriptions`.

**Sprint 2b — API + L1/L2/L3 levels**
- [ ] Endpoints: `/app/dashboard/:level`, `/app/dashboard/series`, `/app/dashboard/drilldown`, `/app/leaderboard`, `/app/commissions*`, `/app/goals*`, `/app/dashboard/views`.
- [ ] Enterprise, Region, and Team pages with the full universal KPI grammar (blocks A–F from §7.3), sparklines, granularity toggle, drilldown panel, breadcrumb, CSV export.

**Sprint 2c — L4 User + L5 Unit + polish**
- [ ] User dashboard with personal P&L, commission tiles (pending vs paid), MMR activity, score calibration.
- [ ] `/app/units/:id` + Unit page (lifecycle timeline, full P&L, commissions, attachments).
- [ ] PDF snapshot export per level via `@react-pdf/renderer`.
- [ ] Scheduled email digests (`tav.dashboard_subscriptions`).
- [ ] Goals UI + projection lines on tiles.

**Sprint 2d — Sale Week (Wednesday cycle)** — blocked on live Cox creds
- [ ] Migrations: `manheim_sale_results`, plus the consignment schema (`consignors`, `consignment_plans`, `consignment_units`).
- [ ] New Manheim sales integration in `tav-intelligence-worker` (seller-account inventory, sale results by event, OVE) + hourly cron during sale + nightly reconciliation. Document in `docs/MANHEIM_SALES_INTEGRATION.md`.
- [ ] `/app/sale-weeks*` endpoints + `/dashboard/sale-week/:id` page (headline tiles, owned vs consignment tabs, no-sale/if-bid tab, channel mix, buyer breakdown).
- [ ] Sale Week granularity option added to the universal granularity toggle.

### Phase 3 — Buy Box Queue (2 sprints)
Per `docs/PRODUCT_SPEC.md` §8.

- [ ] `/app/leads*` endpoints + `/app/leads/events` (SSE).
- [ ] Queue list with filters, real-time push updates, claim conflict resolution.
- [ ] Lead detail page with locked state machine (§8.2), required reason codes on lost.
- [ ] Communication log (notes-only in v1; Twilio in v1.1).
- [ ] Stale-claim auto-release cron (48h with 36h notification).

### Phase 4 — Acquisition Entry (1 sprint)
Per `docs/PRODUCT_SPEC.md` §9.

- [ ] Cold-call form with inline MMR + Manager approval queue.
- [ ] CSV upload (Manager/Admin) with column mapping, validation, preview, commit, rollback (Admin).
- [ ] Predefined templates: TAV-standard, Manheim, Adesa, Copart, generic.

### Phase 5 — Notifications + Audit (1 sprint)
Per `docs/PRODUCT_SPEC.md` §13.

- [ ] `tav.notifications` table + notification service.
- [ ] In-app bell + inbox view; email channel.
- [ ] Audit log viewer (own + all-by-role).
- [ ] Cost dashboard skeleton (`tav.api_costs`).

### Phase 6 — Hardening + polish
- [ ] Mobile QA on TAV-MMR, Buy Box queue, lead detail.
- [ ] Performance budget pass (P95 targets).
- [ ] Load test queue at 10k active leads.
- [ ] PDF export polish.

---

## Open decisions to resolve this week

Tracked in `docs/PRODUCT_SPEC.md` §17.6 and §15. None block Phase 0, but they unblock Phase 2.

1. **Consignment in the 18 backfilled weeks** — are any of those rows units we moved for others? If yes, we need a flag on `historical_sales` before the dashboard renders.
2. **Commission retroactivity** — pay commissions against the new model for weeks 1–18, or treat the period as legacy comp and start tracking at week 19?
3. **Live Cox production credentials** — required before Sprint 2d (Sale Week) can ship; sandbox is fine through Phase 1.
4. **Former-employee identity bucket** — separate from `legacy_unmapped` or roll into it?

---

## Important IDs / Config

```
SUPABASE
  schema: tav
  URL: in .dev.vars
  project: Supabase dashboard

WORKERS
  tav-aip staging:    https://tav-aip-staging.rami-1a9.workers.dev
  tav-aip production: https://tav-aip-production.rami-1a9.workers.dev
  /app/* auth:        Bearer ${APP_API_SECRET}  (server-side only)
  /admin/* auth:      Bearer ${ADMIN_API_SECRET}
  cron:               daily 06:00 UTC → tav.run_stale_sweep()

INTELLIGENCE WORKER
  tav-intelligence-worker (Cox sandbox MMR until live creds provisioned)
  KV: MANHEIM_KV  (24h positive / 1h negative / 30s anti-stampede lock)

CLOUDFLARE ACCESS GROUPS (planned)
  tav-buyer-closer
  tav-manager
  tav-admin
```

---

## Reference index

| Document | Purpose |
|---|---|
| `docs/PRODUCT_SPEC.md` | **v1 frontend requirements — source of truth.** |
| `docs/APP_API.md` | Locked `/app/*` HTTP contract. |
| `docs/INTELLIGENCE_CONTRACTS.md` | Cache key, segment key, user context, force_refresh authz. |
| `docs/CACHE_STRATEGY.md` | MMR cache TTLs + anti-stampede flow. |
| `docs/DEAL_SCORE.md` | Lead scoring formula spec. |
| `docs/SCALE_ARCHITECTURE.md` | Ten-point engineering foundation. |
| `docs/architecture.md` | Repo layout + four HTTP surfaces. |
| `docs/identity.md` | Project identity + operating principles for Claude. |
| `docs/RUNBOOK.md` | Deploy wiring + incident response. |
| `docs/SECURITY.md` | Security posture (placeholder; details in architecture.md §§15–17). |
| `docs/followups.md` | Open follow-ups (sell-through rate, etc.). |

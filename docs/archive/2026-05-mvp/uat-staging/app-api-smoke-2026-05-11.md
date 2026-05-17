# `/app/*` frontend API — deploy + smoke, 2026-05-11

Bring-up of the `/app/*` product API layer (ADR 0002) on the main `tav-aip` Worker,
in five deploy rounds the same day. Bearer `APP_API_SECRET` (rotated more than once
during the session — once after an accidental exposure, again before Round 3;
re-provisioned on both envs each time).

- **Round 1** — `GET /app/system-status`, `GET /app/kpis`.
- **Round 2** — `GET /app/import-batches`, `GET /app/historical-sales`, `POST /app/mmr/vin`.
- **Round 3** — `GET /app/kpis` enriched with the global outcome rollup
  (`tav.v_outcome_summary_global`, migration 0041). No new endpoint, response shape change only.
- **Round 4** — `GET /app/system-status` `staleSweep` backed by `tav.cron_runs` (migration 0042);
  the daily `scheduled()` handler now records each stale-sweep run. Response shape change only.
- **Round 5** — `GET /app/kpis` drops the top-level `outcomes.value.sellThroughRate` (tautologically
  `1.0` today). No DB change; SQL views and raw `byRegion` rows unchanged. Response shape change only.

With Round 2, all five ADR-0002 `/app/*` endpoints were implemented and live on staging
and production. Rounds 3–5 adjusted `/app/kpis` and `/app/system-status` response bodies.

---

# Round 1 — system-status + kpis

## Code

- Commits: `9e1b8fd` feat(app): /app/* layer — system-status + kpis; `e812448` docs(adr): ADR 0002 + followups; `1c5d69f` docs: scrub Base44, mark pre-cutover blockers superseded.
- Verification before deploy: `npm run typecheck` clean; `npm test` 696/696 pass (10 new in `test/app.routes.test.ts`). `npm run lint` exits 1 — pre-existing, 4 legacy root `.js` scripts only; new files clean.

## Deploys

| Env | Worker | Version ID | Command |
|-----|--------|-----------|---------|
| staging | `tav-aip-staging` | `870e4af2-0cb0-4c78-a2f8-251352f38f22` | `npx wrangler deploy --config wrangler.toml --env staging` |
| production | `tav-aip-production` | `888c99a3-3621-47aa-96c9-baf0f2df6752` | `npx wrangler deploy --config wrangler.toml --env production` |

Both deploys confirmed bindings: `INTEL_WORKER` → `tav-intelligence-worker-<env>`,
`MANHEIM_LOOKUP_MODE="worker"`, `TAV_KV`, `INTEL_WORKER_URL` set.

## Smoke — staging (`tav-aip-staging.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/system-status` + Bearer | HTTP 200, `ok:true`, `db.ok:true`, `intelWorker.mode:"worker"`, `binding:true` |
| `GET /app/kpis` + Bearer | HTTP 200, `ok:true`, `outcomes`/`leads`/`listings` populated |
| `GET /app/kpis` no Bearer | HTTP 401 |

**PASS** — all three.

## Smoke — production (`tav-aip-production.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/system-status` + Bearer | HTTP 200, `ok:true`, `db.ok:true`, `intelWorker.mode:"worker"`, `binding:true`, URL → `tav-intelligence-worker-production` |
| `GET /app/kpis` + Bearer | HTTP 200, `ok:true`, `outcomes`/`leads`/`listings` populated |
| `GET /app/kpis` no Bearer | HTTP 401 |

**PASS** — all three.

---

# Round 2 — import-batches + historical-sales + mmr/vin

## Code

- Commits: `d6ed64b` feat(app): add import-batches endpoint; `75eb02a` feat(app): add historical-sales endpoint; `75c022c` feat(app): add mmr-vin endpoint. Docs `f2fcb04` recorded Round 1 deploy/smoke; this file's Round 2 section recorded by the post-Round-2 docs commit.
- Verification before deploy: `npm run typecheck` clean; `npm test` 724/724 pass (50 files); `npx vitest run test/app.routes.test.ts` 38/38 pass. `npm run lint` exits 1 — pre-existing, 4 legacy root `.js` scripts only; `src/app/routes.ts`, `src/persistence/historicalSales.ts`, `test/app.routes.test.ts` clean.

## Deploys

| Env | Worker | Version ID | Command |
|-----|--------|-----------|---------|
| staging | `tav-aip-staging` | `f3c3c3d8-f120-491c-a34c-0884d3e3246e` | `npx wrangler deploy --config wrangler.toml --env staging` |
| production | `tav-aip-production` | `127f532a-9712-467a-8229-efdc4a86e074` | `npx wrangler deploy --config wrangler.toml --env production` |

Both deploys confirmed bindings: `INTEL_WORKER` → `tav-intelligence-worker-<env>`,
`MANHEIM_LOOKUP_MODE="worker"`, `TAV_KV`, `INTEL_WORKER_URL` set.

## Smoke — staging (`tav-aip-staging.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/import-batches?limit=5` + Bearer | HTTP 200, `ok:true`, `data` array |
| `GET /app/import-batches?limit=500` + Bearer | HTTP 200 (clamped to 100) |
| `GET /app/historical-sales?limit=5` + Bearer | HTTP 200, `ok:true`, `data: []` (no rows yet) |
| `GET /app/historical-sales?limit=500` + Bearer | HTTP 200 (clamped to 100) |
| `POST /app/mmr/vin` + Bearer, `{"vin":"1FT8W3BT1SEC27066","mileage":50000}` | HTTP 200, `ok:true`, `mmrValue:68600`, `confidence:"high"`, `method:"vin"` (sandbox Cox) |
| `GET /app/import-batches` no Bearer | HTTP 401 |

**PASS** — all six.

## Smoke — production (`tav-aip-production.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/import-batches?limit=5` + Bearer | HTTP 200, `ok:true`, `data` array (5 rows) |
| `GET /app/import-batches?limit=500` + Bearer | HTTP 200 (clamped to 100) |
| `GET /app/historical-sales?limit=5` + Bearer | HTTP 200, `ok:true`, `data: []` (no rows yet) |
| `GET /app/historical-sales?limit=500` + Bearer | HTTP 200 (clamped to 100) |
| `POST /app/mmr/vin` + Bearer, `{"vin":"1FT8W3BT1SEC27066","mileage":50000}` | HTTP 200, `ok:true`, `mmrValue:68600`, `confidence:"high"`, `method:"vin"` (sandbox Cox) |
| `GET /app/import-batches` no Bearer | HTTP 401 |

**PASS** — all six.

---

# Round 3 — `/app/kpis` global outcome rollup (`v_outcome_summary_global`)

## Code

- Commit: `9da9f00` db: add global outcome summary view for app kpis (migration `0041_outcome_summary_global_view.sql` + `supabase/schema.sql` + `src/app/routes.ts` `handleKpis` + `test/app.routes.test.ts` + ADR 0002 + `docs/APP_API.md`).
- `handleKpis` `outcomes.value` widened from `{ totalOutcomes, byRegion }` to `{ totalOutcomes, avgGrossProfit, avgHoldDays, sellThroughRate, lastOutcomeAt, byRegion }`; top-level aggregates now come from `tav.v_outcome_summary_global` (single-row, no `GROUP BY` — a true global `AVG`), `byRegion` still from `tav.v_outcome_summary`. The standalone `purchase_outcomes` COUNT was dropped (the view supplies `total_outcomes`). `NULL` aggregates pass through as `null`.
- Verification before deploy: `npm run typecheck` clean; `npx vitest run test/app.routes.test.ts` 40/40 pass; `npm test` 726/726 (50 files); `npm run test:int` 0 tests (Supabase int tests opt-in/env-gated). `npm run lint` exits 1 — pre-existing only (4 legacy root `.js` scripts, 97 errors; + 1 pre-existing warning at `test/app.routes.test.ts:55` `import()` type annotation in untouched code).

## Migration

`supabase/migrations/0041_outcome_summary_global_view.sql` applied manually in the
Supabase SQL Editor against the linked project **TAV-AIP** (`fjnevgakkhnsrcimfivw`) —
treated as the active DB for both Worker envs (no separate staging DB found).

`select * from tav.v_outcome_summary_global;` → **one row**:

| col | value |
|-----|-------|
| `total_outcomes` | `12904` |
| `avg_gross_profit` | `1209.11` |
| `avg_hold_days` | `8.60` |
| `sell_through_rate` | `1.0000` |
| `last_outcome_at` | `2026-05-06 19:27:12.118804+00` |

(`sell_through_rate = 1.0000` because `tav.purchase_outcomes` currently holds only
completed sales — `sale_price` is non-NULL on every row. Same behaviour as the
per-region `v_outcome_summary`; semantics intentionally unchanged. Follow-up logged.)

## Deploys

| Env | Worker | Version ID | Command |
|-----|--------|-----------|---------|
| staging | `tav-aip-staging` | `3411d01d-00c4-445d-9508-9aeb009325c0` | `npx wrangler deploy --config wrangler.toml --env staging` |
| production | `tav-aip-production` | `c9ce8f57-0ee8-461a-9b32-7aa02c6dd670` | `npx wrangler deploy --config wrangler.toml --env production` |

Both deploys confirmed bindings: `INTEL_WORKER` → `tav-intelligence-worker-<env>`,
`MANHEIM_LOOKUP_MODE="worker"`, `TAV_KV`, `INTEL_WORKER_URL` set, `HYBRID_BUYBOX_ENABLED="true"`.

## Smoke — staging (`tav-aip-staging.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/kpis` + Bearer | HTTP 200, `ok:true`, `outcomes.missingReason:null`, `outcomes.value` = `{ totalOutcomes:12904, avgGrossProfit:1209.11, avgHoldDays:8.6, sellThroughRate:1, lastOutcomeAt:"2026-05-06T19:27:12.118804+00:00", byRegion:[…] }` |
| field-set assertion (`>= {totalOutcomes,avgGrossProfit,avgHoldDays,sellThroughRate,lastOutcomeAt,byRegion}`) | `OK` |
| `GET /app/kpis` no Bearer | HTTP 401 |

**PASS** — all three.

## Smoke — production (`tav-aip-production.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/kpis` + Bearer | HTTP 200, `ok:true`, `outcomes.missingReason:null`, `outcomes.value` = `{ totalOutcomes:12904, avgGrossProfit:1209.11, avgHoldDays:8.6, sellThroughRate:1, lastOutcomeAt:"2026-05-06T19:27:12.118804+00:00", byRegion:[…] }` |
| field-set assertion | `OK` |
| `GET /app/kpis` no Bearer | HTTP 401 |

**PASS** — all three.

---

# Round 4 — `/app/system-status` stale-sweep persistence (`cron_runs`)

## Code

- Commit: `1fbf7cb` feat: persist stale-sweep cron runs (migration `0042_cron_runs.sql` + `supabase/schema.sql` + new `src/persistence/cronRuns.ts` + `src/index.ts` `scheduled()` + `src/app/routes.ts` `handleSystemStatus` + tests `test/cronRuns.test.ts`, `test/scheduled.test.ts`, `test/app.routes.test.ts` + ADR 0002 + `docs/APP_API.md`).
- `scheduled()` (daily `0 6 * * *`) now wraps `runStaleSweep` and records a `tav.cron_runs` row via `recordCronRunSafe` — `status:"ok"` + `detail:{updated}` on success; `status:"failed"` + `detail:{error}` then rethrow on failure. The audit write is best-effort (a failed insert is logged and swallowed — it never fails the cron). `handleSystemStatus` reads the latest `stale_sweep` row → `staleSweep` = `{ lastRunAt: finished_at ?? started_at, status, updated }`, or `{ lastRunAt:null, missingReason:"never_run" }` (no row), or `{ lastRunAt:null, missingReason:"db_error" }` (lookup/client failure) — independent of the `v_source_health` block.
- Verification before deploy: `npm run typecheck` clean; `npx vitest run test/app.routes.test.ts test/cronRuns.test.ts test/scheduled.test.ts` 55/55; `npm test` 741/741 (52 files); `npm run test:int` 0 tests (Supabase int suite opt-in/env-gated; ran because `supabase/migrations/` touched). `npm run lint` exits 1 — pre-existing only (4 legacy root `.js` scripts, 97 errors; + 1 pre-existing warning at `test/app.routes.test.ts:55`). New files lint-clean.

## Migration

`supabase/migrations/0042_cron_runs.sql` applied manually in the Supabase SQL Editor
against the linked project **TAV-AIP** (`fjnevgakkhnsrcimfivw`). Verified: `tav.cron_runs`
exists with columns `id, job_name, started_at, finished_at, status, detail`; RLS enabled
(no policies — the Worker uses the service_role key, which bypasses RLS); `select * from
tav.cron_runs` → 0 rows.

## Deploys

| Env | Worker | Version ID | Command |
|-----|--------|-----------|---------|
| staging | `tav-aip-staging` | `157b83ee-7379-4b9f-b8fe-6d934b5baed4` | `npx wrangler deploy --config wrangler.toml --env staging` |
| production | `tav-aip-production` | `4d73da7c-45ca-4e4e-a6ed-e0b1c73d2556` | `npx wrangler deploy --config wrangler.toml --env production` |

Both deploys confirmed bindings: `INTEL_WORKER` → `tav-intelligence-worker-<env>`,
`MANHEIM_LOOKUP_MODE="worker"`, `TAV_KV`, `INTEL_WORKER_URL` set, `HYBRID_BUYBOX_ENABLED="true"`.

## Smoke — staging (`tav-aip-staging.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/system-status` + Bearer | HTTP 200, `ok:true`, `db.ok:true`, `intelWorker.mode:"worker"`, `staleSweep` = `{ lastRunAt: null, missingReason: "never_run" }` |
| `GET /app/system-status` no Bearer | HTTP 401 |
| `GET /app/kpis` + Bearer (regression) | HTTP 200, `outcomes.value.totalOutcomes:12904`, field-set OK |

**PASS** — all three.

## Smoke — production (`tav-aip-production.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/system-status` + Bearer | HTTP 200, `ok:true`, `db.ok:true`, `intelWorker.mode:"worker"`, `binding:true`, prod intel URL present, `staleSweep` = `{ lastRunAt: null, missingReason: "never_run" }` |
| `GET /app/system-status` no Bearer | HTTP 401 |
| `GET /app/kpis` + Bearer (regression) | HTTP 200, `outcomes.value.totalOutcomes:12904`, field-set OK |

**PASS** — all three.

Note: `staleSweep.lastRunAt` stays `null` / `missingReason:"never_run"` until the next
06:00 UTC cron writes the first `tav.cron_runs` row — a one-time post-cron spot-check is
logged in `docs/followups.md`.

---

# Round 5 — `/app/kpis` drops `sellThroughRate`

## Code

- Commit: `55007d1` feat(app): drop misleading sellThroughRate from app kpis (`src/app/routes.ts` `handleKpis` + `test/app.routes.test.ts` + `docs/APP_API.md` + ADR 0002 + `docs/followups.md`).
- `handleKpis` no longer returns `sellThroughRate` in `outcomes.value`; remaining fields are `totalOutcomes`, `avgGrossProfit`, `avgHoldDays`, `lastOutcomeAt`, `byRegion`. Rationale: the SQL formula (`COUNT(*) FILTER (sale_price IS NOT NULL) / COUNT(*)`) is correct, but `tav.purchase_outcomes` currently holds only sold/imported outcome rows (every row has a `sale_price`), so the ratio is tautologically `1.0` and would mislead the frontend. A real sell-through metric is blocked on the lead→purchase / acquisition-persistence workflow writing `purchase_outcomes` rows before resale (logged in `docs/followups.md`).
- **Scope:** product-API surface only. No migration. `tav.v_outcome_summary` / `tav.v_outcome_summary_global` keep their `sell_through_rate` column unchanged, and `outcomes.value.byRegion` still passes those raw per-region view rows through verbatim (so each `byRegion` row still carries a `sell_through_rate` field) — only the synthesized top-level `outcomes.value.sellThroughRate` was removed.
- Verification before deploy: `npm run typecheck` clean; `npx vitest run test/app.routes.test.ts` 44/44; `npm test` 741/741 (52 files). `npm run lint` exits 1 — pre-existing only (4 legacy root `.js` scripts, 97 errors; + 1 pre-existing warning at `test/app.routes.test.ts:55`). `src/app/routes.ts` clean.

## Deploys

| Env | Worker | Version ID | Command |
|-----|--------|-----------|---------|
| staging | `tav-aip-staging` | `2b620bfd-e703-4500-9bc6-60a74a2e1933` | `npx wrangler deploy --config wrangler.toml --env staging` |
| production | `tav-aip-production` | `fbfe2335-816a-48e8-b6f5-59f4a6033864` | `npx wrangler deploy --config wrangler.toml --env production` |

Both deploys confirmed bindings: `INTEL_WORKER` → `tav-intelligence-worker-<env>`,
`MANHEIM_LOOKUP_MODE="worker"`, `TAV_KV`, `INTEL_WORKER_URL` set, `HYBRID_BUYBOX_ENABLED="true"`.

## Smoke — staging (`tav-aip-staging.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/kpis` + Bearer | HTTP 200, `ok:true`, `outcomes.value` = `{ totalOutcomes:12904, avgGrossProfit, avgHoldDays, lastOutcomeAt, byRegion[…] }` — no top-level `sellThroughRate` |
| field-set assertion (`== {totalOutcomes,avgGrossProfit,avgHoldDays,lastOutcomeAt,byRegion}`, `sellThroughRate` absent) | `OK 12904` |
| `GET /app/kpis` no Bearer | HTTP 401 |

**PASS** — all three.

## Smoke — production (`tav-aip-production.rami-1a9.workers.dev`)

| Check | Result |
|-------|--------|
| `GET /app/kpis` + Bearer | HTTP 200, `ok:true`, `outcomes.value` = `{ totalOutcomes:12904, avgGrossProfit, avgHoldDays, lastOutcomeAt, byRegion[…] }` — no top-level `sellThroughRate` |
| field-set assertion | `OK 12904` |
| `GET /app/kpis` no Bearer | HTTP 401 |

**PASS** — all three.

Note: `byRegion` rows still include the raw `sell_through_rate` column from `tav.v_outcome_summary`
(raw view passthrough). Round 5 removed only the curated top-level `outcomes.value.sellThroughRate`.
Stripping it from `byRegion` too can be folded into the future "real sell-through" work — see `docs/followups.md`.

---

## Caveat

`tav-intelligence-worker-production` remains sandbox-backed (Cox sandbox MMR) per
the 2026-05-09 cutover note. `/app/kpis` reads Supabase tables directly (not MMR),
so its data is real; `/app/system-status` only reports the intel-worker *wiring*,
not the upstream MMR source. No new exposure of sandbox data via `/app/*`.

## Follow-up

- `APP_API_SECRET` is provisioned on staging + production.
- All five ADR-0002 `/app/*` endpoints are implemented and live on both envs.
- `docs/APP_API.md` contract doc — written (commit `28ef93a`).
- Global outcome-rollup view `tav.v_outcome_summary_global` — shipped (Round 3, commit `9da9f00`; migration 0041 applied).
- Stale-sweep cron persistence `tav.cron_runs` — shipped (Round 4, commit `1fbf7cb`; migration 0042 applied).
- Stale `.dev.vars.example` / `wrangler.toml` `MANHEIM_LOOKUP_MODE` comments — fixed (commit `731ea18`).
- Misleading `outcomes.value.sellThroughRate` — removed from `/app/kpis` (Round 5, commit `55007d1`); SQL views unchanged.
- Still open (`docs/followups.md`): build a true sell-through metric once acquisition-time `purchase_outcomes`
  rows exist (and at that point also strip `sell_through_rate` from the raw `byRegion` rows); one-time post-cron
  spot-check that `tav.cron_runs` gets a `stale_sweep` row at the next 06:00 UTC and `/app/system-status`
  `staleSweep.lastRunAt` goes non-null; legacy root-`.js` lint debt.

Related: `docs/adr/0002-frontend-app-api-layer.md`, `docs/session-handoff-2026-05-09.md`,
`docs/staging-smoke-2026-05-09.md`.

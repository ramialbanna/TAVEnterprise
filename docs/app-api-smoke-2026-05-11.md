# `/app/*` frontend API — deploy + smoke, 2026-05-11

Bring-up of the `/app/*` product API layer (ADR 0002) on the main `tav-aip` Worker,
in two deploy rounds the same day. Bearer `APP_API_SECRET` (rotated once during the
session after an accidental exposure; re-provisioned on both envs).

- **Round 1** — `GET /app/system-status`, `GET /app/kpis`.
- **Round 2** — `GET /app/import-batches`, `GET /app/historical-sales`, `POST /app/mmr/vin`.

With Round 2, all five ADR-0002 `/app/*` endpoints are implemented and live on staging
and production.

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

## Caveat

`tav-intelligence-worker-production` remains sandbox-backed (Cox sandbox MMR) per
the 2026-05-09 cutover note. `/app/kpis` reads Supabase tables directly (not MMR),
so its data is real; `/app/system-status` only reports the intel-worker *wiring*,
not the upstream MMR source. No new exposure of sandbox data via `/app/*`.

## Follow-up

- `APP_API_SECRET` is provisioned on staging + production.
- All five ADR-0002 `/app/*` endpoints are now implemented and live on both envs.
- Still open (`docs/followups.md`): formalize `docs/APP_API.md` contract doc; global
  outcome-rollup view (for true cross-region `/app/kpis` averages); persist stale-sweep
  run time (so `/app/system-status` `staleSweep.lastRunAt` is non-null); fix the stale
  `.dev.vars.example` `MANHEIM_LOOKUP_MODE` comment; legacy root-`.js` lint debt.

Related: `docs/adr/0002-frontend-app-api-layer.md`, `docs/session-handoff-2026-05-09.md`,
`docs/staging-smoke-2026-05-09.md`.

# `/app/*` frontend API — deploy + smoke, 2026-05-11

First deploy of the `/app/*` product API layer (ADR 0002). Two endpoints live:
`GET /app/system-status`, `GET /app/kpis`. Bearer `APP_API_SECRET` (rotated once
during this session after an accidental exposure; re-provisioned on both envs).

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

## Caveat

`tav-intelligence-worker-production` remains sandbox-backed (Cox sandbox MMR) per
the 2026-05-09 cutover note. `/app/kpis` reads Supabase tables directly (not MMR),
so its data is real; `/app/system-status` only reports the intel-worker *wiring*,
not the upstream MMR source. No new exposure of sandbox data via `/app/*`.

## Follow-up

- `APP_API_SECRET` is provisioned on staging + production (this session).
- Next endpoints (ADR 0002): `GET /app/import-batches`, `GET /app/historical-sales`,
  `POST /app/mmr/vin`. See `docs/followups.md`.

Related: `docs/adr/0002-frontend-app-api-layer.md`, `docs/session-handoff-2026-05-09.md`,
`docs/staging-smoke-2026-05-09.md`.

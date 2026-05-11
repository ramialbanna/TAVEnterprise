# 0002 — Frontend product API layer (`/app/*`)

Status: accepted (2026-05-11)

## Context

TAV-AIP exposes three HTTP surfaces on the main `tav-aip` Worker today:

- `POST /ingest` — HMAC-signed scraper intake (Apify → Worker).
- `/admin/*` — ops tooling, Bearer `ADMIN_API_SECRET`.
- `GET /health` — unauthenticated liveness.

A TAV-owned frontend/dashboard now needs read access to system health and product
KPIs, plus an on-demand MMR-by-VIN lookup. Routing the frontend through `/admin/*`
would force it to hold an ops-grade credential (write access to outcome imports,
market expenses, demand recompute) — an unacceptable blast radius for a UI tier.
Cloudflare Access is heavier than needed for v1 (no per-user authZ requirement yet).

## Decision

Add a fourth surface: **`/app/*`**, a read-mostly product API on the main `tav-aip`
Worker, guarded by a new Bearer secret **`APP_API_SECRET`** (distinct from
`ADMIN_API_SECRET`). The frontend holds `APP_API_SECRET` server-side only.

Conventions:

- **`null` + `missingReason`.** Any metric that cannot be computed is returned as
  `{ value: null, missingReason: "<code>" }` (KPI blocks) or with an explicit
  `missingReason` sibling. The frontend never receives a fabricated number.
- **`GET /app/system-status` never fails the request.** It reports unhealthy state
  in the body (`db.ok=false`, `sources: []`) and still returns `200`.
- **Real Supabase/TAV data first.** No synthetic or estimated rollups. A correct
  *global* outcome rollup needs a new view (`v_outcome_summary` is per-region only);
  until that lands, only exact `COUNT` totals are surfaced at the top level — see
  `docs/followups.md`.
- **MMR proxying** goes through `getMmrValueFromWorker` (which already chooses
  Service-Binding vs public-fetch transport per ADR-era cutover); worker errors are
  non-blocking and surface as `mmrValue: null` + `missingReason`.
- `/app/*` **does not touch** `/ingest`, `/admin`, or `/health` behaviour, and does
  not change the four-concept boundary or any Supabase schema.

Auth failure modes (mirrors `/admin/*`): `APP_API_SECRET` unconfigured → `503
{"ok":false,"error":"app_auth_not_configured"}`; bad/missing Bearer → `401
{"ok":false,"error":"unauthorized"}`.

## Endpoint contracts

All responses are `application/json`. Authenticated success bodies are
`{ "ok": true, "data": ... }`; errors are `{ "ok": false, "error": "<code>" }`.

### `GET /app/system-status` — implemented (2026-05-11)

```jsonc
{ "ok": true, "data": {
  "service": "tav-enterprise",
  "version": "0.1.0",
  "timestamp": "<ISO8601>",
  "db": { "ok": true } | { "ok": false, "missingReason": "db_error" },
  "intelWorker": { "mode": "worker" | "direct", "binding": true|false, "url": "<string>"|null },
  "sources": [ /* rows from tav.v_source_health */ ],
  "staleSweep": { "lastRunAt": null, "missingReason": "not_persisted" }
}}
```

Always `200`. `staleSweep.lastRunAt` is `null` until cron-run times are persisted
(followup).

### `GET /app/kpis` — implemented (2026-05-11)

```jsonc
{ "ok": true, "data": {
  "generatedAt": "<ISO8601>",
  "outcomes": { "value": { "totalOutcomes": <int>, "byRegion": [ /* tav.v_outcome_summary rows */ ] } | null, "missingReason": "db_error" | null },
  "leads":    { "value": { "total": <int> } | null, "missingReason": "db_error" | null },
  "listings": { "value": { "normalizedTotal": <int> } | null, "missingReason": "db_error" | null }
}}
```

`503 {"error":"db_error"}` only if the Supabase client cannot be constructed;
individual blocks degrade independently.

### `GET /app/import-batches` — planned

`?limit` (default 20, clamped ≤ 100). Thin wrapper over
`persistence/importBatches.listImportBatches`. `{ ok, data: ImportBatch[] }`.
Equivalent to `GET /admin/import-batches` but under `/app/*` auth.

### `GET /app/historical-sales` — planned

Reads `tav.historical_sales` (migration 0025). `?limit` (default 20, clamped ≤ 100);
optional `?year&make&model` and `?since=<date>` filters; ordered by `sale_date DESC`.
Needs a new `persistence/historicalSales.ts` lister. `{ ok, data: HistoricalSale[] }`.

### `POST /app/mmr/vin` — planned

Body `{ vin: string, year?: number, mileage?: number }` (Zod-validated). Calls
`getMmrValueFromWorker({ vin, year, mileage }, env)`. Success →
`{ ok, data: { mmrValue, confidence, method, ... } }`. Worker error
(`WorkerTimeoutError | WorkerRateLimitError | WorkerUnavailableError`) or
unconfigured intel worker → `{ ok: true, data: { mmrValue: null, missingReason: "<code>" } }`
(non-blocking — never `5xx` for a downstream MMR hiccup). Bad body → `400`.

## Consequences

- New Cloudflare secret `APP_API_SECRET` must be provisioned on `tav-aip-staging`
  and `tav-aip-production` (`wrangler secret put APP_API_SECRET`) before the
  frontend integrates. Unset ⇒ all `/app/*` calls `503`.
- The contract above is the source of truth for the frontend until a dedicated
  `docs/APP_API.md` is written (followup).
- A future per-user authZ requirement would migrate `/app/*` to Cloudflare Access
  + `extractUserContext`; the route shapes above are designed to survive that.

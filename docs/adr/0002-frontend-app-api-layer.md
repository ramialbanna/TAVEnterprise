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

### `GET /app/import-batches` — implemented (2026-05-11)

Thin read wrapper over `persistence/importBatches.listImportBatches` (recent
outcome-import batches, newest first). Equivalent data to `GET /admin/import-batches`
but under `/app/*` auth.

- `?limit` — default `20`, clamped to `100`. Any value that is not a positive
  integer (missing, empty, `0`, negative, fractional, non-numeric) falls back to
  `20`.
- Success → `200 { "ok": true, "data": ImportBatch[] }`.
- Supabase client cannot be constructed → `503 { "ok": false, "error": "db_error" }`.
- `listImportBatches` / underlying query throws → `503 { "ok": false, "error": "db_error" }`.

### `GET /app/historical-sales` — implemented (2026-05-11)

Thin read wrapper over `persistence/historicalSales.listHistoricalSales`, reading
`tav.historical_sales` (migration 0025), ordered by `sale_date DESC`. Rows are
mapped to a camelCase `HistoricalSale` interface (defined in the new persistence
file — there was no shared type; the intelligence layer only has the CSV *input*
shape).

- `?limit` — default `20`, clamped to `100`; non-positive-integer values fall back
  to `20` (same rule as `/app/import-batches`).
- `?year` — included only if it parses to a finite number (exact match).
- `?make`, `?model` — passed through verbatim (exact match, v1).
- `?since` — passed through verbatim; applied as `sale_date >= since` (ISO date
  string; not validated server-side in v1).
- Success → `200 { "ok": true, "data": HistoricalSale[] }`.
- Supabase client cannot be constructed → `503 { "ok": false, "error": "db_error" }`.
- `listHistoricalSales` / underlying query throws → `503 { "ok": false, "error": "db_error" }`.

### `POST /app/mmr/vin` — implemented (2026-05-11)

On-demand MMR valuation by VIN, proxied to `tav-intelligence-worker` via
`valuation/workerClient.getMmrValueFromWorker` (which already chooses Service-
Binding vs public-fetch transport).

- Body: `{ vin: string (11–17 chars, trimmed), year?: number (1900–2100),
  mileage?: number (int, 0–2_000_000) }`, validated with a local Zod schema
  (deliberately narrower than the intelligence layer's `MmrVinLookupRequestSchema`
  — the frontend never sends `force_refresh` or requester identity).
- Malformed JSON → `400 { "ok": false, "error": "invalid_json" }`.
- Body fails validation → `400 { "ok": false, "error": "invalid_body", "issues": [...] }`.
- Worker resolves a value → `200 { "ok": true, "data": { "mmrValue": <number>,
  "confidence": "high"|"medium"|"low", "method": "vin"|"year_make_model"|null } }`.
- Otherwise **always `200`** with `{ "ok": true, "data": { "mmrValue": null,
  "missingReason": "<code>" } }` — non-blocking. `missingReason` codes:
  - `intel_worker_not_configured` — `INTEL_WORKER_URL` is empty (checked before any call).
  - `no_mmr_value` — worker call succeeded but returned a negative-cache envelope,
    insufficient params, or an unparseable body (`getMmrValueFromWorker` → `null`).
  - `intel_worker_timeout` — `WorkerTimeoutError` (5 s abort).
  - `intel_worker_rate_limited` — `WorkerRateLimitError` (HTTP 429).
  - `intel_worker_unavailable` — `WorkerUnavailableError` (other non-2xx).
- An unexpected error (anything that is not one of the three `Worker*Error`
  types) propagates to `handleApp`'s catch → `503 { "ok": false, "error": "internal_error" }`.

Note: response is intentionally lean (`mmrValue`/`confidence`/`method`); MMR
distribution fields (`wholesaleClean`, etc.) can be added later via
`valuation/valuationResult.fromMmrResult` if the frontend needs them.

## Consequences

- New Cloudflare secret `APP_API_SECRET` must be provisioned on `tav-aip-staging`
  and `tav-aip-production` (`wrangler secret put APP_API_SECRET`) before the
  frontend integrates. Unset ⇒ all `/app/*` calls `503`.
- `docs/APP_API.md` is the source-of-truth contract for the frontend; this ADR
  records the *decision and rationale*. Keep the two in sync when a route changes.
- A future per-user authZ requirement would migrate `/app/*` to Cloudflare Access
  + `extractUserContext`; the route shapes above are designed to survive that.

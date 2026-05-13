# `/app/*` — Frontend Product API

Contract for the `/app/*` HTTP surface on the main `tav-aip` Worker, consumed by the
TAV-owned frontend/dashboard. This is the source of truth for frontend integration.

- **Worker:** `tav-aip` (same Worker as `/ingest`, `/admin/*`, `/health` — see `docs/architecture.md`).
- **Implementation:** `src/index.ts` → `src/app/routes.ts` (`handleApp`).
- **Origin / ADR:** `docs/adr/0002-frontend-app-api-layer.md`.
- **Status:** all 5 endpoints implemented + live on `tav-aip-staging` and `tav-aip-production` (2026-05-11; see `docs/app-api-smoke-2026-05-11.md`).

## Base URLs

| Env | Base URL |
|-----|----------|
| staging | `https://tav-aip-staging.rami-1a9.workers.dev/app` |
| production | `https://tav-aip-production.rami-1a9.workers.dev/app` |

## Auth

Bearer token in the `Authorization` header, value = `APP_API_SECRET` (a Cloudflare
Worker secret, distinct from `ADMIN_API_SECRET` — the frontend never holds an
ops-grade credential). Hold `APP_API_SECRET` server-side only; never ship it to a
browser.

```
Authorization: Bearer <APP_API_SECRET>
```

| Condition | Response |
|-----------|----------|
| `APP_API_SECRET` not configured on the Worker | `503 { "ok": false, "error": "app_auth_not_configured" }` |
| Missing / wrong Bearer token | `401 { "ok": false, "error": "unauthorized" }` |

(Mirrors `/admin/*` auth failure modes.)

## Conventions

- **Content type:** every response is `application/json`.
- **Envelope:** authenticated success → `{ "ok": true, "data": ... }`; any error →
  `{ "ok": false, "error": "<code>" }` (some errors add extra fields, e.g. `issues`).
- **`null` + `missingReason`.** Any metric that cannot be computed is returned as
  `null` with a sibling `missingReason: "<code>"` (KPI blocks use
  `{ "value": null, "missingReason": "<code>" }`). The frontend never receives a
  fabricated number — no synthetic or estimated rollups.
- **`GET /app/system-status` never fails the request.** It reports unhealthy state
  in the body and still returns `200`. Treat it as a health *report*, not a probe.
- **`POST /app/mmr/vin` errors are non-blocking.** An unavailable / rate-limited /
  timed-out / unconfigured intelligence worker surfaces as `mmrValue: null` +
  `missingReason`, still `200` — never a 5xx.
- **5xx semantics.** A `503` from `/app/*` means a hard dependency failure
  (Supabase client could not be constructed, or an unexpected exception). It is
  retryable. There is no `4xx` for "no data" — empty results are `200` with an
  empty array / `null` value.
- `/app/*` does not touch `/ingest`, `/admin`, or `/health` behaviour, and does
  not change the four-concept boundary or any Supabase schema.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/app/system-status` | Health snapshot for the dashboard header |
| GET | `/app/kpis` | Product KPIs from Supabase |
| GET | `/app/import-batches` | Recent outcome-import batches |
| GET | `/app/historical-sales` | `tav.historical_sales` rows, filterable |
| POST | `/app/mmr/vin` | On-demand MMR valuation by VIN |

Unknown path / method under `/app/*` → `404 { "ok": false, "error": "not_found" }`.

---

### `GET /app/system-status`

Always `200`.

```jsonc
{ "ok": true, "data": {
  "service": "tav-enterprise",
  "version": "0.1.0",                       // src/version.ts VERSION
  "timestamp": "<ISO8601>",
  "db": { "ok": true }                       // OR { "ok": false, "missingReason": "db_error" }
       | { "ok": false, "missingReason": "db_error" },
  "intelWorker": {
    "mode": "worker" | "direct",             // MANHEIM_LOOKUP_MODE
    "binding": true | false,                 // is the INTEL_WORKER service binding present
    "url": "<string>" | null                 // INTEL_WORKER_URL, or null if unset
  },
  "sources": [ /* rows from tav.v_source_health; [] if db unavailable */ ],
  "staleSweep": { "lastRunAt": "<ISO8601>", "status": "ok"|"failed", "updated": <int>|null }
              | { "lastRunAt": null, "missingReason": "never_run" | "db_error" }
}}
```

- `db.ok=false` ⇒ `sources` is `[]` and `db.missingReason="db_error"`. If the Supabase
  client itself can't be constructed, `staleSweep` is also `{ lastRunAt: null, missingReason: "db_error" }`.
- `staleSweep` reports the latest daily stale-sweep cron run, read from `tav.cron_runs`
  (job `stale_sweep`, written by the Worker's `scheduled()` handler — best-effort):
  `lastRunAt` = the run's `finished_at`, falling back to `started_at`; `status` ∈ `ok`|`failed`;
  `updated` = rows touched by the sweep, or `null` if the run recorded no count (e.g. a failed
  run). `missingReason: "never_run"` ⇒ no run since `cron_runs` existed; `"db_error"` ⇒ the
  `cron_runs` lookup (or the client) failed — independent of `db.ok` for `v_source_health`.

---

### `GET /app/kpis`

Product KPIs sourced from Supabase tables/views. Each block degrades independently:
a block that fails its query becomes `{ "value": null, "missingReason": "db_error" }`.
The whole call returns `503 { "ok": false, "error": "db_error" }` *only* if the
Supabase client itself cannot be constructed.

```jsonc
{ "ok": true, "data": {
  "generatedAt": "<ISO8601>",
  "outcomes": {
    "value": {
      "totalOutcomes": 1234,                 // COUNT(*) from tav.v_outcome_summary_global
      "avgGrossProfit": 1500.0  | null,       // global AVG (NULL ⇒ null, e.g. empty table)
      "avgHoldDays": 21.5       | null,
      "lastOutcomeAt": "<ISO8601>" | null,
      "byRegion": [ /* rows from tav.v_outcome_summary (per-region rollup) */ ]
    } | null,
    "missingReason": "db_error" | null
  },
  "leads":    { "value": { "total": 0 } | null,           "missingReason": "db_error" | null },
  "listings": { "value": { "normalizedTotal": 0 } | null, "missingReason": "db_error" | null }
}}
```

- The top-level `outcomes.value` aggregates come from `tav.v_outcome_summary_global`
  (migration 0041) — a single-row view that computes a *true global* `AVG`, not a
  mean of per-region means. `byRegion` is the honest per-region rollup from
  `tav.v_outcome_summary`, passed through **verbatim** (so each row also carries the
  raw `sell_through_rate`, `last_outcome_at`, etc. columns). Any aggregate that is
  `NULL` in the view (empty `purchase_outcomes`) is passed through as `null` — no
  number is fabricated.
- **No top-level `sellThroughRate`.** The views carry a `sell_through_rate` column
  (`rows with sale_price ÷ total`), but the synthesized top-level `outcomes.value.sellThroughRate`
  is **intentionally not surfaced** (removed 2026-05-11, Round 5): `tav.purchase_outcomes`
  currently holds only sold/imported outcome rows (every row has a `sale_price`), so the
  ratio is tautologically `1.0` and would mislead the frontend. A real sell-through metric
  is blocked on TAV persisting acquisition-time `purchase_outcomes` rows (i.e. inventory
  bought-but-not-yet-resold) — tracked in `docs/followups.md`. The SQL views are unchanged,
  and the raw per-region `sell_through_rate` still appears inside `byRegion` rows for now.
- The `outcomes` block degrades to `{ "value": null, "missingReason": "db_error" }`
  if *either* view query fails; the `leads` / `listings` blocks are independent.

---

### `GET /app/import-batches`

Recent outcome-import batches, newest first. Thin read wrapper over
`persistence/importBatches.listImportBatches`. Equivalent data to
`GET /admin/import-batches`, but under `/app/*` auth.

Query params:

| Param | Default | Notes |
|-------|---------|-------|
| `limit` | `20` | Clamped to `100`. Any value that is not a positive integer (missing, empty, `0`, negative, fractional, non-numeric) falls back to `20`. |

Success → `200 { "ok": true, "data": ImportBatch[] }` where:

```jsonc
// ImportBatch (src/types/domain.ts)
{
  "id": "<uuid>",
  "createdAt": "<ISO8601>",
  "weekLabel": "<string>" | null,
  "rowCount": 0,
  "importedCount": 0,
  "duplicateCount": 0,
  "rejectedCount": 0,
  "status": "pending" | "importing" | "complete" | "failed",
  "notes": "<string>" | null
}
```

Failure: Supabase client cannot be constructed, or the query throws →
`503 { "ok": false, "error": "db_error" }`.

---

### `GET /app/historical-sales`

Rows from `tav.historical_sales` (migration 0025), ordered `sale_date DESC`. Thin
read wrapper over `persistence/historicalSales.listHistoricalSales`. (`grossProfit`
is a Postgres STORED generated column — read-only.)

Query params (all optional):

| Param | Behaviour |
|-------|-----------|
| `limit` | Default `20`, clamped to `100`; non-positive-integer values fall back to `20` (same rule as `/app/import-batches`). |
| `year` | Included only if it parses to a finite number. Exact match. |
| `make` | Passed through verbatim. Exact match (v1). |
| `model` | Passed through verbatim. Exact match (v1). |
| `since` | Passed through verbatim; applied as `sale_date >= since`. Expected ISO date string; not validated server-side in v1. |

Success → `200 { "ok": true, "data": HistoricalSale[] }` where:

```jsonc
// HistoricalSale (src/persistence/historicalSales.ts — canonical row type)
{
  "id": "<uuid>",
  "vin": "<string>" | null,
  "year": 2021,
  "make": "Ford",
  "model": "F-150",
  "trim": "<string>" | null,
  "buyer": "<string>" | null,
  "buyerUserId": "<string>" | null,
  "acquisitionDate": "<ISO date>" | null,
  "saleDate": "<ISO date>",
  "acquisitionCost": 0 | null,
  "salePrice": 0,
  "transportCost": 0 | null,
  "reconCost": 0 | null,
  "auctionFees": 0 | null,
  "grossProfit": 0 | null,            // STORED generated column
  "sourceFileName": "<string>" | null,
  "uploadBatchId": "<uuid>" | null,
  "createdAt": "<ISO8601>"
}
```

Failure: Supabase client cannot be constructed, or the query throws →
`503 { "ok": false, "error": "db_error" }`.

---

### `POST /app/mmr/vin`

On-demand MMR valuation by VIN, proxied to `tav-intelligence-worker` via
`valuation/workerClient.getMmrValueFromWorker` (which chooses Service-Binding vs
public-fetch transport automatically).

Request body — validated by a local Zod schema, deliberately narrower than the
intelligence layer's `MmrVinLookupRequestSchema` (the frontend never sends
`force_refresh` or requester identity):

```jsonc
{
  "vin": "1FT8W3BT1SEC27066",   // required, string, trimmed, 11–17 chars
  "year": 2021,                  // optional, integer, 1900–2100
  "mileage": 50000               // optional, integer, 0–2_000_000
}
```

| Condition | Response |
|-----------|----------|
| Malformed JSON | `400 { "ok": false, "error": "invalid_json" }` |
| Body fails validation | `400 { "ok": false, "error": "invalid_body", "issues": [ ...up to 5 Zod issues ] }` |
| Worker resolves a value | `200 { "ok": true, "data": { "mmrValue": <number>, "confidence": "high"\|"medium"\|"low", "method": "vin"\|"year_make_model"\|null } }` |
| Otherwise (always `200`, non-blocking) | `200 { "ok": true, "data": { "mmrValue": null, "missingReason": "<code>" } }` |
| Unexpected error (not a `Worker*Error`) | `503 { "ok": false, "error": "internal_error" }` |

`missingReason` codes:

| Code | Meaning |
|------|---------|
| `intel_worker_not_configured` | `INTEL_WORKER_URL` is empty (checked before any call). |
| `no_mmr_value` | Worker call succeeded but returned a negative-cache envelope, insufficient params, or an unparseable body. |
| `intel_worker_timeout` | `WorkerTimeoutError` — 5 s abort. |
| `intel_worker_rate_limited` | `WorkerRateLimitError` — HTTP 429 from the worker. |
| `intel_worker_unavailable` | `WorkerUnavailableError` — other non-2xx from the worker. |

Response is intentionally lean (`mmrValue` / `confidence` / `method`). MMR
distribution fields (`wholesaleClean`, etc.) can be added later via
`valuation/valuationResult.fromMmrResult` if the frontend needs them.

> History: `tav-intelligence-worker-production` was Cox-sandbox-backed between the
> 2026-05-09 cutover and the 2026-05-13 Cox production credential rotation. Production
> `/app/mmr/vin` now hits the live Cox MMR endpoint. `/app/kpis` reads Supabase
> directly (not MMR), unaffected by the rotation.

## Worker config (operator reference)

| Var | Type | Role |
|-----|------|------|
| `APP_API_SECRET` | secret | Bearer credential for all `/app/*`. Unset ⇒ every `/app/*` call `503 app_auth_not_configured`. Provision with `wrangler secret put APP_API_SECRET` on each env. |
| `INTEL_WORKER` | service binding | Service binding to `tav-intelligence-worker-<env>` (preferred transport for `/app/mmr/vin`). |
| `INTEL_WORKER_URL` | var | Public URL fallback for the intel worker. Empty ⇒ `/app/mmr/vin` → `intel_worker_not_configured`. |
| `MANHEIM_LOOKUP_MODE` | var | `worker` (current) vs `direct`. Reported by `/app/system-status` as `intelWorker.mode`. |

## Frontend integration notes

- Always send the Bearer header; expect `401` without it.
- Treat `503` as transient (retry with backoff). Treat `400` on `/app/mmr/vin` as a
  client bug (bad VIN / body) — do not retry unchanged.
- For every numeric KPI, branch on `value === null` and show the `missingReason`
  rather than rendering `0` or a placeholder number.
- `/app/system-status` is safe to poll for a header health badge — it never 5xxs on
  dependency failure; inspect `db.ok` and `staleSweep`.
- `limit` on the list endpoints is best-effort: the server clamps to `100` and
  silently corrects invalid values to `20` — don't rely on it rejecting bad input.

## Open follow-ups

Tracked in `docs/followups.md`:

- A real `sellThroughRate` for `/app/kpis` is blocked on the lead→purchase /
  acquisition-persistence workflow writing `purchase_outcomes` rows *before* resale
  (so the denominator becomes "vehicles acquired", not "vehicles already sold").
  The field is omitted from the contract until then.

## Related docs

- `docs/adr/0002-frontend-app-api-layer.md` — decision record + rationale.
- `docs/app-api-smoke-2026-05-11.md` — deploy + smoke evidence (both rounds).
- `docs/architecture.md` — the four HTTP surfaces, repo layout, env, routes.
- `docs/INTELLIGENCE_CONTRACTS.md` — the intel-worker contracts behind `/app/mmr/vin`.

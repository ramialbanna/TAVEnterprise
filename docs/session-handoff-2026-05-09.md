# Session handoff — 2026-05-09

## Current state

TAV-AIP is the canonical project. Use:

- Local repo: `/Users/ramialbanna/Claude/tav-aip`
- GitHub repo: `ramialbanna/TAVEnterprise`

The old prototype folder was archived locally:

- `/Users/ramialbanna/Claude/tav-acquisition-intelligence_ARCHIVE_2026-05-09`

Do not continue work in `tav-acquisition-intelligence`.

## What shipped today

- Staging worker-mode MMR validated end to end.
- Production cut over to `MANHEIM_LOOKUP_MODE=worker`.
- Main production worker now calls `tav-intelligence-worker-production` through Cloudflare Service Binding `INTEL_WORKER`.
- Cloudflare public worker-to-worker fetch issue `1042` was fixed by Service Binding.
- Facebook adapter now propagates VIN when present.
- Intelligence worker response envelope mismatch was fixed.
- `valuation_snapshots` distribution columns were added via migration `0040`.
- Production smoke passed:
  - RUN_ID `prod-smoke-20260509-124947`
  - `transport=service_binding`
  - `valuation.fetched mmr_value=68600 confidence=high`
  - `ingest.complete processed=1 rejected=0`

## Important caveat

Production Cloudflare is live, but Cox MMR is currently sandbox-backed.

`tav-intelligence-worker-production` uses Cox Sandbox Bridge 2 credentials and:

- `https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr`

This is intentional until Cox enables true production MMR for TAV. All production worker-mode MMR values currently reflect Cox sandbox data.

## Deployed workers

- `tav-aip-production`: `ab34d529-25ae-4edd-9f10-566fda6447cf`
- `tav-intelligence-worker-production`: `edac5dbf-1010-4c75-a267-e0df5adc50eb`
- `tav-aip-staging`: `a751f189-9a58-4133-b6f8-1d875dcf13c4`
- `tav-intelligence-worker-staging`: `93941d87-87df-4f96-bbb6-b17a8f11f8ca`

## Rollback

Fast rollback is Cloudflare dashboard env-var flip:

- `tav-aip-production`
- set `MANHEIM_LOOKUP_MODE=direct`

No redeploy required. This darkens the worker-mode path.

## Remaining non-blocking tasks

1. Confirm Apify production caller has `WEBHOOK_HMAC_SECRET`.
2. Confirm admin tooling has `ADMIN_API_SECRET`.
3. Cox: enable true production MMR credentials.
4. Once Cox enables prod MMR, re-put intel-prod Cox secrets and rerun prod smoke.
5. Write final production runbook page from `docs/staging-smoke-2026-05-09.md`.
6. Build frontend-facing `/app/*` API layer for Base44/front-end integration.

## Tomorrow starting point

Start with backend product APIs for the frontend:

- `GET /app/system-status`
- `GET /app/kpis`
- `GET /app/import-batches`
- `GET /app/historical-sales`
- `POST /app/mmr/vin`

Rules:

- Do not expose secrets to the frontend.
- Use real Supabase/TAV historical data first.
- Return `null` plus `missingReason` when a metric cannot be computed.
- Keep `/ingest`, `/admin`, and `/health` behavior unchanged.


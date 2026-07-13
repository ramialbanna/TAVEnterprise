# Apify Integration — Current State

**Last updated:** 2026-07-13
**Apify account:** Texas Auto Value (org), user `QMujfuk8dx5hf5ZC3` (`Rami_TAV`)
**Bridge code:** `src/apify/webhookHandler.ts`, `src/apify/regionMap.ts`, `src/apify/payloadAdapter.ts`, `src/apify/datasetFetch.ts`, `src/apify/payloadSchema.ts`
**Related docs:** [apify-phase8-regions.md](apify-phase8-regions.md) · [apify-production-diagnosis-2026-05-21.md](apify-production-diagnosis-2026-05-21.md)

---

## 1. Actors

Two distinct Apify actors are in play. Both scrape Facebook Marketplace vehicle listings and both are consumed by the **same** generic Worker bridge (`POST /apify-webhook`) — the bridge routes purely on `actorTaskId`, not actor identity, so both actors' tasks share one `APIFY_TASK_REGION_MAP` in `src/apify/regionMap.ts`.

| Actor | Actor ID | Notes |
|---|---|---|
| `raidr-api/facebook-marketplace-vehicle-scraper` | `hHO9oVnraeiFBfwW3` | Original, rented actor. One location per task. In production since ~2026-04-27. |
| `raidr-api/custom-vehicle-scraper` | `p9KmSSSTCF0RZrxAK` | Newer, streamlined actor. Supports multiple `locationSearches` per task (with per-location Discord webhooks), narrower filter set (radius, price, year, mileage, transmission, keyword include/exclude). Connected to the Worker on 2026-07-07. |

---

## 2. Tasks

| Task name | Task ID | Actor | Region (per `regionMap.ts`) |
|---|---|---|---|
| `tav-tx-east` | `nccVufFs2grLH4Qsj` | facebook-marketplace-vehicle-scraper | `dallas_tx` |
| `tav-tx-south` | `MWtcjZFWqJrnYChgp` | facebook-marketplace-vehicle-scraper | `san_antonio_tx` |
| `tav-tx-west` | `vk7OijnAOOo8V1ekc` | facebook-marketplace-vehicle-scraper | `lubbock_tx` |
| `tav-ok` | `Xpq656NgueqfXDHvU` | facebook-marketplace-vehicle-scraper | `oklahoma_city_ok` |
| `tav-tx-east-1` | `Mqht0BwvJUyE2EN2j` | custom-vehicle-scraper | **not mapped** — no webhook attached |
| `tav-tx-west-1` | `Ae03SdQDNJrtB7Gwh` | custom-vehicle-scraper | **not mapped** — no webhook attached |
| `tav-tx-south-1` | `WPbyamqqbNA1uYGO6` | custom-vehicle-scraper | **not mapped** — no webhook attached |
| `tav-ok-1` / `oklahoma` | `UfFehLMz5zylHOxCS` | custom-vehicle-scraper | `oklahoma_city_ok` — **live** (schedule + webhook) |
| `dallas-nick-task` | `ZQEsd3nHcLAs5kLwL` | custom-vehicle-scraper | `dallas_tx` — **live** |

Several custom-scraper regional tasks exist in Apify; only **Dallas** + **Oklahoma** are mapped and webhooked to production today.

`dallas-nick-task` input (as configured 2026-07-07): single location `Dallas, Texas`, radius 50mi, maxResults 100/location, max listing age 4h, price $3,500–$250,000, year 2012–2026, mileage 0–175,000mi, all makes/transmissions, no detail-fetch.

---

## 3. Schedules

| Schedule | Task | Cron | Timezone | Enabled |
|---|---|---|---|---|
| `tav-tx-east` (`JdekUcQ4NZBdE25pw`) | `nccVufFs2grLH4Qsj` | `*/5 * * * *` | America/Chicago | ❌ **disabled 2026-07-07** |
| `tav-tx-west` (`KD49MXipQmFUEiIRc`) | `vk7OijnAOOo8V1ekc` | `2-59/5 * * * *` | America/Chicago | ❌ **disabled 2026-07-07** |
| `tav-tx-south` (`6yk59JRahCfbTy2h8`) | `MWtcjZFWqJrnYChgp` | `4-59/5 * * * *` | America/Chicago | ❌ disabled (pre-existing, per Phase 4 diagnosis) |
| `tav-ok` (`0qdlWHsaojVZxEb1s`) | `Xpq656NgueqfXDHvU` | `6-59/5 * * * *` | America/Chicago | ❌ disabled (pre-existing) |
| `tav-tx-dallas-custom` (`Tg1B3jlwg7Ldo5W4D`) | `ZQEsd3nHcLAs5kLwL` (`dallas-nick-task`) | `*/5 * * * *` | America/Chicago | ✅ **enabled** |
| `tav-oklahoma-scheduled-task` (`e1r7wihcYOkbp0LxW`) | `UfFehLMz5zylHOxCS` (`oklahoma`) | `*/5 * * * *` | UTC | ✅ **enabled** |

**Current live state (2026-07-13):** `tav-tx-dallas-custom` + `tav-oklahoma-scheduled-task` are running. Original east/west/south schedules remain disabled.

---

## 4. Webhooks

All webhooks fire on `ACTOR.RUN.SUCCEEDED` only, with the standard Apify default payload template (`{userId, createdAt, eventType, eventData, resource}`) and an `Authorization: Bearer <APIFY_WEBHOOK_SECRET>` header.

| Webhook ID | Task | Target | Enabled | Last status |
|---|---|---|---|---|
| `jSY8nS2kCeptjT0k8` | `nccVufFs2grLH4Qsj` (east) | production | ✅ | SUCCEEDED (9,572 dispatches lifetime) |
| `SctQUZrEDULDqHhPg` | `nccVufFs2grLH4Qsj` (east) | staging | ❌ | FAILED (stale placeholder secret — see §6) |
| `HgSL4RcejdP8tvTMZ` | `Xpq656NgueqfXDHvU` (ok) | production | ✅ | SUCCEEDED |
| `P96OB6izBW301bpZg` | `Xpq656NgueqfXDHvU` (ok) | staging | ✅ | SUCCEEDED |
| `MXl5zxCEIGo9cWQUC` | `MWtcjZFWqJrnYChgp` (south) | production | ❌ | SUCCEEDED |
| `FS1ZWfNkYlejd3PSC` | `MWtcjZFWqJrnYChgp` (south) | staging | ❌ | SUCCEEDED |
| `wXKRwu2oJuJUx0GAL` | `vk7OijnAOOo8V1ekc` (west) | production | ❌ | SUCCEEDED |
| `gDL04qc5UScqXYv9A` | `vk7OijnAOOo8V1ekc` (west) | staging | ❌ | SUCCEEDED |
| `JUTafqZ7GwpxrPetC` | *(no condition — orphan)* | staging | ❌ | FAILED |
| `KEnZj0JDLClNfk5Ld` | `ZQEsd3nHcLAs5kLwL` (dallas-nick-task) | production | ✅ | SUCCEEDED (live) |
| `0E4YhklgbD9KQT8o7` | `UfFehLMz5zylHOxCS` (oklahoma) | production | ✅ | SUCCEEDED (live) |

**2026-07-13 outage:** Apify webhooks were returning HTTP 200 with `skipped: unmapped_task` because `ZQEsd3nHcLAs5kLwL` / `UfFehLMz5zylHOxCS` were never committed to `main` / production `regionMap`. Fixed by shipping the custom-task mappings + payloadAdapter price/location compatibility.

---

## 5. Cloudflare Worker side

- **Code:** `src/apify/regionMap.ts` now includes `ZQEsd3nHcLAs5kLwL: "dallas_tx"` alongside the original 4 mappings. Deployed to `tav-aip-production` (version `43607f64-137e-49a7-b671-48b1524f9bbd`, 2026-07-07).
- **`APIFY_WEBHOOK_SECRET` rotated on both environments** (2026-07-07), replacing values that were causing failures:
  - **Staging (`tav-aip-staging`):** was a literal placeholder value (fails `isConfiguredSecret()` in `src/types/envValidation.ts`) → every request 503'd with `apify_auth_not_configured` regardless of header. Rotated to a real 64-char hex value.
  - **Production (`tav-aip-production`):** was already a real configured value, but didn't match what had been pasted into the Apify webhook header (401 `unauthorized`). Rotated to guarantee a clean match, then confirmed working against `dallas-nick-task`'s webhook.
- **`APIFY_TOKEN`** (Apify PAT for dataset/run reads) — already configured on both environments prior to this session, untouched.
- No changes were needed to `payloadAdapter.ts`, `datasetFetch.ts`, `payloadSchema.ts`, or `webhookHandler.ts` to *connect* the new actor — the bridge is actor-agnostic by design. (A real bug in `payloadAdapter.ts` was found afterward — see §7.)

---

## 6. Timeline (this session, 2026-07-07)

1. Investigated connecting `raidr-api/custom-vehicle-scraper` to the Worker so results show as Opportunities on the Vercel app. Confirmed the bridge is actor-agnostic (routes on `actorTaskId`, not actor name) and the new actor's documented output shape matches `payloadAdapter.ts`'s expectations closely enough to attempt without code changes.
2. User created `dallas-nick-task` in Apify Console with Dallas-specific filters (radius 50mi, $3.5k–$250k, year 2012–2026, 4h max age) and attached a webhook (`KEnZj0JDLClNfk5Ld`) pointed at `tav-aip-production`.
3. First webhook test failed. Diagnosed via direct `curl` probes against both Worker environments:
   - Staging: `503 apify_auth_not_configured` → placeholder secret, never worked.
   - Production: `401 unauthorized` → secret was real but mismatched.
4. Rotated `APIFY_WEBHOOK_SECRET` on both `tav-aip-staging` and `tav-aip-production` via `wrangler secret put`, generating fresh random values and handing them to the user to paste into the respective Apify webhooks.
5. User granted a scoped Apify API token (`TAV-AIP` org token, via `docs/.env` — deleted after use, see below) to debug directly instead of guessing via the console UI.
6. Used the Apify REST API directly to:
   - List all actor tasks and webhooks (surfaced the 4 unwired `-1` tasks and the true task ID behind `dallas-nick-task`).
   - Pull webhook dispatch history with full response bodies — found the "Test" button's synthetic payload triggers `400 invalid_payload` (expected; test payloads don't match a real run's `resource` shape) while a **real** triggered run succeeded end-to-end.
7. Triggered a real run of `dallas-nick-task` via `POST /v2/actor-tasks/{id}/runs`. Confirmed the webhook fired, the Worker responded `200`, and initially reported `skipped: unmapped_task` (expected — region map didn't have the task yet).
8. Added `ZQEsd3nHcLAs5kLwL → dallas_tx` to `src/apify/regionMap.ts`. Ran full test suite (87 passed). Followed `.cursor/rules/wrangler-deploy-safety.mdc`: pre-deploy secret list check → `wrangler deploy --env production` → post-deploy secret list diff (no drops) → `/health` check.
9. Re-ran the task; confirmed the webhook now returns a real ingest result and a row lands in `tav.source_runs` with `region = 'dallas_tx'`.
10. At user's request: created a new schedule `tav-tx-dallas-custom` (`*/5 * * * *`, America/Chicago) targeting `dallas-nick-task`, then **disabled** the `tav-tx-east` and `tav-tx-west` schedules (explicitly flagged that `east` was the only proven lead source before disabling, per user confirmation).
11. User shared the Apify API token via `docs/.env` (gitignored). Token was used only for `curl`/`Invoke-RestMethod` calls in-session and the file was deleted after use (2026-07-08) — recreate it if API access is needed again.

---

## 7. `payloadAdapter.ts` custom-scraper field names — **fixed 2026-07-13**

`raidr-api/custom-vehicle-scraper` emits `price.{amount,formatted}` and flat `location.{city,state}` instead of the original actor's `listing_price` / `location.reverse_geocode` shapes. `mapRaidrApiItem` now accepts both. Prior to the fix, nearly all custom-scraper items rejected as `invalid_price`.

---

## 8. Open items / not yet decided

- Decide whether to re-enable `tav-tx-east` (proven source) alongside the new Dallas custom task, or keep it off.
- Decide whether to wire up remaining multi-state custom tasks (many exist in Apify; only Dallas + Oklahoma are mapped + webhooked today).
- Row Level Security is disabled on all `tav.*` Supabase tables (found incidentally while verifying ingest — unrelated to Apify, flagged separately, not fixed).
- Staging webhooks for the original 4 tasks were left as-is (mostly disabled) — not part of this session's scope beyond the one secret rotation.

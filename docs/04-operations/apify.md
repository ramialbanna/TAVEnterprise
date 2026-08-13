# Apify Integration — Current State

**Last updated:** 2026-08-07
**Apify account:** Texas Auto Value (org), user `QMujfuk8dx5hf5ZC3` (`Rami_TAV`)
**Bridge code:** `src/apify/webhookHandler.ts`, `src/apify/regionMap.ts`, `src/apify/payloadAdapter.ts`, `src/apify/automotiveScraperAdapter.ts`, `src/apify/datasetFetch.ts`, `src/apify/payloadSchema.ts`
**Related docs:** [apify-phase8-regions.md](apify-phase8-regions.md) · [apify-production-diagnosis-2026-05-21.md](apify-production-diagnosis-2026-05-21.md) · tracker item **67** in [`NEXT_STEPS.md`](../NEXT_STEPS.md)

---

## 1. Actors

Three Apify actors feed the Worker bridge (`POST /apify-webhook`). Routing is by `actorTaskId` via `APIFY_TASK_CONFIG` in `src/apify/regionMap.ts` (region **and** ingest `source`). Facebook tasks use `mapRaidrApiItem`; Craigslist automotive-scraper uses `mapAutomotiveScraperItem`.

| Actor | Actor ID | Notes |
|---|---|---|
| `raidr-api/facebook-marketplace-vehicle-scraper` | `hHO9oVnraeiFBfwW3` | Original, rented actor. One location per task. In production since ~2026-04-27. |
| `raidr-api/custom-vehicle-scraper` | `p9KmSSSTCF0RZrxAK` | Newer, streamlined actor. Supports multiple `locationSearches` per task. Connected 2026-07-07. |
| `e-commerce/automotive-scraper` | `HqZudyEggO98WZvlN` | Craigslist search-URL scraper (schema.org `Car`). Item **67** Phase 0 eval go 2026-08-07; Phase 1 bridge wired. |

---

## 2. Tasks

| Task name | Task ID | Actor | Region / source |
|---|---|---|---|
| `tav-tx-east` | `nccVufFs2grLH4Qsj` | facebook-marketplace-vehicle-scraper | `dallas_tx` / facebook |
| `tav-tx-south` | `MWtcjZFWqJrnYChgp` | facebook-marketplace-vehicle-scraper | `san_antonio_tx` / facebook |
| `tav-tx-west` | `vk7OijnAOOo8V1ekc` | facebook-marketplace-vehicle-scraper | `lubbock_tx` / facebook |
| `tav-ok` | `Xpq656NgueqfXDHvU` | facebook-marketplace-vehicle-scraper | `oklahoma_city_ok` / facebook |
| `tav-ok-1` / `oklahoma` | `UfFehLMz5zylHOxCS` | custom-vehicle-scraper | `oklahoma_city_ok` / facebook — **live** |
| `dallas-nick-task` | `ZQEsd3nHcLAs5kLwL` | custom-vehicle-scraper | `dallas_tx` / facebook — **live** |
| `cl-dallas-automotive` | `NMTFTt1C0aEnhEuY9` | automotive-scraper | `dallas_tx` / **craigslist** — mapped; **schedule disabled** until soak |

Several custom-scraper regional tasks exist in Apify; only **Dallas** + **Oklahoma** Facebook custom tasks are scheduled live. Craigslist Dallas is mapped for manual / future schedule runs.

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
| `tav-cl-dallas-automotive` (`HIb0Pg9Gg3Pn7RNfD`) | `NMTFTt1C0aEnhEuY9` | `7,22,37,52 * * * *` | America/Chicago | ❌ **disabled** until item 67 staging/prod soak |

**Current live state (2026-08-07):** Facebook Dallas + Oklahoma custom schedules running. CL automotive schedule stays off.

---

## 4. Webhooks

All webhooks fire on `ACTOR.RUN.SUCCEEDED` only, with the standard Apify default payload template (`{userId, createdAt, eventType, eventData, resource}`) and an `Authorization: Bearer <APIFY_WEBHOOK_SECRET>` header.

| Webhook ID | Task | Target | Enabled | Last status |
|---|---|---|---|---|
| `jSY8nS2kCeptjT0k8` | `nccVufFs2grLH4Qsj` (east) | production | ✅ | SUCCEEDED |
| `SctQUZrEDULDqHhPg` | `nccVufFs2grLH4Qsj` (east) | staging | ❌ | FAILED (stale placeholder secret — see history) |
| `HgSL4RcejdP8tvTMZ` | `Xpq656NgueqfXDHvU` (ok) | production | ✅ | SUCCEEDED |
| `P96OB6izBW301bpZg` | `Xpq656NgueqfXDHvU` (ok) | staging | ✅ | SUCCEEDED |
| `MXl5zxCEIGo9cWQUC` | `MWtcjZFWqJrnYChgp` (south) | production | ❌ | SUCCEEDED |
| `FS1ZWfNkYlejd3PSC` | `MWtcjZFWqJrnYChgp` (south) | staging | ❌ | SUCCEEDED |
| `wXKRwu2oJuJUx0GAL` | `vk7OijnAOOo8V1ekc` (west) | production | ❌ | SUCCEEDED |
| `gDL04qc5UScqXYv9A` | `vk7OijnAOOo8V1ekc` (west) | staging | ❌ | SUCCEEDED |
| `JUTafqZ7GwpxrPetC` | *(no condition — orphan)* | staging | ❌ | FAILED |
| `KEnZj0JDLClNfk5Ld` | `ZQEsd3nHcLAs5kLwL` (dallas-nick-task) | production | ✅ | SUCCEEDED (live) |
| `0E4YhklgbD9KQT8o7` | `UfFehLMz5zylHOxCS` (oklahoma) | production | ✅ | SUCCEEDED (live) |
| `k44uPe3kKRoXFH9bx` | `NMTFTt1C0aEnhEuY9` (cl-dallas-automotive) | production | ✅ | created 2026-08-07 — needs Worker deploy with task map |

**2026-07-13 outage:** Apify webhooks returned HTTP 200 with `skipped: unmapped_task` because custom Dallas/OK task IDs were missing from production `regionMap`. Fixed by shipping mappings + payloadAdapter compatibility.

---

## 5. Cloudflare Worker side

- **Code:** `APIFY_TASK_CONFIG` includes Facebook tasks + `NMTFTt1C0aEnhEuY9 → { dallas_tx, craigslist }`. Webhook branches mapper by `source`.
- **`APIFY_WEBHOOK_SECRET` / `APIFY_TOKEN`** — configured on staging + production (rotated 2026-07-07).
- Craigslist path: `mapAutomotiveScraperItem` → `parseCraigslistItem` → same ingest/MMR pipeline; LLM prefetch includes `source === "craigslist"`.

---

## 6. Craigslist automotive-scraper (item 67) — **2026-08-07**

- Phase 0 offline eval **go** (adapter pass ~96%, Y/M/M+price among passed ~99%).
- Phase 1: `APIFY_TASK_CONFIG` + webhook source branch + LLM prefetch for craigslist.
- **Do not enable** schedule `HIb0Pg9Gg3Pn7RNfD` until soak shows `source = craigslist` and acceptable MMR hit rate.
- Production webhook `k44uPe3kKRoXFH9bx` already targets `tav-aip-production` — a manual Apify run will ingest only after that Worker is deployed with the task map (schedule still off).

---

## 7. `payloadAdapter.ts` custom-scraper field names — **fixed 2026-07-13**

`raidr-api/custom-vehicle-scraper` emits `price.{amount,formatted}` and flat `location.{city,state}` instead of the original actor's `listing_price` / `location.reverse_geocode` shapes. `mapRaidrApiItem` now accepts both.

---

## 8. Open items / not yet decided

- Decide whether to re-enable `tav-tx-east` alongside the Dallas custom task.
- Wire remaining multi-state custom tasks if needed.
- Item 67 Phase 2: enable CL schedule after multi-day funnel soak vs Facebook Dallas.
- Staging webhooks for older FB tasks mostly disabled — leave as-is unless soaking CL on staging explicitly.

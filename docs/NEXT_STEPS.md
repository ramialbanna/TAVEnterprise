# Next Steps — MMR Lab

**Last updated:** 2026-09-04 (session 4 — git synced, §74 proxy top-up, §73 sample-only) · **Goal:** **near-100% MMR hit rate on eligible inventory.** Everything else is secondary.

Cox will not return a price without a style (`bodyname` is a required path segment — `manheimHttp.ts` short-circuits trimless calls with `cox_ymm_requires_trim`). So **"raise the MMR hit rate" and "resolve a complete Year + Make + Model + Style" are the same task.** There is no partial-credit valuation.

**Legend:** `[x]` done · `[~]` in progress · `[ ]` not done

---

## Fresh chat handoff (2026-09-04 session 4)

**Read this first.** Full detail lives in §72 / §73 / §74 below; this block is the minimum to continue without prior chat context.

### Repo

- Path: `TAVEnterprise-main/TAVEnterprise-main/` (workspace root may be `TAV Enterprise/`)
- **Git HEAD:** `31d861b` — *Catch up git with production Worker and Fly enrich deploys.* **Pushed** to `origin/main` (automation-TAV).
- **Git matches production** for the §72/§74 bundle shipped 2026-09-03. `.gitignore` excludes `scripts/_tmp-*`.

### Production deploy IDs (unchanged 2026-09-03)

| Surface | ID / version | What shipped |
|---------|----------------|--------------|
| **Worker** | `6bcd175b` (`tav-aip-production`) | §72 actions 7–9 (alias retirement, rate-limit retry, F-series trim+axis aliases). |
| **Fly enrich** | v6, machine `2870647c500408`, `ord` | Default queue **`needs_action`** only. CMD: `--write --loop --cloud`. Health: https://tav-seller-enrich.fly.dev/ |

### What session 4 did

1. **Git synced** — commit `31d861b` (102 files): Worker §72/§71, §74 enrich/Fly, migrations 0071/0072, tests, docs. Pushed to GitHub.
2. **§74 soak T+23h reading** — **~2,037** Facebook listings got `seller_url` since soak start; **2,623** total with URL; **3** new `blocked_sellers` (all `dealer`). Then **residential GB exhausted** (12.039 / 12 GB) → GoLogin Cloud **503 loop**, last write **~10:39Z**. **Not checkpoint.**
3. **§74 proxy top-up + recovery** — pool raised to **22 GB** (~10.04 used, **~12 GB left**). Fly self-healed **~12:56Z** (`warmup facebook.com`, `ok wrote needs_action` resumed). No machine restart needed.
4. **§73 sample-only** — `npm run eval:ymms-vision -- --sample-only`: **575** photo URLs in pool (last 3d) → **200-row sample** (91 hard / 109 random). **`--limit 1` still 401** — Anthropic credits out.
5. **Vendor (Apify)** — confirmed **cannot provide multi pictures**. Gallery / `extraListingMedia` path **closed**. §73 and §71 stay on **one 1536px primary photo**.

### Do next (priority)

1. **§74 — finish 48h soak** (~25h left at session end; clock **2026-09-03 ~13:56Z** → **~2026-09-05 13:56Z**). `npm run monitor:fly-soak` · watch residential GB (`node scripts/gologin-assign-residential.mjs --traffic-only`).
2. **§73** — reload Anthropic credits → `npm run eval:ymms-vision -- --limit 200 --concurrency 2`. Then R2 capture + prod vision tier (ambiguous subset only).
3. **§74 action 6** — more Facebook logins via GoLogin (after soak / if checkpoint).
4. **Watch §72 on prod** — `ingest.mmr_rate_limit_retry_pass` / `llm_ymms.f_series_trim_axis_alias` in Workers Logs.

### Key commands

```bash
# §74 soak monitor
npm run monitor:fly-soak

# GoLogin residential GB (503 = check this first)
node scripts/gologin-assign-residential.mjs --traffic-only

# §73 vision eval
npm run eval:ymms-vision -- --sample-only
npm run eval:ymms-vision -- --limit 200 --concurrency 2   # after Anthropic credits reload

# Inspect enrich queue (no browser)
npm run gologin:enrich -- --queue-only --limit 10

# Fly
fly logs -a tav-seller-enrich
fly status -a tav-seller-enrich
npm run gologin:enrich:deploy   # after enrich script changes

# Worker
npx wrangler deploy --env production

# Verify
npm test
cd web && npm run lint && npm run typecheck && npm test
```

### Do not

- Run `npm run gologin:enrich:daemon` locally while Fly is up (same `fb_buyer_10` profile).
- `wrangler rollback` the view filter without understanding Needs action will show unenriched Facebook again.
- Compare MMR hit rates using raw snapshot counts — use **deduped** latest snapshot per listing (see §72 reading 2026-09-03).

---

## Start here

Read **§72** (identity completeness). Claude credits are **out** — ingest is on **Claude offline mode** (alias → matcher ≥80 → last-resort). Proven-aware last-resort soak is **done** (~10d): deduped hit **79.0%**, stable ~79–80%, **not** ≥85% exit. **`llm_unavailable` is the #1 miss driver** (7.3% of listings). **§72 actions 7–9 shipped** production `6bcd175b`. **Next §72 without credits:** §73 vision when credits return.

**§74:** Needs-action-only enrich + view filter **live** (Fly v6, Worker `2b262630` bundle). **48h soak in progress** (clock **2026-09-03 ~13:56Z**). **T+23h:** ~2k `seller_url` writes; one **proxy exhaustion** pause (12 GB → top-up 22 GB, recovered ~12:56Z). Monitor: `npm run monitor:fly-soak`. Do **not** run local Orbita on `fb_buyer_10`.

**Next (priority order):**

1. **§74 soak** — ~25h left; watch residential GB; red flags: 503/checkpoint, private sellers in `blocked_sellers`.
2. **§73** — sample-only **done** 2026-09-04; **200-row Claude eval blocked** on Anthropic 401. R2 capture next after eval.
3. **§74 action 6** — repeatable Facebook signup in GoLogin (after soak / checkpoint).
4. **Watch §72 on prod** — rate-limit retry + F-series alias logs.

**Where we are — last-resort `d79ce76b` 2026-08-13 20:20Z; proven-bookable `a15e2588` 2026-08-14 16:18Z. Post-gate window measured 2026-08-15 ~13:00Z (~21h):**

| Metric | Pre last-resort | Post last-resort (`d79ce76b`) | Post-gate (`a15e2588`, ~21h) |
|--------|----------------:|------------------------------:|-----------------------------:|
| MMR hit | 71.6% (6,343) | **88.1%** (5,483) | **90.0%** (10,968 / 12,190) |
| `model_variant_missing` | 13.3% | **0.0%** | 1.6% (unbookable last-resort skipped) |
| `trim_missing` | 4.4% | 0.7% (almost all **2012**) | 0.6% |
| `cox_no_data` | 8.8% | 7.6% | **5.2%** (catalog-valid first-time styles) |
| `not_proven_bookable` | — | — | **1.2%** (151; listing garbage, no Manheim call) |
| Partial of hits | 94.5% | 87.1% | 89.1% |
| BMW hit | ~2.5% | **83.8%** (173 attempts) | n too small in this window |

VIN-from-text: 163 of 3,690 new listings after the gate had a VIN. `llm_ymms_decisions.normalized_listing_id` fixed on new rows 2026-08-28; historical rows stay null.

**2026-08-19 reading (Claude credits exhausted, 24h *before* action 6):** hit **79.5%** (6,539 / 8,229 snapshots). `not_proven_bookable` 7.2%. `llm_unavailable` 318. BMW **42.2%**. Zero `llm_hit` — alias 1,609 / offline 43.

**2026-08-20 ~24h soak after action 6 (`8f4f468f`, 15:56Z–15:56Z):** hit **81.4%** (7,525 / 9,241). `not_proven_bookable` **5.4%** (501). Year-in-model **0**, cab-only trim **0**, ineligible tokens in snapshots **0**. `ineligible_vehicle` **51** (F-550 15, Grom 11, K1600 3, …). Claude still dark: 1,730 `alias_hit` / 42 `offline_hit` / 0 `llm_hit`. BMW **51.8%** (114/220). Hygiene held; remaining npb is listing-word trims on real trucks (`f-150 / Platinum`, `XLT`, `Lariat`).

**2026-09-03 proven-aware last-resort soak (`78f79974`, `fetched_at >= 2026-08-24 19:00Z`, ~10 days):** use **deduped** latest snapshot per listing (raw attempt counts understate hit — re-pricing inflates misses). **28,042** listings · hit **79.0%** (22,159) · last 24h **79.8%** (3,366). First 24h post-deploy **76.4%** / npb **5.6%** vs action-6 first 24h **81.4%** / **5.4%** — npb essentially flat. `not_proven_bookable` **4.8%** (1,343). `llm_unavailable` **7.3%** (2,051) — **#1 miss driver** (35% of misses). `cox_no_data` **4.2%**. `trim_missing` **3.8%** (spread across years, not mostly 2012). `model_variant_missing` **0**. Partial of hits **90.9%**. BMW offline **59%** (391/659). F-150 hit **43.6% → 51.7%** pre/post deploy (484 → 882 listings); npb trims still `xlt` 173 / `lariat` 117 / `platinum` 24 on F-150 alone. Top npb: `ford/f-150/xlt`, `ford/f-150/lariat`, `ford/f-250/lariat`. `cox_proven_bookable` **14,161** rows (2012: **452**). Naive ceiling if `llm_unavailable` converted: **~86%**. **Soak closed** — stable ~79%, not climbing; proven-aware trim matching did not materially cut F-series npb.

**The three failure classes (updated 2026-09-03):**

1. **Abstention is gone on tree-covered years.** `model_variant_missing` **0%** — held through the soak.
2. **Listing-word trim, not parser garbage.** `not_proven_bookable` **23% of misses** — still Cox-invalid listing trims (`XLT`/`Lariat`/`Platinum`) on F-series. Proven-aware last-resort ranks booked styles but **does not map listing words to Cox bodynames** when the ladder won't commit. Remaining `cox_no_data` (**20% of misses**) is catalog-valid first-time styles.
3. **Infrastructure — now dominant.** `llm_unavailable` **35% of misses** (7.3% of listings) — Claude still dark; zero `llm_hit` in window. Dealer filter **on** (26,708 `dealer_listing` filtered since soak start). `trim_missing` **18% of misses**.

---

## Corrections to earlier versions of this doc

Recorded so nobody re-derives them. Rows below 2011/BMW updated 2026-08-14.

| Previous claim | Reality |
|----------------|---------|
| Scope is "Dallas FB" | Task is **`texas-nick-task`** — 9 Texas metros; a second task adds 4 Oklahoma metros. **13 metros.** Dallas is ~30% of volume. Every "Dallas FB" number in the history below is actually statewide + OK. |
| Alias retirement (prod `e779a844`, 14:40Z) caused the miss-mix shift | The shift happened at **09:00Z**, ~6h *before* that deploy. `model_variant_missing` went 1–2% → ~20% and `cox_no_data` 35% → 11% inside one hour and stayed. The retry deploy is not visible in the data. Cause still unconfirmed; migration `0070` (aliases 865 → 324) is the leading candidate. |
| `year_below_valuation_floor` logs 0 rows — "verify the gate fires" | **It fires.** First row at 15:00Z, right after deploy. The zeros were pre-deploy. Volume is now tiny because the scraper itself excludes `2008`/`2009`/`2010` by keyword. |
| Phase 0 catalog extended to 2011 | **2011 is in** (2,531 rows, cron 2026-08-14 06:09Z). **2012 synced 2026-08-15 06:00Z** (2,554 rows) — Cox 404 cleared. The proven-bookable-as-2012-candidate-list workaround is obsolete. |
| BMW ~4.9% hit | Was **2.5%**. After punctuation-insensitive make match + canonical Cox tokens: **83.8%**. |
| `cox_no_data` is the cab × engine × trim combination explosion | Mostly **wrong model token**, not wrong trim. Used to send listing words to Manheim (`ford / super duty / xl`, `bmw / x3 sdrive30i / sport`, `chevrolet / 2020 chevy / lt`). The proven-bookable gate now misses those as `not_proven_bookable` instead of calling Cox. Remaining `cox_no_data` (5.2%) is catalog-valid first-time styles. |
| Raw snapshot attempt counts for hit rate | **Understate hit** — re-pricing writes multiple rows per listing. Use **deduped** latest snapshot per `normalized_listing_id`. Sep 2026 soak: raw **77.3%** vs deduped **79.0%** on the same window. |
| Listing photos are unavailable | **The thumbnail is a rendering, not the file.** Strip `&ctp=s261x260` from the `primaryImage` URL and the same signed link returns **1536×1536**. Verified. See §73. |

---

## Assets

| Asset | Size | Why it matters |
|-------|-----:|----------------|
| **Proven-bookable combinations** | **14,161** rows in `tav.cox_proven_bookable` (2012: **452**) as of 2026-09-03 | Stronger than `cox_catalog_tree` — the tree says a row exists, this says Cox actually returned money. Last-resort + listing-text are gated on this set. Grew 10,939 → 12,702 → 14,161. |
| **Full-resolution listing photos** | 1 per listing, 1536×1536 | `upgradeFacebookListingPhotoUrl` strips `&ctp=s261x260`. Used at ingest for §71 vision. §73 eval harness shipped; 200-row Claude run blocked on credits. |
| ~~**VINs sitting in description text**~~ | ~80/day | **Now read** — §72 action 4. Was 0% populated. |
| **GoLogin FB session** | 1 profile | `fb_buyer_10_Marcus Vance_MA`. Logged-in Marketplace sees seller profile URLs Apify does not. §74. |
| **Fly seller enrich** | 1 machine, `ord` | `tav-seller-enrich` — always-on GoLogin Cloud daemon. `fly.seller-enrich.toml`. Do not run local `--loop` on the same profile. |
| **GoLogin residential traffic** | **22 GB** pool (rami) as of 2026-09-04 top-up | Floppydata geo on `fb_buyer_10`. **12 GB exhausted ~T+23h into soak** → 503 until top-up. Check: `node scripts/gologin-assign-residential.mjs --traffic-only`. |

---

## Critical rules

### Never round MMR adjustment dollar values

Cox returns cents-precision values for odometer, build-options, grade, colour and region adjustments. Any rounding — even to the nearest dollar — diverges from Manheim's native tool and misleads buyers.

1. Forward Cox adjustment values (`adjustedBy.Odometer`, `adjustedBy.buildOptions`, `adjustedBy.Grade`) to the frontend as-is. No `Math.round`, no `toFixed`, no division by 1,000.
2. `nonZeroDelta` in `mmr-adjustment-display.ts` rounds to the nearest dollar. Acceptable only because Cox already returns whole-dollar integers — do not widen it.
3. Mileage cache keys must use the exact odometer value. **History:** a 5,000-mile bucket in `deriveVinCacheKey` / `deriveYmmCacheKey` returned `+$3,000` (cached 5,000-mile result) instead of `+$2,560` for 5,800 miles. Fixed 2026-06-20.

### Never invent odometer (item 54)

If miles are unknown, leave them unknown. No 15k/year estimator for MMR, Max buy or deal math. Omit the odometer from the Cox call, keep **Mileage unknown** on the deal, use mileage band `unknown`. Asking price is still required for Max buy. Y/M/M/S guessed from a title is fine; fake miles are not.

### Never mislead a buyer

No price is better than a wrong price. This is why blind sibling-variant retry was rejected (§72).

---

## Product principle — identity paths + always-fresh valuation

Both paths must work, and both must end in a current valuation:

1. **VIN-first** — valid VIN → Cox decode → fill Y/M/M/(S) → persist → fresh MMR + Max buy (item 48).
2. **Y/M/M/S-first** — pick catalog year/make/model/series → same fresh MMR + Max buy (item 46).

Rules:

1. After a VIN decode or Y/M/M/S save that changes valuation identity, auto-run (or clearly offer) live MMR + Max buy. A hidden "Refresh valuation" must not be the only path.
2. VIN decode must write Cox-catalog-compatible dropdown values (reuse `matchCatalogOption`). Orphan free text in a select is a failure.
3. Failed decode: keep user input, show an error, never clear YMM or wipe a prior good valuation (items 49, 50).
4. One shared identity → valuation pipeline for detail and MMR Lab.
5. Ingest identity must persist and display on detail end-to-end. Blank Cox dropdowns while the queue shows a wholesale number is a bug.

---

## Context

**TAV-AIP** — internal buyer app for Texas Auto Value. Next.js in `web/`; API is a Cloudflare Worker in `src/` (proxied via `web/app/api/app/*`).

### Identity pipeline (where the hit rate is won or lost)

| Stage | Path |
|-------|------|
| Ingest loop | `src/ingest/runIngestItemLoop.ts` |
| Retry pass | `src/ingest/coxNoDataRetryPass.ts` |
| Identity ladder | `src/valuation/resolveListingWithLLM.ts`, `src/valuation/workerClient.ts` |
| Offline matcher | `src/valuation/matchListingToCoxCatalog.ts`, `resolveListingToCatalog.ts` |
| Alias lookup / learn | `src/persistence/mmrStyleAliases.ts`, `src/valuation/learnIngestStyleAlias.ts`, `catalogAliasValidation.ts` |
| Year floor | `src/valuation/valuationEligibility.ts` |
| FB parser | `src/sources/facebook.ts`, `listingParseHygiene.ts` |
| Ineligible filter | `src/ingest/listingVehicleEligibility.ts` (hook in `runIngestItemLoop.ts`) |
| Claude prompt | `src/llm/ymmsPrompt.ts`, `src/llm/anthropicClient.ts` |
| Miss audit | `src/persistence/valuationSnapshots.ts`, `src/persistence/llmYmmsDecisions.ts` |
| Catalog sync | `src/catalog/syncCoxCatalogTree.ts`, `scripts/sync-cox-catalog.mjs` |
| Proven-bookable gate | `src/valuation/provenBookable.ts`, `src/persistence/coxProvenBookable.ts`, `resolveLastResortCatalogPick` in `workerClient.ts` |
| Seller enrich (GoLogin) | `scripts/enrich-facebook-sellers.mjs` (Fly: `Dockerfile.enrich`, `fly.seller-enrich.toml`) |

### App surfaces

| Area | Path |
|------|------|
| Opportunities page | `web/app/(app)/opportunities/page.tsx` |
| Queue client / tabs / table | `_components/opportunities-client-new.tsx`, `-queue-tabs.tsx`, `-table-new.tsx` |
| Detail client | `_components/opportunity-detail-client-new.tsx` |
| Valuation block | `_components/opportunity-valuation-block.tsx` |
| Worker list + view rules | `src/persistence/opportunities.ts` |
| API routes | `src/app/routes.ts` |
| Web CI rule | `.cursor/rules/web-ci-react-effects.mdc` (lint + typecheck before push) |

### Verify after each item

```bash
cd web && npm run lint && npm run typecheck && npm test
cd .. && npm run lint && npm run typecheck && npm test
```

Suite is **1537+ tests** (1 known fail in `opportunityWorkflow.test.ts` as of 2026-09-03; enrich queue tests green).

---

## Open items

| # | Item | Priority | Status |
|---|------|----------|--------|
| **72** | **Y/M/M/S completeness = MMR hit rate** — the main goal | **Critical** | [~] Claude-offline **79.0%** deduped (~10d soak closed). Actions 7–9 **shipped** `6bcd175b`. **Next:** credits → §73 vision |
| **73** | **Vision identity (photos)** — eval first | **Critical** | [~] sample-only **green 2026-09-04** (575 pool / 200 sample); 200-row Claude run **blocked on Anthropic 401** |
| **71** | **AI dealer detection (pre-ingest)** | **High** | [~] live with photos, `SELLER_CLASSIFY_ENABLED=true` |
| **74** | **Seller identity via GoLogin / logged-in FB** — unblocks §69 | **High** | [~] Soak **T+23h**; ~2k URLs enriched; **1× proxy exhaustion recovered** (22 GB pool). ~25h left. Action 6 after soak. |
| **69** | **Dealer seller blacklist** | **High** | [~] ingest + views hide blocked keys **and** empty-seller Facebook (**live** `2b262630`). Fly attaches URLs. Vendor `extraListingData.seller` still `{}`. |
| **68** | **Ingest throughput + fast validation playbook** | **High** | [~] stuck `running` rows **cleared 2026-09-03** (131 → 0); watch for recurrence |
| **59** | **Max buy / YMMS linkage at ingest** — shipped, soak ongoing | **High** | [~] |
| **62** | **Listing mirror on detail** — 1536px photo + seller profile link | **Medium** | [~] seller URL + full-res photo in UI 2026-09-02; **multi-photo closed** — vendor cannot provide gallery (2026-09-04) |
| **51** | **Expand workflow statuses** — blocked on buyer checklist | **Medium** | [~] |
| **67** | **Craigslist scheduled ingest** — deprioritized | **Low** | [~] |

Shipped and closed items are archived at the bottom.

---

## 72 — Y/M/M/S completeness = MMR hit rate

**Status:** [~] Proven-bookable gate live. Hit **90.0%** post-gate with Claude (2026-08-15); **79.0%** Claude-offline deduped after proven-aware soak (~10d, closed 2026-09-03). Parser hygiene **soaked**. 2012 tree **in**. Proven-aware last-resort **live**. **Soak closed** — npb flat at 4.8%; ceiling without credits is ~79–80%. **Actions 7–9 shipped** production `6bcd175b` 2026-09-03. **Open:** Anthropic credits, §73 vision.

### Deploys

| Commit | What | Production |
|--------|------|------------|
| `1b75ab3` | Year floor + first (inline) retry | `c7a3341a` |
| `bea3556` | Workers Logs enabled | `e1242be2` |
| `31e1724` | Retry moved out of the batch | `e779a844` |
| _(uncommitted)_ | Punctuation-insensitive make match + VIN from listing text | `cada5ef3` (staging `bc5c386d`), 2026-08-13 18:08Z |
| _(uncommitted)_ | Canonicalize Claude's pick to catalog tokens | `cbdaab78` (staging `c1a331c5`), 2026-08-13 19:57Z |
| _(uncommitted)_ | Never abstain while the catalog is loaded | `d79ce76b` (staging `cd29f3d7`), 2026-08-13 20:20Z |
| _(uncommitted)_ | Alias key includes drivetrain / engine / cab | `b9ac8069` (staging `4b77113c`), 2026-08-14 13:33Z |
| _(uncommitted)_ | Dealer filter + listing photo to Haiku | `b0973f27` (staging `1bb8e1bb`), 2026-08-14 ~14:30Z |
| _(uncommitted)_ | Proven-bookable gate (last-resort + listing-text) | `a15e2588` (staging `30a668c1`), 2026-08-14 16:18Z |
| _(uncommitted)_ | Parser hygiene + ineligible filter (action 6) | `8f4f468f` (staging `e382e205`), 2026-08-19 ~16:00Z |
| _(uncommitted → prod 2026-09-03)_ | §74 view filter + §72 bundle + seller ingest lookup | `2b262630` |
| _(uncommitted → prod 2026-09-03)_ | §72 action 7 — alias retirement after successful retry hit (`retireAliasAfterSuccessfulNoDataRetry`) | `1f04dd9a` |
| _(uncommitted → prod 2026-09-03)_ | §72 action 8 — rate-limit retry pass (`mmrRateLimitRetryPass.ts`) | `6bcd175b` |
| _(uncommitted → prod 2026-09-03)_ | §72 action 9 — F-series trim+axis alias resolver (`fSeriesTrimAxisAliases.ts`) | `6bcd175b` |
| `31d861b` | Git catch-up — full §72/§71/§74 local diff + docs | `origin/main` 2026-09-04 |

**Note:** Rows marked _(uncommitted)_ through `78f79974` were deployed incrementally through Aug 2026; **`2b262630`** rolled the full local diff 2026-09-03; **`1f04dd9a`** added action 7; **`6bcd175b`** added actions 8–9 same day. **Git synced** commit `31d861b` pushed 2026-09-04.

**Pre-deploy baseline for `cada5ef3`** (2026-08-13 18:05Z): BMW **1.7%** hit / 463 attempts (24h) and **4.5%** / 110 (3h); overall **73.7%** (3h, 2,897 attempts); `normalized_listings.vin` populated on **0** listings.

> **Staging could not validate either change.** Apify webhooks point at production, so staging receives no listings, and signing a synthetic `POST /ingest` needs `WEBHOOK_HMAC_SECRET` — a Cloudflare secret that cannot be read back (`.dev.vars` holds `replace_me`). Same wall as the `--verify-mmr` decision. Staging proved the bundle builds, deploys and runs; correctness was verified at the data layer instead (live catalog query for the make pattern, 133 real VINs through the module).

### Ordered actions

**1. ~~Stop abstaining~~ — SHIPPED 2026-08-13 (`d79ce76b`), with part of action 2.**

Investigation found **three** separate places a usable answer was discarded, not one:

| Discarded | Why it was wrong |
|-----------|------------------|
| Offline matcher candidates scoring < 60, or tied | They are **real catalog rows**, already ranked. They were kept only to populate the detail-page suggestions UI and never used for the lookup. |
| `llm_needs_review` picks (~1,787/day, 14% of decisions) | These **already passed** the deterministic catalog gate — they are valid Cox rows. Only Claude's self-reported confidence was low, and we threw the pick away entirely. |
| Nothing resolved → `sendModel`/`sendTrim` fell back to **raw listing text** | This is how `ford / super duty / xl` and `bmw / 2 series / Performance` reached Manheim as if they were catalog tokens (action 2). |

`resolveLastResortCatalogPick` (in `workerClient.ts`) now supplies the best real catalog row when the ladder will not commit: a canonical `llm_needs_review` pick first, else the top offline suggestion. Action 2 then keeps only candidates that have already booked. Raw listing trim dropped from second choice to last, and is refused when it has never booked (`not_proven_bookable`). Ingest only abstains when the catalog offers **no** candidate at all (or none that have booked).

Every last-resort pick sets `lookupTrimEstimated`, which already drives `confidence: "low"` and `normalizationConfidence: "partial"` — so the queue badges it as an estimated style rather than presenting a guess as fact. Logged as `ingest.mmr_last_resort_catalog_pick` with `source`, so the two paths can be measured separately.

**Accepted trade-off:** on a genuine coin flip (CR-V AWD vs FWD with no drivetrain evidence) we now return a flagged estimate instead of nothing. Per §72 action 9 — a closer who spots a difference can correct it, and the detail-page Apply button already exists.

**Measured:** last-resort drove `model_variant_missing` to 0% and hit to 88.1%. The gate then skipped unbookable last-resort guesses, so mvm is **1.6%** and hit **90.0%**. Partial of hits is still high (89.1%). `trim_missing` leftover is mostly 2012.

**Rollback:** redeploy `cbdaab78`.

**2. ~~Validate the model token before calling Manheim~~ — GATE SHIPPED 2026-08-14 (evening). 2012 tree synced 2026-08-15.**

Raw listing text can no longer pre-empt a catalog row. **2011 tree synced** (2,531 rows, 2026-08-14 06:09Z). **2012 tree synced** (2,554 rows, cron 2026-08-15 06:00Z) — Cox 404 cleared. Proven-bookable-as-2012-candidate-list workaround **not needed**.

**Proven-bookable gate (the remainder of this action).** `tav.cox_proven_bookable` is stronger than the catalog tree: a tree row means Cox lists the style, a row here means Manheim returned money. Seeded by migration `0071` from successful `valuation_snapshots` (10,939 combos at deploy, **11,599** as of 2026-08-15, including **314 for 2012**). Grows on every hit via `recordProvenBookableHit` in `writeValuationSnapshot`.

| Path | Gate |
|------|------|
| Last-resort (`llm_needs_review` canonical, then ranked suggestions) | Must squash-match a booked combo. Unbookable candidates are skipped, not sent. Cox's booked spelling wins. |
| Listing-text fallback (`x5 / Performance`, `🩷 gmc`, `Short Bed`) | Miss `not_proven_bookable` — no Manheim call. |
| Catalog-valid ladder hit (`alias_hit` / `offline_hit` / `llm_hit` / matcher style) | Still sent so the set can grow. A squash match rewrites to booked spelling (`bmw` → `B M W`). |
| Load failure or empty allowlist for that year+make | Fail open — last-resort unconstrained, same as before the gate. |

Punctuation-insensitive make load matches `loadCoxCatalogTreeForMake` (`bmw` → `B M W`). **Not** blind sibling retry: rank is preserved; only already-ranked candidates that have booked are kept.

Files: `src/valuation/provenBookable.ts`, `src/persistence/coxProvenBookable.ts`, `resolveLastResortCatalogPick` + send path in `workerClient.ts`, migration `0071_cox_proven_bookable.sql`. Logged as `ingest.mmr_not_proven_bookable` and `ingest.proven_bookable_load_failed` / `_record_failed`.

**Measured 2026-08-15 ~13:00Z (~21h, 12,190 attempts):** hit **90.0%**; `not_proven_bookable` **1.2%** (151 — `f-250 / Regular Cab`, `x3 sdrive30i / sport`, `i8 / Sport`, `bler 400`); `cox_no_data` **5.2%** (catalog-valid first-time styles, not listing words); `model_variant_missing` **1.6%** (last-resort skipped unbookable catalog guesses). No regression vs the 88% last-resort window.

**Proven-aware last-resort ranking — LIVE 2026-08-24** (`78f79974` / staging `7136a656`). `resolveLastResortCatalogPick` no longer walks the whole suggestion list. With the allowlist loaded it only considers suggestions within **10 score points** of the top one (`LAST_RESORT_CLOSE_SCORE_DELTA`). If the listing still names a trim (`XLT` / `Lariat` / `Platinum`), it picks the booked style in that window that contains those tokens — not a close sibling with a different trim. `LT` is not a hit inside `XLT` (token match, not substring). Far-behind booked siblings are skipped (the blind retry we rejected).

Send path: when the ladder did not commit and last-resort has no booked catalog row, leftover listing words are **not** sent to Cox — miss `not_proven_bookable` instead. Fail-open unchanged when the allowlist is empty. `AUTO_LOOKUP_MIN` stays **80**.

Files: `resolveLastResortCatalogPick` + send path in `workerClient.ts`, `catalogStyleContainsListingTrim` in `provenBookable.ts`. Tests in `resolveLastResortCatalogPick.test.ts`, `provenBookable.test.ts`, `valuation.workerClient.test.ts` (88 green on that slice).

**Soak — DONE 2026-09-03.** Window `fetched_at >= '2026-08-24 19:00:00+00'` (production `78f79974`), ~10 days, **28,042** deduped listings. Hit **79.0%** (stable ~79–80% daily; last 24h **79.8%**). `not_proven_bookable` **4.8%** — flat vs pre-deploy (**4.8%** over Aug 19–24 window). First 24h post-deploy **76.4%** hit / **5.6%** npb (no improvement vs action-6 **81.4%** / **5.4%**). F-series listing-word trims still top npb (`ford/f-150/xlt` 173, `lariat` 117, …). F-150 cohort improved **43.6% → 51.7%** hit but npb residue remains structural. **`llm_unavailable` 7.3%** — now the largest single drag; naive ceiling **~86%** if Claude returns. **Verdict:** deploy is working as designed (gates listing words, does not recover them). Do not keep soaking. Rollback only if regressions appear: `wrangler rollback --env production 8f4f468f-74c4-425c-bdd7-b6c7932fc4f9`; no schema change.

**Rollback:** undeploy the Worker change; the table can stay.

**3. ~~BMW vocabulary map~~ — SHIPPED 2026-08-13, measured 2026-08-14 (BMW 83.8%).**
Fixed generically rather than as a `bmw` special case, because the same gap affects `AM GENERAL`, `MV-1`, `ROLLS-ROYCE` and `MERCEDES-BENZ`: catalog matching is now **punctuation-insensitive** as a last tier.

- `squashCatalogToken` in `matchCatalogOption.ts` drops everything that is not a letter or digit; `matchCatalogOption` tries exact → whitespace-collapsed → squashed. Fixes the live catalog cascade, which previously could not match `bmw` to `B M W` at all (`pickCatalogOptionFuzzy`'s contains-tier fails in both directions on those strings).
- `loadCoxCatalogTreeForMake` retries with an interleaved `ilike` pattern (`b%m%w`) when the exact lookup returns nothing, then **verifies squashed equality in code** — the pattern only narrows the scan, so a loose pattern cannot yield a wrong make. Only runs on the miss path.
- **Verified safe:** no two makes in the catalog collapse to the same squashed value. Against production, `b%m%w` on 2018 returns `B M W` and nothing else.
- **No model folding needed.** Cox has no individual BMW nameplates (2018 is exactly `2/3/4/5/6/7 SERIES`, `I SERIES`, `M SERIES`, `X SERIES`), but once the subtree loads, the style strings carry the nameplate (`4D SUV X3 XDRIVE30I`), so Claude picks it as a style choice. Subtree is 113–210 rows/year — no pruning required.
- 13 new tests; suite 1,380 green; lint and typecheck clean.

**Watch:** whether the offline matcher starts auto-picking BMW styles too confidently — the nameplate token appears in many sibling styles (`X3 XDRIVE30I` vs `X3 SDRIVE30I`), exactly the near-miss `AUTO_LOOKUP_MIN` is supposed to catch.

**3b. The make fix exposed a second bug — SHIPPED same day (`cbdaab78`).**

Post-deploy, `lookup_make` was populated with `B M W` for the first time (it had been **100% null**), so the fix worked. But BMW only moved 1.7% → 6.7%, and the reason was visible immediately: BMW produced **zero** `llm_ymms_decisions` rows before the deploy and **12 after — all `llm_invalid_pick`**, against a correctly-loaded 182-row catalog.

Every proposal named `proposed_make: "bmw"`. Claude echoes the make it was asked about, not the catalog's spelling. `isValidCoxPick` compared makes with exact string equality, so a **0.97-confidence `X SERIES` / `X5 4D SUV M50I`** — correct model, correct style — was discarded on the make alone. And even had it passed, `resolveListingWithLLM` returned `proposal.make`, so `bmw` would have gone to Manheim and failed there instead.

`isValidCoxPick` is now `findCoxPickRow`, which returns the matched row so the resolver forwards **Cox's tokens, not Claude's**. Punctuation-insensitive matching is a fallback tier and only when it identifies exactly one row — an ambiguous squashed match must never choose between sibling styles.

**First 10 minutes after deploy:** BMW `llm_hit` 0 → 2, `llm_invalid_pick` 12-of-12 → 2, MMR **3 hits of 4 attempts**. Small sample; see the reading below.

**General lesson:** any catalog whose vocabulary differs from ours will fail this way silently. The pick was right and we threw it away.

**4. ~~Read the VIN we already have~~ — SHIPPED 2026-08-13, live; 97 of 2,402 new listings after 20:20Z had a VIN.**
~80 listings/day carry a full 17-character VIN in the description while `normalized_listings.vin` sat at **0% populated** — both adapters only read a structured `vin` field that neither Facebook nor Craigslist ever sends. A VIN is the only identity source that is never a guess: `workerClient` routes it to `/mmr/vin`, skipping normalization, the catalog cascade and Claude entirely, and it is already exempt from the year floor.

New `src/sources/extractVinFromText.ts`, wired into both adapters. Because a wrong VIN prices a **different car** — the one outcome worse than no price — a candidate must clear three gates:

| Gate | Effect |
|------|--------|
| ISO 3779 charset, 17 chars, not adjoined by other alphanumerics | Excludes I/O/Q; stops a stock number yielding a false 17-char window |
| **NHTSA check digit** (position 9) | Mandatory on all North American vehicles since 1981; rejects ~10 of every 11 random strings |
| **Model year agreement** (position 10 vs listing year, ±1) | Catches a VIN quoted for a different vehicle |

Text containing **two different** valid VINs is discarded rather than guessed at — that is a multi-vehicle post, and picking one is a coin flip.

**Measured against 133 real production VINs:** all 133 passed the check digit (which also confirms the transliteration table), 131 were accepted, and both rejections were genuine mismatches — including `JTDJTUD39DD550142`, which appears on both a 2013 Yaris listing and a "2016" one. **98.5% acceptance, and the 1.5% lost were the ambiguous cases.**

Structured fields still win when a source provides one, since those were not inferred. 19 new tests using real VINs as fixtures.

**Watch:** `normalized_listings.vin` populated (97 of 2,402 new listings after 20:20Z). VIN-path hits in `valuation_snapshots`.

**5. ~~Feed drivetrain/engine/cab evidence into identity~~ — SHIPPED 2026-08-14 (`b9ac8069`).**
Alias key is no longer `make|model|trim` alone. `listingAxisEvidence.ts` extracts drivetrain / engine / cab from title+trim+description (canonical tokens, diesel wins, 4wd+2wd omitted). Lookup uses **only** axis-qualified keys when axes are present — no fallback to the short key. Learn and `cox_no_data` alias retirement use the same key list. Example: `FORD F150 XLT 2017 4x4 V6` → `ford|f-150|xlt|4wd|v6`.

**6. ~~Parser hygiene + ineligible filter~~ — SHIPPED 2026-08-19 (`8f4f468f` / staging `e382e205`). Soak.**

Stops feeding listing garbage into Claude offline mode (alias → matcher → last-resort).

| Fix | Effect |
|-----|--------|
| Skip year + repeated make in model | `2018 mazda` / `2020 chevy` no longer become `lookup_model` |
| Cab/bed is axis evidence, not Cox trim | `F-150 SuperCrew XLT` → model `f-150`, trim `xlt`. `extractTitleTrim` no longer returns SuperCrew / Crew Cab / Short Bed |
| Split glued trim / displacement | `cruze lt`, `altima 2.5` |
| Collapse duplicate tokens | `tauro tauro` → `tauro`; emoji-duplicated make → `missing_ymm` |
| Ineligible filter (model-level) | Motorcycles/scooters (K1600, SCL500, PCX, …) and commercial chassis (F-550/650/750, Ram 5500) → `writeFilteredOut(reason_code: "ineligible_vehicle")` before dealer classify / Y/M/M/S. F-150 and F-450 stay in. |

Files: `src/sources/listingParseHygiene.ts`, `src/ingest/listingVehicleEligibility.ts`, hook in `runIngestItemLoop.ts` (after salvage, before blocked seller). Prefetch skip in `llmYmmsPrefetchInputs.ts`. Log `ingest.ineligible_vehicle_blocked`.

**Watch / soak (action 6).** Window: `fetched_at >= '2026-08-19 15:56:00+00'` (production `8f4f468f`). Do not compare to the 90% Claude-on number.

**T0 (~16:01Z, n tiny):** 30 snapshots, **73.3%** hit (22). `ineligible_vehicle` 1 (`f550`).

**T+1h (17:25Z, 797 snapshots):** hit **80.6%**. Year-in-model **0**, cab-only trim **0**. `ineligible_vehicle` 8.

**T+24h (2026-08-20 15:56Z, 9,241 snapshots):** hit **81.4%** (7,525). `not_proven_bookable` 501 (**5.4%** of attempts, was 7.2% pre-deploy). Year-in-model **0**, cab-only trim **0**, ineligible tokens in snapshots **0**. `ineligible_vehicle` **51**. `cox_no_data` 428, `llm_unavailable` 333, `trim_missing` 290. Source runs: 485 completed, 11 truncated, 6 running. VIN on 138 of 3,254 new listings. **Hygiene soak passed.** Remaining npb is listing-word trims (`f-150 / Platinum` 70, `xlt` 43, `Lariat` 40). Proven-aware last-resort **soaked** `78f79974` 2026-08-24 → **closed 2026-09-03** (see top-of-doc reading).

**7. ~~Alias retirement ordering~~ — SHIPPED 2026-09-03 (production `1f04dd9a`).**
`retryMmrAfterCoxNoData` in `workerClient.ts` previously deleted the alias *before* Claude re-asked. **`retireAliasAfterSuccessfulNoDataRetry`** now runs only after `getMmrLookupOutcome` returns a **hit** on the corrected pick. Same pick, Claude unavailable, or second `cox_no_data` → alias kept. Tests: `test/valuation.mmrNoDataRetry.test.ts` (9 green).

**8. ~~Rate-limit retry queue~~ — SHIPPED 2026-09-03 (production `6bcd175b`).**
`src/ingest/mmrRateLimitRetryPass.ts`. On `cox_rate_limited`, ingest queues the listing with its precomputed `llmResolution`; post-loop `waitUntil` re-calls `getMmrLookupOutcome` only (no Claude re-ask). **2s stagger** between retries, cap **10**/slice. Logs: `ingest.mmr_rate_limit_retry_pass`, `valuation.recovered_after_rate_limit`, `ingest.mmr_rate_limit_retry_skipped`. Tests: `test/mmrRateLimitRetryPass.test.ts`.

**9. ~~F-series trim/axis aliases~~ — SHIPPED 2026-09-03 (production `6bcd175b`).**
`src/valuation/fSeriesTrimAxisAliases.ts` + `resolveListingWithLLM.ts`. When axis-qualified alias keys miss (§72 action 5 — no fallback to short `make|model|trim`), resolves a **booked** Cox model+style for Ford F-150/F-250/F-350/F-450 from catalog + `cox_proven_bookable` using listing trim token + axis evidence (4wd/v6/crew, etc.). Returns `alias_hit`. Log: `llm_ymms.f_series_trim_axis_alias`. Tests: `test/fSeriesTrimAxisAliases.test.ts`. **Remaining ambiguity** (no axis evidence, flex-fuel splits) still §73 vision or detail Apply button — see decision 2026-08-13 below.

### What shipped

**Phase 0 — year floor (commit `1b75ab3`).** `VALUATION_MIN_YEAR = 2011` in `src/valuation/valuationEligibility.ts` mirrors `SCRAPER_REVIEW_MIN_YEAR`, so we value exactly what Unprocessed Leads shows. No-VIN listings below it short-circuit before the catalog cascade and the Manheim call with miss reason `year_below_valuation_floor`; VIN listings are exempt. A drift test asserts the two floors stay equal. **Confirmed firing in production from 15:00Z.**

> **Catalog years:** `cox_catalog_tree` has **2011** (2,531 rows) and **2012** (2,554 rows, cron 2026-08-15 06:00Z). Floor is `COX_CATALOG_MIN_YEAR = 2011`.

**Phase 1 — `cox_no_data` retry (commit `31e1724`).** On a `cox_no_data` miss from the Y/M/M path, ingest retires the alias behind the pick (when the resolution was `alias_hit`), re-asks Claude with `skipShortcuts` and the rejected model/style named in the prompt, and re-prices once. Recovered picks are marked `confidence: "low"` / `normalizationConfidence: "partial"` and are deliberately **not** fed back into alias learning.

> ### ⚠ The retry must not run inside the ingest item loop
>
> The first cut ran inline and **never fired in production.** It required 10s of remaining batch budget, but ingest already spends its full `BATCH_TIMEOUT_MS` (23.5s effective) on 7 listings and truncates. Every candidate was rejected with `reason: batch_deadline` — including a 2012 Charger being priced as a police interceptor, exactly the failure the retry exists to fix. **Anything added to the per-item path competes with a budget that is already exhausted.** It now runs post-loop via `execCtx.waitUntil`.

| Guard | Behaviour |
|-------|-----------|
| Placement | Post-loop `waitUntil` — no batch-deadline competition |
| Cap | `MAX_RETRIES_PER_SLICE = 10` per slice |
| Claude repeats the pick | No Manheim call (`reason: same_pick`) |
| Claude unavailable | No Manheim call |
| Retry also has no book | Original miss stands |
| Alias learning | Suppressed via `skipAliasLearning` |
| Prompt caching | Rejected pick goes in the per-listing evidence block, never the cached catalog prefix (item 66 still hits) |

Recovered listings append a hit snapshot; `buildListingDiagnostics` keeps the newest `fetched_at` per listing, so the hit supersedes the miss with both kept for audit. Max buy is scheduled for recovered listings (item 59 parity).

Logs: `ingest.mmr_no_data_retry`, `valuation.recovered_after_no_data`, `ingest.cox_no_data_retry_pass`, `ingest.mmr_alias_retired_after_no_data`, `ingest.mmr_no_data_retry_skipped`.

**Result:** the retry works — 22 listings recovered in 2h, 14 on a genuinely different Cox pick, worth ~+1.4 pts. `lookup_model` is now populated on 100% of `cox_no_data` misses (verified 111/111 and 108/108 in consecutive hours), so all are retry-eligible. But it only addresses the ~10% bucket, and only where the model token was right to begin with — which is 18% of the time.

**Rejected: blind sibling-variant retry.** Walking the catalog for models sharing a style is cheap and needs no Claude call, but siblings include genuinely different vehicles (`YUKON` vs `YUKON XL`, `2500HD SIERRA` vs `3500 SIERRA`) and different powertrains. "First variant Manheim books" can return a **wrong price** — worse than no price. Data supports the rejection: only 20% of failing listings have a bookable sibling style under the same model.

**Observability.** `[observability]` was not enabled on this Worker — every structured `log()` was written to nowhere. Added to top level **and both envs** in `wrangler.toml` (`bea3556`). **Environments do not inherit it**, same as `[vars]`.

### Known audit gap

`llm_ymms_decisions.normalized_listing_id` is **null on historical rows**. **Fixed 2026-08-28:** ingest passes `normResult.id` into `getMmrLookupOutcome` / retry (`MmrLookupOutcomeOpts.normalizedListingId`). `insertLlmYmmsDecision` already had the column; callers were omitting it. MMR Lab / VIN-only lookups still write null. Lives on the next Worker deploy.

### Exit criteria

- [x] Year floor aligned to `SCRAPER_REVIEW_MIN_YEAR`; confirmed firing in production
- [x] `alias_hit` + `cox_no_data` triggers retry; `lookup_*` persisted on all miss snapshots
- [x] `cox_catalog_tree` synced for **2011** and **2012** (2,554 rows, 2026-08-15)
- [x] Ladder never abstains when a catalog tree is loaded — **measured: `model_variant_missing` 0%, hit 88.1%** after `d79ce76b`; post-gate mvm is 1.6% (unbookable last-resort skipped)
- [x] Proven-bookable gate — last-resort + listing-text must match `tav.cox_proven_bookable` (**12,517** rows as of 2026-08-19, migration `0071`); catalog-valid first-time combos still sent so the set grows. **Live** production `a15e2588` / staging `30a668c1` (2026-08-14 16:18Z). **Measured ~21h: hit 90.0%, `not_proven_bookable` 1.2%, `cox_no_data` 5.2%.**
- [x] Punctuation-insensitive make matching (BMW **83.8%** with Claude; **42.2%** while credits are out)
- [x] VIN recovered from listing text, check-digit and model-year gated
- [x] Alias key includes drivetrain / engine / cab (`b9ac8069`)
- [x] Parser hygiene + ineligible filter (action 6) — production `8f4f468f` / staging `e382e205` (2026-08-19). **Soaked ~24h 2026-08-20:** year-in-model 0, cab-only trim 0, `ineligible_vehicle` 51.
- [x] Proven-aware last-resort ranking — close-score booked pick; leftover listing words not sent. **Live** production `78f79974` / staging `7136a656` (2026-08-24 19:00Z). `AUTO_LOOKUP_MIN` still 80. **Soaked ~10d 2026-09-03:** npb flat **4.8%**, hit **79.0%** deduped — deploy correct, F-series npb not materially reduced.
- [x] `llm_ymms_decisions` links to `normalized_listing_id` — callers pass listing id (2026-08-28). Historical rows stay null.
- [~] MMR hit **≥ 85%** on eligible inventory — **90.0%** post-gate with Claude (2026-08-15). Claude-offline: **79.0%** deduped after proven-aware soak (2026-09-03). **`llm_unavailable` alone is ~7 pts** — credits + §73 vision are the path to exit, not more last-resort soak.

---

## 73 — Vision identity from listing photos

**Opened:** 2026-08-13 · **Status:** [~] photo URL upgrade shipped with §71; **eval harness shipped** 2026-08-28; **sample-only green 2026-09-04**; 200-row Claude run **still blocked — Anthropic 401**

**Why:** some listings genuinely do not state drivetrain, engine or cab configuration. No amount of text engineering extracts information that isn't there. A person looking at the photo can tell. The model should too.

### The unblock — full-resolution photos are already available

`primaryImage` URLs end with `&ctp=s261x260`, which is the **crop instruction, not the image**. Remove it and the same signed URL returns the same photo at **1536×1536 (~265 KB)**. No auth, no extra request to Facebook, signature stays valid. Verified 2026-08-13 against a live listing — sharp enough to read badges, count doors and judge wheels and trim.

`ctp=s1536x1536` also works. Removing `stp=` as well **breaks** the signature (HTTP 400). Links expire roughly 5 days out (`oe=` parameter), so photos must be captured, not referenced.

### The remaining vendor blocker — gallery is null (**closed 2026-09-04**)

The actor has a dedicated option, `fetchListingMedia` ("Fetch Listing Photos & Videos"), documented to populate `extraListingMedia` with `listing_photos` — every image URI with dimensions and alt text.

**It is enabled on the task, and the field is `null` on every item.** Verified in Apify's own dataset (run `qH8uOovx7wNvJXBGh`), not our stored copy, so this is not our ingest dropping it. We pay for the extra proxy request per listing and get nothing.

**Vendor response 2026-09-04:** they **cannot provide multi pictures**. Do not wait on gallery / `extraListingMedia`. §73 and §71 use the **single upgraded `primaryImage`** (1536×1536). §62 multi-photo gallery is **out of scope** for this actor.

That is now the **third** instance of the same pattern from this vendor:

| Field | State | Impact |
|-------|-------|--------|
| `extraListingData.seller` | `{}` on 13,652 / 13,678 payloads | §69 dead — still worth asking separately |
| `extraListingData.images` | `[]` on all payloads | — |
| `extraListingMedia` | `null` on all payloads, **flag enabled** | **Closed** — vendor won't fill; 1 photo only |

### Design principle

**Do not ask "what car is this."** Give the model the legal Cox styles for that `(year, make, model)` plus the photo and ask it to **eliminate**. That constrains it to answers Cox actually sells, turns identification into a much easier elimination task, and plugs straight into the §72 candidate-ranking posture.

**Sequencing matters:** vision on top of a broken candidate list produces a better-informed wrong answer. §72 actions 1–2 come first.

### Bonus — dealer detection (shipped separately as §71)

The sample photo is unmistakably a dealer lot. §71 now sends that photo to Haiku at ingest (not folded into the YMMS vision call). §73 eval can still add seller type as a free field later.

### Eval (do this before building anything)

**Question:** can a full-res photo + the legal style list pick the correct style, and how much of that is the photo versus text we already have?

**Sample — 200 listings.** From the last ~3 days so image links are still live. Only listings that already produced a confirmed MMR hit, so ground truth exists in the stored `lookup_make/model/trim`. Stratified: roughly half random, half from the hard cohort (F-150, Silverado, Sierra, Ram, Tacoma, Yukon — where Cox splits by cab and engine).

**Method.** Strip `&ctp=` for the 1536px image. Give Claude the year, make, every Cox style for that model, the listing title and description, and the photo. It picks exactly one style. Score exact match. Run the identical prompt **without** the photo as the control arm.

**Output.** Text-only vs photo accuracy, overall and on the hard slice. Which axis vision fails on when it fails (engine / drivetrain / cab / trim). Token cost per listing, priced at real ingest volume.

**Guardrails.** Standalone script following the `scripts/eval-llm-ymms.mjs` pattern. No production writes, no Cox calls, no live pipeline changes. 400 Claude calls total.

**Caveat.** Ground truth only exists for listings that already succeeded, so the result flatters slightly. The hard-cohort slice offsets that.

**Open choices.** 1536px (~3k tokens/call) vs 768px (~800) — run 1536 first to find the ceiling, retest at 768 if it works. Whether the same call also returns dealer vs private party.

### Eval harness — SHIPPED 2026-08-28 (run still blocked)

`scripts/eval-ymms-vision.mjs` · `npm run eval:ymms-vision`

| Flag | What |
|------|------|
| `--sample-only` | Build the 200-row sample, no Claude |
| `--limit 200` | Default. 100 hard / 100 random. Text-only + photo arms |
| `--resume <file>` | Continue after a crash |
| `--model` | Override `LLM_YMMS_MODEL` (default `claude-sonnet-5`) |

Prompt is elimination-only: year + Cox make + legal styles for that model (nameplate family when the gold model has fewer than 2 styles). Photo arm sends the downloaded 1536px image as base64 (ctp stripped). Control arm is the identical text. Scores exact `lookup_model` + `lookup_trim`. Fail axes: engine / drivetrain / cab / trim. Incremental JSON under `scripts/_eval-results/` (gitignored).

**Sample-only 2026-08-28:** 635 recent hits with photo URLs (last 3d, pool 2,500 snapshots) → **100 hard / 100 random**. Photos download (smoke: 258 KB).

**Sample-only 2026-09-04:** **575** hits with photo URLs (last 3d, pool 2,500 snapshots) → **200-row sample** (91 hard / 109 random). Written to `scripts/_eval-results/ymms-vision-sample-2026-09-04T13-03-07-026Z.json`.

**200-row Claude run:** not started. Anthropic **credits still out** — `--limit 1` returns **401** (2026-09-04). Same wall as ingest Claude-offline (`llm_hit` 0, `llm_unavailable` in snapshots). Reload credits on the same account, then:

```bash
npm run eval:ymms-vision -- --limit 200 --concurrency 2
```

Do not wire a production vision tier until this file has a real summary (text-only vs photo, overall + hard slice).

### Then

- Persist images (R2) before the ~5-day expiry
- Run vision only on the ambiguous subset, **outside the ingest batch** via the `waitUntil` pass §72 already established
- See [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) vision tier backlog

### Exit criteria

- [x] Eval script (`scripts/eval-ymms-vision.mjs`, `npm run eval:ymms-vision`) — sample-only green 2026-08-28 and **2026-09-04**
- [ ] 200-row result documented (text-only vs photo, overall + hard slice) — **blocked on Anthropic 401**
- [x] Photo URL upgrade shipped in the adapter (`upgradeFacebookListingPhotoUrl`, ingest stores 1536px)
- [ ] Image capture to R2 before expiry
- [ ] Vision tier wired behind a flag, outside the batch, on the ambiguous subset only
- [~] Vendor — **gallery closed** (no multi-photo, 2026-09-04); `extraListingData.seller` still `{}`

---

## 71 — AI dealer listing detection (pre-ingest)

**Status:** [~] **live** 2026-08-14. Production `b0973f27`, staging `1bb8e1bb`. `SELLER_CLASSIFY_ENABLED=true` both envs (dashboard + `wrangler.toml`). Soak — watch private-party false positives.

**Goal:** detect dealership listings from listing text and photos **before** Y/M/M/S and MMR run, so first-time dealer inventory is filtered without waiting for a buyer dismiss (§69) or vendor seller fields.

**Problem:** §69 only blocks **known** sellers. Payloads lack seller fields (`extraListingData.seller` is `{}`), so the blacklist is empty. Buyers flag `dealer` on dismiss (item 47) but that is reactive.

**What shipped**

- Phase 0 heuristics on title + description + seller name. Auto-reject only `seller_type=dealer` **and** confidence ≥ 0.85. CARFAX alone is weak.
- Phase 1 Haiku when text is inconclusive **or a listing photo exists**. One upgraded 1536px HTTPS photo (`image` URL source). Slam-dunk text dealers skip Haiku. Fail open on timeout/error.
- Prompt: lot / rows of cars / windshield banners = dealer; driveway / one car on a street = private-party.
- Ingest hook after `isBlockedSeller`, before normalized upsert: `writeFilteredOut(reason_code: "dealer_listing")`, log `ingest.dealer_listing_blocked`.
- Text-only eval (`scripts/eval-seller-classification.mjs`) was **not** a go: TP=2 FP=5 FN=48 on 100 rows — labelled dealers were mostly empty text, and the "control" set included real dealer ads. Do not treat that eval as a reason to turn the flag off; vision was the missing input.
- `extraListingData.seller.name` is mapped when the vendor ever fills it.

**Still open:** seller name/URL still empty on Facebook payloads (vendor). `blocked_sellers` stays empty until those fields exist. Re-eval with photos when a labelled set is ready.

**Principle:** keep this separate from the item 57 Y/M/M/S prompt. Own prompt, tool schema, eval harness and flag. §73 can still add seller type as a free field on the identity-vision call later.

### Locked decisions

| Decision | Choice |
|----------|--------|
| Filter point | After adapter, before Y/M/M/S — same hook as `isBlockedSeller` in `runIngestItemLoop.ts` |
| Auto-reject gate | `seller_type=dealer` **and** `confidence >= 0.85`, tuned on the eval |
| Lower confidence | Ingest continues unchanged (no private-party regressions) |
| On reject | `writeFilteredOut(reason_code: "dealer_listing")` + log `ingest.dealer_listing_blocked`; upsert `blocked_sellers` when a seller key exists |
| Flag | `SELLER_CLASSIFY_ENABLED="true"` production + staging as of 2026-08-14 |
| Model tier | Haiku or cheapest sufficient |

### Original plan (implemented)

Phase 0 heuristics + Phase 1 Haiku as above. Files: `src/ingest/dealerHeuristics.ts`, `src/llm/sellerClassifyPrompt.ts`, `src/llm/sellerClassifyClient.ts`, `src/valuation/classifyListingSeller.ts`, `scripts/eval-seller-classification.mjs`; hook in `runIngestItemLoop.ts`.

Text-only eval is insufficient (empty Facebook copy). Re-run with photos + buyer-kept private-party controls before tightening the 0.85 gate.

---

## 74 — Seller identity via GoLogin / logged-in Facebook

**Status:** [~] Needs-action-only enrich **live** Fly v6 2026-09-03. View filter **live** Worker `2b262630`. **48h soak in progress** (clock **2026-09-03 ~13:56Z** → **~2026-09-05 13:56Z**). **T+23h:** ~2k `seller_url` writes; **1× residential exhaustion + recovery** (see 2026-09-04 table). Monitor: `npm run monitor:fly-soak`. **Open:** action 6 (more FB logins). **Unblocks:** §69 · **Does not replace:** §71

**Goal:** get a stable seller key (`seller_url`, else `seller_name`) onto Facebook listings we already ingest, using the GoLogin profile + Facebook account we already have, so the shipped blacklist can start matching.

**Now:** Fly **`tav-seller-enrich`** (`--write --loop --cloud`, `ord`). Default queue **`needs_action`** only — no Unprocessed / dealer queues unless `--queue` override. Worker hides Facebook on default views until `seller_url`, then `blocked_sellers`. Do **not** run local `gologin:enrich:daemon` on `fb_buyer_10`.

### Shipped 2026-08-31 / 2026-09-01 — do not re-derive

| Slice | State |
|-------|--------|
| Opportunities hide Facebook until `seller_url`, then hide if blocked | **Live** production `2b262630` (`isPendingFacebookSellerIdentity` / `isHiddenBlockedSellerOpportunity`). `flagged_leads` still shows all. |
| Excellent-lead email waits on Facebook seller URL | **Live** (`runIngestItemLoop.ts`) |
| Enrich caps / Chicago hours / 30–90s jitter | **Off by default** (`0` = unlimited). `--hours` / `--max-per-day` restore the old 25/h 40/d window. |
| Daemon queue | Default **`needs_action`** (`enrich-queues.mjs`, `matchesWouldBeNeedsAction`). Legacy `--queue unprocessed|dealer_*`. Fly **v6** 2026-09-03. |
| Always-on host | Fly app **`tav-seller-enrich`**, machine `2870647c500408`, volume `vol_4y8xoy6gdkwkk83r`. Secrets on Fly (not git). Dashboard: https://fly.io/apps/tav-seller-enrich/monitoring · health: https://tav-seller-enrich.fly.dev/ |
| Local daemon | **Stopped** so it does not share `fb_buyer_10` with Fly. |
| Proxy savings | Abort **image / media / font** on Cloud (`stripHeavyProxyAssets`). Deployed Fly 2026-09-02. |

### 2026-09-01 / 2026-09-02 — Cloud 503 was traffic, not Fly — do not re-derive

| Fact | Detail |
|------|--------|
| Symptom | Daemon picked 40 Unprocessed rows on a loop but **`seller_url` stuck at 708**. Fly machine stayed `started`. |
| Fix 1 (zombie CDP) | Cloud tab died; `page.goto` threw; extract errors were swallowed; `page.isClosed()` stayed false. Daemon re-picked the same 40 every ~2s. **Shipped:** log extract errors; abort batch on dead browser; `sessionAlive()`; 30min listing-miss cooldown; pre-launch `DELETE /browser/{id}/web`. Last real visits before this: **2026-08-31 hour 12 Chicago**. |
| Fix 1 was not enough | After relaunch, `puppeteer.connect` to `cloudbrowser.gologin.com/connect` returned **503** every ~45s. REST `DELETE /browser/{id}/web` still **204** (token + profile valid). |
| Real 503 cause (2026-09-02) | Rami **residential credit exhausted** (`trafficUsedBytes` **over** `trafficLimitBytes`, 2.03 / 2.00 GB). Profile proxy is `mode: geolocation` `geo.floppydata.com:10080` — Cloud will not start if that proxy cannot come up. Probe: connect **without** a profile → **200** `{"status":"ok"}`; connect **with** `fb_buyer_10` → **502** `X-Error-Reason: Invalid response from browser service: missing ws_url` (Puppeteer reports that as 503). Token is a **dev** JWT. Business plan was paid. |
| Top-up | **+10 GB residential** 2026-09-02. Pool **0.03 / 12 GB** at resume, unused **~11.97 GB**. Connect with profile → **200**. Fly `warmup facebook.com` then `ok wrote unprocessed …` from **12:59Z**. `seller_url` climbed (708 → 700s+ immediately). |
| GB burn | Uncapped + full listing assets ≈ **2–3 MB/listing** (~10–16h to empty 12 GB; 5-day Unprocessed ~15k would not fit). **Do not restore hourly caps** for this test. |
| Fix 2 (bytes) | Abort **image / media / font** on the Cloud page (`stripHeavyProxyAssets` in `facebook-seller-extract.mjs`). Seller extract only needs document/script/XHR. Deployed Fly **2026-09-02** (`proxy savings: aborting image/media/font`; writes still `ok`). Expect ~3–5× fewer bytes so 12 GB can cover the 5-day backlog. |
| Soak clock | **Reset 2026-09-02 ~12:59Z.** The 2026-08-31 17:13Z start is void (zombie, then 503). |
| Do not | Local Orbita on `fb_buyer_10` while Fly is up. Swap Floppydata. Treat Cloud 503 as proxy traffic exhaustion until `/users-proxies/geolocation/traffic` checked. |

### 2026-09-04 — second residential exhaustion during soak — do not re-derive

| Fact | Detail |
|------|--------|
| Soak clock | **Unchanged** — still **2026-09-03 ~13:56Z** start (needs-action redeploy). Do **not** reset on proxy top-up alone. |
| T+23h metrics | **~2,037** listings got `seller_url` since soak start; **2,623** Facebook rows with URL total; **3** new `blocked_sellers` (all `dealer`). |
| Symptom | **`npm run monitor:fly-soak` unhealthy** — 503 in logs, no recent `ok wrote`. Last DB write **~10:39Z**. Fly machine still `started`, health 200. |
| Cause | Residential **12.039 / 12 GB** (`node scripts/gologin-assign-residential.mjs --traffic-only`). Same failure mode as 2026-09-02 — GoLogin Cloud **503** retry loop, **not** checkpoint. |
| Fix | **+10 GB top-up** → pool **22 GB** (**~10.04 used, ~12 GB left** after reset accounting). Fly **self-healed ~12:56Z** — `warmup facebook.com`, `ok wrote needs_action` resumed. No `fly machine restart` needed. |
| Watch | Check residential GB daily during uncapped soak. 12 GB lasted ~23h with `stripHeavyProxyAssets`; budget **~22 GB** for remaining soak + backlog. |

### Product lock 2026-08-31 — seller identity before the card lands — **LIVE**

Buyer: when listings come in, **identify the seller, check `blocked_sellers`, and do not put that listing on the website** if they are already blocked. Opportunities / Needs action must not be the place we discover a known dealer. **No fail-open onto the sheet.**

**Live production `2b262630`** (Worker + Fly enrich, not GoLogin in ingest):

1. Resolve seller **payload name/url → stored identity on that listing URL** (payload fills gaps per field; a name-only payload keeps a stored profile URL).
2. `isBlockedSeller` prefers URL: a live profile URL that is **not** in the table is shown even if the display name matches a name key.
3. `upsertBlockedSeller` writes **both** `url:` and `name:` keys when both exist, so a later name-only listing matches.
4. Ingest `writeFilteredOut(blocked_dealer)` **before** `upsertNormalizedListing` / MMR / lead. If that listing URL already exists, stamp seller + suppress workflow to `bad_lead`.
5. Default Opportunities views (`needs_action`, `mine`, `worth_a_look`, `all`, scraper review) **hide** Facebook rows with **no seller URL** and rows whose seller is in the table. `flagged_leads` keeps them for audit. Name-only is not enough to show the card.
6. Numeric `marketplace_listing_seller.id` maps to `sellerUrl` when the vendor sends it (still usually hollow).
7. Excellent-lead email is suppressed until a Facebook seller URL exists, so buyers are not pinged about a card that is not on the sheet.

Still true:

- Worker cannot open Facebook. Ingest still upserts the listing (GoLogin needs `listing_url`). The **buyer sheet waits** until GoLogin Cloud (or the vendor) attaches a seller URL, then the blacklist check decides show vs drop.
- Name-only keys are weaker than `/marketplace/profile/{id}`. A blocked dealer can change the display name — do not admit on name alone.

**Proxy (2026-08-28 evening):** Rami US residential **attached** to `fb_buyer_10_Marcus Vance_MA`. `proxy.mode=geolocation`, host `geo.floppydata.com`. Freeze this IP.

### Product path — GoLogin is the sheet gate (uncapped test)

Worker still does not launch a browser. Facebook cards **do not appear on Opportunities** until a seller URL exists and is not blocked. Enrich on this one account is **uncapped** so we can test instant attach: no 40/day, no 25/hour, no Chicago window, no 30–90s delay. Account burn is accepted. Halt on checkpoint / login wall still stops the run.

| Layer | Job |
|-------|-----|
| **§71 at ingest** | Drops slam-dunk dealer lots (photo + text) before MMR. |
| **Needs action** | Facebook lands **after** a seller URL is attached and that key is not in `blocked_sellers`. |
| **GoLogin daemon** | **`needs_action` only** (default). Legacy `--queue unprocessed|dealer_*` for debug. Fly v6 2026-09-03. |
| **Re-scrape** | Stored `seller_url` → Worker `isBlockedSeller` with no browser. |

`--hours` restores Chicago 07–21. `--max-per-day N` / `--max-per-hour N` restore caps.

~~**Queue order today (in the script):**~~ **Obsolete 2026-09-03** — was Unprocessed → dealer dismiss → `dealer_listing`. Default is now **`needs_action`** only (`loadNeedsActionQueue`).

### Needs-action-only — **SHIPPED + DEPLOYED 2026-09-03**

Fly exists to keep **known dealers off Needs action**. Buyers work that tab. All / Worth a look / Mine / Unprocessed / dealer-dismiss / `dealer_listing` are not the product. Do not spend GB or the Facebook account on those queues.

**Needs action does not fill until Fly has checked.** Ingest still upserts the listing (Worker cannot open Facebook). The card stays off that tab until Fly attaches a `seller_url` and `blocked_sellers` is checked. Blocked → never shown. Not blocked → then it lands. The tab is the **result** of the check, not the inbox Fly works from.

**Queue — only this (live):**

Facebook listings that **would** be Needs action: active lead / near_miss with MMR / manual submission, last 24h, unassigned or expiring claim, `seller_url` IS NULL. Implemented in `loadNeedsActionQueue` + `matchesWouldBeNeedsAction` (`scripts/lib/enrich-queues.mjs`). Same skips: VIN-priced, >5 days old, Craigslist.

**Do not also visit:** Unprocessed ocean, dealer dismiss, `dealer_listing` (unless `--queue` override).

**View filter:** **live** `2b262630` — empty-seller Facebook off default views until Fly writes URL.

Pre-deploy snapshot 2026-09-02 ~15:40Z: Facebook `seller_url` **1,284**; Needs action ≈ 342 Facebook / 42 with URL (stale — expect different counts after filter + needs-action queue).

**Uncapped test (2026-08-31).** Burn on `fb_buyer_10` is accepted. If Facebook checkpoints, `--clear-halt` after a human confirms the session — or move to a backup profile. Action 6 (more Facebook logins) is how we survive a ban, not how we pace this test.

**Open — create Facebook accounts via GoLogin.** We already have ~10 empty/backup profiles. We do **not** have a repeatable way to stand up new Facebook logins inside those profiles (signup, phone/email, Marketplace access, warm the session). Need a path: GoLogin profile → US residential → Facebook account created in that browser → Marketplace buyer that survives long enough to run the enrich queue. Do not paste cookies. Do not run ten Mac fingerprints from this one Windows box in parallel. Do not build this until the current `--write` / dealer-signal path is proven; then this is how volume actually moves.

**Script vs this lock:** `loadQueue` default **`needs_action`**. Fly v6 + Worker `2b262630` both live 2026-09-03.

**10 profiles:** use **one at a time** (`fb_buyer_10_Marcus Vance_MA`). The rest are backups. Do not run them in parallel on this Windows box (ten “Mac” fingerprints from one host). Add a second profile only after ~48h with no checkpoint, different fingerprint + sticky proxy, **not** overlapping the first.

**No like/scroll bot.** Automated likes are an inauthentic-behavior tripwire. Extra Puppeteer scrolling is more bot traffic.

### Anti-ban procedures (locked)

What gets accounts flagged here is **volume + mechanical Marketplace clicks + IP/fingerprint mismatch**, not “looking at a listing.” Keep the session looking like one buyer on one computer.

**Do**

1. **One GoLogin profile, one tab.** `fb_buyer_10_Marcus Vance_MA` only. Proxy stays the one already on that profile — never rotate it under this login **except** the one-time replacement below (Bright Data is dead). Do not run the other ~10 Facebook accounts in parallel; that burns the whole pool.
2. **GoLogin Cloud for batch** (2026-08-31). Local Orbita still works; cloud probe **2/2** + dismiss `--write` (Passat) with Floppydata on the profile. Do not `GL.exit()` after cloud — `DELETE /browser/{id}/web`. Do not run local Orbita and cloud on the same profile at once.
3. **Warm up on facebook.com** before the first listing. If that page is a login wall or checkpoint, **stop the run**. Do not keep opening Marketplace URLs.
4. **Hard halt.** Checkpoint or login wall latches `scripts/.enrich-run-state.json`. Later runs refuse until a human confirms the session in GoLogin and passes `--clear-halt`.
5. **Caps.** **Off for this test.** 0/hour 0/day. `--max-per-day` / `--max-per-hour` restore. `--hours` restores Chicago 07:00–21:00. Delay between listings is 0.
6. **Click less.** If the listing already has `/marketplace/profile/{id}`, do not click Seller details. Never `goto` the seller profile. Never message, friend, or follow.
7. **Mouse click, not `element.click()`.** JS clicks are `isTrusted: false`. Dwell 3.5–8s after the listing loads.

**Do not**

- Paste cookies into Apify or any logged-out scraper.
- Swap stealth stacks (undetected-chromedriver, random Chrome).
- Intercept GraphQL from a logged-out session. If we ever read a payload, it is only inside this same logged-in Orbita tab after a real navigation.
- Keep going after a checkpoint “to finish the queue.”
- Run the other Facebook accounts in parallel, or add a feed-scroll / like bot.
- Show a Facebook card on default Opportunities views without a seller URL. Unknown seller = off the sheet until GoLogin (or the vendor) attaches one, then check `blocked_sellers`.

**Known risk:** this profile is a **Mac** fingerprint on a **Windows** box. It worked for n=2. If Facebook checkpoints, move the job to a Mac or a Windows-fingerprint profile — do not keep hammering.

### Why this, and why not the ingest loop

Marketplace shows seller name + profile link to a **logged-in** session. The Apify actor is not that session — `extraListingData.seller` is `{}`. We already store `listing_url` on every row. Opening that URL in the existing GoLogin Facebook session is enough to read the seller.

This is **enrichment**, not ingest:

| Constraint | Why |
|------------|-----|
| Not inside `runIngestItemLoop` | Same wall as the first `cox_no_data` retry. The batch already spends `BATCH_TIMEOUT_MS`. A headed browser cannot run on the Cloudflare Worker anyway (GoLogin Orbita is a local/cloud browser; the Worker has no Chrome). |
| Not every listing | ~3–4k new listings/day. Driving all of them through one Facebook account burns it. §71 already drops obvious dealer *listings* without a seller key (~3.3k `dealer_listing` / 24h). |
| Do not auto-blacklist every enriched seller | Private-party sellers must stay off `blocked_sellers`. Enrichment writes identity onto the listing. The blacklist write still requires a dealer signal (§71 auto-reject, or buyer dismiss `dealer`). |

**Honest limit:** a *new* listing from a known dealer still arrives with empty seller fields. Pre-ingest `isBlockedSeller` can only fire when (a) this listing_url was enriched on a prior scrape, or (b) the payload carries a seller key. First-time cars from a known dealer stay **off the sheet** until GoLogin attaches the URL (then drop if blocked). §71 still drops obvious dealer *listings* with no seller key. Scale of private-party cards on Opportunities is Fly + this one Facebook login until action 6 (more accounts), not a 40/day cap.

### What we proved — 2026-08-22 (do not re-derive)

Account `automation@texasautovalue.com`. Profile **`fb_buyer_10_Marcus Vance_MA`** (`GOLOGIN_PROFILE_ID=6a395e9dbd022c01732d2024`), Mac fingerprint, HTTP proxy (`brd.superproxy.io` in resolver rules). Rami token lives in `.dev.vars` as `GOLOGIN_API_TOKEN` (2026-08-28); this n=2 probe used the automation guest. Never commit tokens.

`npm run gologin:ping` listed 15 profiles and resolved the selected one.

Two live `normalized_listings` from the same day, opened in that session. **No DB writes.**

| Listing | Result |
|---------|--------|
| `…/item/1555379669961807/` 2024 Chevrolet 2500 (Dallas, minutes old) | **URL only.** `https://www.facebook.com/marketplace/profile/1000526149`. No login wall. Visible link text was the chrome label **Seller details** — not the person. |
| `…/item/959752267150487/` 2023 Dodge Charger RT (Dallas, minutes old) | **URL + name.** Clicked Seller details. `https://www.facebook.com/marketplace/profile/100008618685090` · display name **Dakota Herrel**. ~18s including Orbita start. |

Href shape to lock: `https://www.facebook.com/marketplace/profile/{numeric_id}`. `normalizeSellerUrl` already handles it. Fallback `profile.php?id=` / `/people/` not seen on these two.

**Extractor rules (from the miss, then the hit):**

1. Do not treat link innerText as the name when it matches chrome (`Seller details`, `Seller information`, `View profile`, …).
2. Prefer `aria-label`, then click the seller control, then read the name on the panel / profile link.
3. Never invent. Login wall, checkpoint, dead listing, or no `/marketplace/profile/` href → skip.

**Runtime (from the same afternoon):**

| Path | Result |
|------|--------|
| GoLogin **cloud** (`cloudbrowser.gologin.com/connect`) | Worked once (Chevy, 2026-08-22). Later connects **503** that day — do not treat as dead. **Cloud is the Fly batch path** as of 2026-08-31 (dismiss `--write` green + always-on `tav-seller-enrich`). |
| GoLogin **local Orbita** (`gologin` SDK `launch({ profileId })`) | Worked on this Windows box with a **Mac** profile (Charger). This is the batch path. |
| `gologin` + **Node 25** | SDK calls `fs.promises.rmdir({ recursive: true })`, which Node 25 rejects. Local start dies in `BrowserChecker.deleteDir` unless that call is `fs.rm(..., { recursive: true, force: true })`. Patch or wrap before anyone else runs the probe. |
| `GL.exit()` after a cloud session | Throws `Invalid profile folder path` under `%TEMP%\gologin_profile_{id}`. Close the browser; DELETE `https://api.gologin.com/browser/{id}/web` to free the cloud slot. Do not `stopLocal` on a cloud run. |

Files: `scripts/gologin-ping.mjs`, `scripts/gologin-seller-probe.mjs`, `scripts/enrich-facebook-sellers.mjs`, `scripts/lib/facebook-seller-extract.mjs`, `scripts/lib/gologin-fs-patch.mjs`, `scripts/lib/gologin-antiban.mjs`, `scripts/lib/enrich-queues.mjs`, `Dockerfile.enrich`, `fly.seller-enrich.toml`. `npm run gologin:ping` / `gologin:probe` / `gologin:enrich` / `gologin:enrich:daemon`. Same extract; `--write` gated (default off on one-shot; Fly runs `--write --loop --cloud`). Halt latch: local `scripts/.enrich-run-state.json` (gitignored); Fly volume `/data`. `--queue-only` ran 2026-08-24 (8 live `dealer_listing` URLs, no browser).

### What we already have

| Asset | State |
|-------|--------|
| GoLogin + Facebook session | **Pinned** — `fb_buyer_10_Marcus Vance_MA`. Do not create a second FB account unless this one is checkpointed. |
| `normalized_listings.listing_url` | Populated. Facebook item URLs, typically `https://www.facebook.com/marketplace/item/{id}/`. |
| `normalizeSellerUrl` / `buildBlockedSellerKey` | Shipped in `src/persistence/blockedSellers.ts`. Prefer URL (`url:https://www.facebook.com/marketplace/profile/{id}`), fallback `name:…`. |
| Sticky upsert | `COALESCE` on seller columns — enrichment survives the next empty Apify payload. |
| Mirror UI | Detail already renders `listingSellerName` when present (`opportunity-listing-mirror-block.tsx`). |

### Locked decisions

| Decision | Choice |
|----------|--------|
| Runtime | Standalone Node process via the `gologin` SDK + `puppeteer-core`. **Always-on path is GoLogin Cloud on Fly** (`tav-seller-enrich`, `--loop --cloud`). Local Orbita is for debug on this PC only — never at the same time as Fly on `fb_buyer_10`. **Not** the ingest Worker. Worker must not launch a browser. |
| Profile | `fb_buyer_10_Marcus Vance_MA` only. Proxy stays whatever GoLogin already uses — do not rotate under the same FB login. |
| Extract | Seller **profile URL** (`/marketplace/profile/{id}`) + display name. Click through **Seller details**. Drop chrome labels. Never invent. Login wall / checkpoint / dead listing / missing href → skip + log. |
| Persist | Write `seller_url` / `seller_name` onto `normalized_listings` (and onto `filtered_out.details` when the row never became a listing). Then, **only if** a dealer signal exists, `upsertBlockedSeller`. |
| Dealer signal | Existing only: `reason_code = dealer_listing` (§71) or buyer dismiss `dealer` (item 47). Do not infer dealer from the seller name string in v1. |
| Scope | Facebook, **all metros** — lift the `dallas_tx` CHECK. Match `isBlockedSeller` on `(source, seller_key)` regardless of region (same dealer posts Dallas and Houston). Keep `region` on the row as first-seen audit. |
| Rate | **Uncapped (test).** `--hours` + `--max-per-day` restore the old 25/hour 40/day Chicago window. Halt on checkpoint / login wall until `--clear-halt`. |
| Queue | Unprocessed Facebook (no `seller_url`) first, then dealer dismiss, then `dealer_listing`. Default Opportunities views wait on seller URL. |
| Humanizer | **None.** No feed-scroll / like bot. |
| Secrets | `GOLOGIN_API_TOKEN` (rami, **in `.dev.vars` 2026-08-28**) + `GOLOGIN_PROFILE_ID`. Old automation guest kept as `Nick_GOLOGIN_API_TOKEN` until rami is proven. Optional `GOLOGIN_WORKSPACE_ID=6a3439c37b918d79b8ed7d3a`. Never commit. Facebook password stays in GoLogin. |
| Flag | `SELLER_ENRICH_ENABLED` / `--write` on the enrich script (default off). Ingest stored-seller lookup is **live** `78f79974`. `ingest.dealer_blocked` on re-scrapes still needs enrich `--write` first (`blocked_sellers` is 0). |

### Ordered actions

**0. ~~Prove the page~~ — DONE 2026-08-22 (n=2 live listings, see table above).**

Href is `/marketplace/profile/{id}`. Name is not the listing-page innerText. Apify payloads remaining empty is the logged-out/vendor gap; no need to re-open those two URLs. Do not sit on more manual probes — apply via actions 1–3.

**1. ~~Make the shipped blacklist able to use a seller key~~ — SHIPPED 2026-08-24 (migration `0072` applied; Worker `78f79974`).**

Without this, enrichment writes into a Dallas-only table and ingest ignores stored sellers on re-scrape.

| Change | File |
|--------|------|
| Drop `region = 'dallas_tx'` CHECK; unique on `(source, seller_key)` | new migration `0072_blocked_sellers_all_metros.sql` |
| `isBlockedSellerScope` = Facebook, any region | `src/persistence/blockedSellers.ts` |
| Before `isBlockedSeller`, if payload seller is empty, load existing `normalized_listings` by URL and use stored `seller_url` / `seller_name` | `runIngestItemLoop.ts` |
| Same lookup in prefetch skip | `llmYmmsPrefetchInputs.ts` |
| On §71 auto-reject, if we now have a stored or payload seller key, `upsertBlockedSeller` | already in the loop |

Tests: re-scrape of a URL that already has `seller_url` matching `blocked_sellers` → `reason_code: blocked_dealer`, no MMR. Houston region must insert. Empty payload must not wipe stored seller (already true via COALESCE — assert it).

**2. ~~Extractor as a script, not a service~~ — SHIPPED 2026-08-24.** `scripts/enrich-facebook-sellers.mjs` + shared extract. Local Orbita. No writes until `--write`.

Promote `scripts/gologin-seller-probe.mjs` → `scripts/enrich-facebook-sellers.mjs` (same shape as `scripts/eval-seller-classification.mjs`): no production writes until `--write`.

- Local Orbita: `GologinApi({ token }).launch({ profileId })`. Cloud **is** the Fly batch path (2026-08-31). Do not run local Orbita and Fly/cloud on the same profile at once.
- `page.goto(listing_url)`. Wait for `a[href*="/marketplace/profile/"]`. Click Seller details. Read href + usable name (reject chrome labels).
- Map through `normalizeSellerUrl` / `normalizeSellerName`. Reject non-facebook hosts.
- Dry-run on a handful of current `listing_url`s. `--write` updates `normalized_listings` (or `filtered_out.details` json) and, when a dealer signal is on that row, calls the same `upsertBlockedSeller` path.
- Node 25: do not call `rmdir({ recursive: true })` — use `fs.rm`.

Do not use a second stealth stack (undetected-chromedriver, random Chrome). The point of GoLogin is that this Facebook account already lives in that fingerprint.

**3. Queue — Needs-action-only (default).** Shipped in repo 2026-09-03. `--queue-only` to inspect. Legacy `--queue unprocessed|dealer_*` for debug. Do not drain Unprocessed / dealer queues on Fly anymore.

Priority, all `source = facebook`, seller_url IS NULL, under ~5 days:

1. Unprocessed Facebook (cards waiting to enter the sheet). Prefer §71-inconclusive. **Do not auto-blacklist** these (`dealerSignal` off) — identity only; drop only if the key is already blocked. After `--write`, a non-blocked URL is what admits the card.
2. Buyer `dealer` dismisses in the last 14 days (identity → `upsertBlockedSeller`).
3. `filtered_out` `dealer_listing` in the last 48h (grow the table off-queue).

Skip: VIN-priced, dead Marketplace links, already has seller, Craigslist. No daily cap on this test.

**4. ~~Post-enrich drop~~ — SHIPPED in `--write` path (2026-08-24).** Suppresses `opportunity_workflow` to `bad_lead` when the seller_key is already blocked.

When `--write` attaches a seller_key that is already in `blocked_sellers`, hide that opportunity from default views the same way dismiss does (or `writeFilteredOut` + suppress). If the key is not blocked, the card may now appear — seller URL is the admission ticket.

**5. Soak — dry-run first, then `--write`, then Fly always-on.** Caps/halt/warmup are in the script. Caps **off** for this test.

**Dry-run done 2026-08-28** (~10:50 Chicago): `npm run gologin:enrich -- --limit 5` (no `--write`). Warmup stayed logged in. **5/5** Needs action listings yielded `/marketplace/profile/{id}` + a real name. No login wall, no checkpoint. `write: false`. Cap used 5/40 that day (old cap; now uncapped).

**Write done 2026-08-28** (~11:00 Chicago): `npm run gologin:enrich -- --write --limit 5`. **5/5** `wrote: true`, `blocked: false`, `suppressed: false`. Confirmed in `normalized_listings` (`seller_url_all` 0 → 5). `blocked_sellers` still **0**. Cap **10/40**.

**Dealer-signal `--write` done.** Orbita 2026-08-29 (4 flags). Cloud 2026-08-31 (Passat / Claudia Gonzalez profile URL). `blocked_sellers` is no longer empty.

**Always-on Fly live 2026-08-31.** `fly deploy -c fly.seller-enrich.toml`. Trial killed the machine after 5 minutes until a card was on the Fly account; then `fly machine start 2870647c500408` (~17:13Z). That start did **not** produce a valid 48h soak (see 2026-09-02 table). **Soak clock is 2026-09-02 ~12:59Z.** Watch: `ok wrote` / `seller_url` climbing, residential GB not back at 2–3 MB/listing, profile still logged in, no checkpoint, private-party keys not in `blocked_sellers`, Fly health `https://tav-seller-enrich.fly.dev/`.

**6. Scale — create Facebook accounts via GoLogin (P1, recorded 2026-08-28; still open).**

Uncapped on one login still dies if Facebook checkpoints. Find a repeatable way to create Facebook accounts **inside GoLogin** (new profile + own US residential + signup in that browser + Marketplace). One tab per profile, not overlapping IPs. The existing ~10 `fb_buyer_*` profiles are shells until they have live Facebook logins. Do not run a second profile in parallel with Fly on `fb_buyer_10`.

### Rami token / residential (2026-08-28) — do not re-derive

**Token arrived 2026-08-28 evening.** In `.dev.vars` as `GOLOGIN_API_TOKEN`. It is a GoLogin **dev** JWT (not the automation guest). Traffic/workspace calls use `GOLOGIN_WORKSPACE_ID` rami `6a3439c37b918d79b8ed7d3a`. Old automation token kept as `Nick_GOLOGIN_API_TOKEN` until rami is proven. **Never put the token in git, chat logs, or this file.**

**Proxy/token path is done.** Dry-run, `--write`, dealer-signal Cloud write, and Fly always-on all landed. **Traffic top-up 2026-09-02** (12 GB pool). Next is the **reset** 48h Fly soak, then Worker deploy of the sheet filter, then action 6.

| Fact | Detail |
|------|--------|
| Workspaces | **rami** `6a3439c37b918d79b8ed7d3a` (Business; residential **12 GB** as of 2026-09-02) · **automation** `6a8726226994b1d9b86e681f` (Unpaid) |
| Token in `.dev.vars` | **rami owner/admin** as `GOLOGIN_API_TOKEN` (2026-08-28). Prior `automation@` guest kept as `Nick_GOLOGIN_API_TOKEN`. |
| Bright Data | Saved proxy `fb_buyer_10`, `brd.superproxy.io:33335`. TCP up, **CONNECT 401**. GoLogin SDK timezone check → `Proxy Error` before Orbita starts (2026-08-24) |
| Automation residential | Traffic API showed **0.49 GB** on the guest token. `addGologinProxyToProfile('us', 'resident')` → **403** `You have reached the maximum number of proxies`. Not spendable from that token |
| Proxies page empty | Expected. `GET /proxy/v2` is saved custom rows. Residential GB is **traffic credit**, not a list. Attach via `POST /users-proxies/mobile-proxy` |
| Profile proxy now | `mode: geolocation`, host `geo.floppydata.com:10080` (2026-08-28). Check proxy **US**. Not Bright Data. **Freeze — do not swap.** |

**One-time proxy exception:** replacing dead Bright Data with **one** rami GoLogin US residential on this profile, then freeze. Do not keep swapping IPs under the same Facebook login.

~~Ask Rami~~ — **done.** Token is local. Do not ask again.

**Attached 2026-08-28** (`scripts/gologin-assign-residential.mjs` / `npm run gologin:assign-residential`):

1. `gologin:ping` resolved `fb_buyer_10_Marcus Vance_MA`.
2. Traffic on `currentWorkspace=rami`: residential **2 GB / 0 used**.
3. `POST /users-proxies/mobile-proxy` → 201. `customName=fb_buyer_10_gologin_us`. `isDc=false`, `isMobile=false`, `countryCode=us`.
4. `GET /browser/{profileId}` — `proxy.mode=geolocation`, host `geo.floppydata.com:10080` (not `brd.superproxy.io`).
5. Check proxy through it: **US**.

**Now:** proxy **frozen**. Dealer-signal `--write` **done** (Cloud 2026-08-31). Fly is attaching sellers. Do not create a second Facebook account or run backup profiles until action 6 — and never in parallel with Fly on this login.

**Do not**

- Use `Nick_GOLOGIN_API_TOKEN` (automation guest) against rami traffic again and expect it to work.
- `PATCH` `mode: gologin` / `geolocation` without `POST /users-proxies/mobile-proxy` — it cleared the profile once.
- Put Rami's token in git, chat logs, or `NEXT_STEPS.md`.

### What this is not

- Not a replacement scraper. Apify stays the ingest source.
- Not a Facebook crawl of search results. We only open URLs we already paid the vendor for.
- Not vendor escalation (still do that for `extraListingData.seller` + gallery — §69 / §73). If they ever fill the field, keep this script but stop spending the account on new rows.
- Not a like/scroll “humanizer.”
- Not widening §71's 0.85 gate.
- Not blocking **ingest** on Orbita (Worker still upserts). Default Opportunities views **do** wait on seller URL.
- Not raising this one account past 40/day ~~was~~ the old lock. **This test is uncapped.** Scale after a ban is still more Facebook logins (§74 action 6).

### Exit criteria

- [x] Logged-in listing yields `/marketplace/profile/{id}` (2026-08-22, n=2; name after Seller-details click)
- [x] `blocked_sellers` accepts every Facebook metro; unique on `(source, seller_key)`
- [x] Re-scrape of an enriched + blocked URL logs `ingest.dealer_blocked` and skips MMR (unit test; Worker **live** `78f79974`)
- [x] Dry-run enrich queue (`npm run gologin:enrich -- --queue-only`, 2026-08-24; Needs action first)
- [x] Rami owner/admin API token in `.dev.vars` as `GOLOGIN_API_TOKEN` (2026-08-28). Residential was **2 GB**; **+10 GB 2026-09-02** (pool **12 GB**). Exhausting it 503s Cloud (`missing ws_url`).
- [x] US GoLogin residential attached to `fb_buyer_10_Marcus Vance_MA`; Check proxy green; `proxy.mode` not `none` (2026-08-28, `geo.floppydata.com`). **Freeze.**
- [x] Live Orbita dry-run (no `--write`) on a handful of current URLs — **5/5** seller URL+name, 2026-08-28, no checkpoint
- [x] `--write` identity on Needs action — **5/5** persisted 2026-08-28; private-party keys not in `blocked_sellers`
- [x] `--write` dealer dismiss so `blocked_sellers` > 0 — Orbita 2026-08-29 (4 flags); Cloud 2026-08-31 (Passat / Claudia Gonzalez profile URL)
- [x] **Sheet waits on seller URL (lock 2026-08-31, tightened same day):** Facebook with no `seller_url` stays off default Opportunities views **in code**. Known seller in `blocked_sellers` → ingest does not upsert; views hide the card. Worker still cannot open Facebook.
- [x] **Needs-action-only enrich queue** (2026-09-03): default `needs_action`. Fly redeployed.
- [x] **Needs action waits on seller URL + blocked check** — view filter live production `2b262630` (2026-09-03)
- [x] Host `--loop --cloud` on Fly (`tav-seller-enrich`, `fly.seller-enrich.toml`, machine `2870647c500408`, 2026-08-31). Worker is the wrong runtime. Do not also run the local daemon on the same profile. Trial 5-minute stop cleared after a card was added.
- [ ] 48h soak on Fly: account alive; `seller_url` climbing on **needs_action** rows; no private-party URL keys in `blocked_sellers` (**clock 2026-09-03 ~13:56Z** → ~2026-09-05 13:56Z). Monitor: `npm run monitor:fly-soak`. T+~20min 2026-09-03: healthy (~8/min writes, 1 dealer `blocked_sellers` row).
- [x] Mirror on detail shows seller name/URL when enriched (UI 2026-09-02, commit `75d69f3`)
- [ ] **Create Facebook accounts via GoLogin** — one login still dies on checkpoint; need a repeatable signup path (profile + residential + Marketplace)

### Rollback

Stop the script (`SELLER_ENRICH_ENABLED` off). Enriched columns can stay. To undo scope: restore the Dallas CHECK only if we have to — prefer leaving all-metros in.

---

## 69 — Dealer seller blacklist (pre-ingest)

**Status:** [~] table has rows; ingest + default views hide blocked keys and empty-seller Facebook (**live** `2b262630`). Fly attaches URLs for matching. Vendor `extraListingData.seller` object is still often `{}`.

When a buyer dismisses with reason `dealer`, the seller is auto-added to `blocked_sellers`; ingest skips matching sellers before LLM and MMR. Seller key is `seller_url` (normalised: strip query params and trailing slashes, case-fold path), falling back to `seller_name`.

**The seller slot is often hollow on the Apify payload** (`extraListingData.seller` `{}`). Detailed Fetch *is* enabled — we get `description`, `condition`, `location`, `creation_time` from the same object. Escalate alongside the §73 gallery finding. §71 still filters first-time dealer *listings* without a seller key. **§74** fills `seller_url` so this table can match. **Buyer 2026-08-31:** matching is not enough if the card already showed — block before Opportunities.

Two landmines from v1 — **fixed and live** `78f79974` (2026-08-24):

1. ~~Dallas-only CHECK~~ — unique is now `(source, seller_key)`; scope is Facebook, any metro (`0072`).
2. ~~Payload-only lookup~~ — if the Apify seller is empty, ingest loads stored `seller_url` / `seller_name` by listing URL before `isBlockedSeller`. Upsert still `COALESCE`s so an empty payload cannot wipe an enriched value.

---

## 68 — Ingest throughput + fast validation playbook

**Status:** [~] playbook in use; scope statement below corrected.

**Rule:** validate changes in **hours** — single Apify run + `source_runs` row + queue spot-check — not 1–3 day soaks.

### Scope (corrected 2026-08-13)

| Resource | Value |
|----------|-------|
| Task | `texas-nick-task` (`ZQEsd3nHcLAs5kLwL`), actor `raidr-api/custom-vehicle-scraper` |
| Locations | Dallas, Houston, San Antonio, Austin, El Paso, Lubbock, Amarillo, Midland, Corpus Christi |
| Plus | A second task covers Oklahoma City, Tulsa, Ardmore, Ponca City |
| Config | radius 100mi, maxResults 100/location, minYear 2010, price $3,500–250,000, maxMileage 175,000, `fetchDetailedItems: true`, `fetchListingMedia: true` |
| Exclude keywords | Dealer, Buy Here, Finance, Stock#, Salvage title, Rebuilt Title, …, **`2008`, `2009`, `2010`** |
| Adapter | `src/sources/facebook.ts` |
| Webhook | production `/apify-webhook`; chunked when batch > 7 |

The `2008`/`2009`/`2010` exclusions are why pre-2011 volume collapsed and the new year floor rarely fires.

### Playbook — after each deploy, within 1–2 hours

| Check | Where | Bar |
|-------|-------|-----|
| Run completed | `tav.source_runs` latest `run_id` | `status=completed`, not stuck `running` |
| Process rate | `processed / item_count` | ≥ 90% on a 20-item sample |
| Truncation | `error_message` | No `batch_truncated`, skips ≤ 2 |
| MMR funnel | `valuation_snapshots` | Hit % not regressed vs prior 24h |
| Token signal | `llm_ymms.anthropic_cache_usage` | No spike in uncached tokens |

**Always clock-match cohorts.** Hit rate swings ~15 points by time of day — an earlier "75.3%" reading was a time-of-day artifact. Never compare a short window to a 24h average.

### Open ops

- [x] Stuck `running` `source_runs` rows — **cleared 2026-09-03.** **131** reconciled (130 `truncated`, 1 `failed`); **0** `running` now. Tag: `ops_reconciled:stuck_running_cleared_2026-09-03`. Likely cause: `completeSourceRunSafe` in `waitUntil` did not persist. **Watch:** new `running` rows older than 30m.
- [ ] List/detail flag UI cache lag (~60s)
- [x] **Home ↔ Opportunities ~10s** (buyer 2026-08-31) — thin RSC + client cache; see §58

---

## 59 — Max buy / Y/M/M/S linkage at ingest

**Status:** [~] shipped `c49c49f`, production `c244a655`; soak ongoing.

**Was:** Y/M/M/S → MMR worked (~68% hit, Cox `lookup_trim` stored on every hit) but was **not linked to Max buy**. Ingest never called Max buy; detail auto-run required `opportunity.style` from `listing.trim` (null on 66% of MMR hits) even though `valuation_snapshots.lookup_trim` had the Cox style; Max buy re-ran MMR with parsed fields or `"base"` instead of the resolved tokens. **0 of 3,537** new listings got a `maxbuy_recommendations` row.

**Now:** ingest-time Max buy evaluation plus an identity bridge from the Cox tokens. `buildIngestMaxbuyEvaluateBody` / `scheduleIngestMaxbuyEvaluate` run on every hit, including retry-recovered listings.

---

## 62 — Listing mirror on opportunity detail

**Status:** [~] v1 shipped. **2026-09-02:** detail mirror shows the **1536px** photo (strips `&ctp=s261x260` even on old stored URLs) and links **seller name → `seller_url`** when Fly/enrich attached a profile. Multi-photo stays vendor-blocked (`extraListingMedia` null).

Closers can read seller identity without opening Facebook. Production Worker already returns `listingImages` / `listingSellerUrl`; the UI was not using the URL or upgrading the crop. Worker `mapToOpportunityDetail` also upgrades images on read (rides the next `wrangler deploy` — do **not** deploy that just for this, it would ship the view filter).

---

## 51 — Expand workflow statuses

**Status:** [~] minimum shipped (`bad_lead`, `purchased`); fuller enum blocked on the buyer checklist.

Buyer's off-the-cuff pipeline: `Found → Working → Bad Lead → Contacted → Appraised → Not Negotiable/Overpriced → Purchased → In Scheduling → Delivered → At Auction → Sold`.

**Do not invent statuses beyond the minimum.** For each proposed status the buyer must confirm: keep? · exact label · active in queue vs drops out · reason required? Also confirm whether to rename UI **Bought → Purchased** everywhere.

Design direction: happy-path stepper for the linear flow plus a status dropdown for branches and terminals — a linear stepper cannot represent Bad Lead / Overpriced. Single status registry (Worker enum + Zod + labels + terminal/suppressed sets) in `src/persistence/opportunityWorkflow.ts`.

---

## 58 — UI/UX polish

**Status:** [x] **done 2026-08-31.** Home ↔ Opportunities nav shipped. Leftover polish (badges/KPI cards, detail two-column, claim banner/stepper, MMR Lab skeleton) is in Deferred.

**Home ↔ Opportunities was ~10 seconds.** Recorded 2026-08-31. Switching between those two app surfaces was unusably slow. Item 43 (`e55015b`) already did optimistic tab state, 60s `staleTime`, `placeholderData`, hover prefetch, and stopped unmounting the opportunities client when `query.data` went undefined. That did **not** make this switch fast — it only helped tabs *inside* Opportunities.

**Cause:** both `/dashboard` and `/opportunities` awaited Worker SQL in the RSC (`listOpportunitiesPage`, 500-row default page size on Opportunities). Next.js holds the previous page until that RSC finishes, so React Query cache on the client never got a chance to paint.

**Fix (2026-08-31):** pages are thin shells. Queue + Home counts load on the client from the shared QueryClient. Sidebar / Home-tile hover prefetches the destination query. Visiting Home idle-prefetches the default queue; visiting Opportunities idle-prefetches Home counts. First visit can still wait on SQL *after* paint (skeleton); a return trip should be a cache hit. `web/lib/opportunities/queue-prefetch.ts`. E2e: `web/e2e/nav-switch.spec.ts`.

---

## 67 — Craigslist scheduled ingest

**Status:** [~] deprioritized. Adapter (`parseCraigslistItem`, `bc09841`) and chunked ingest (production `467021c6`) both shipped; verification run `FuPxo5UyEbqDA6jtt` processed 19/20 (was 7/20). Schedule `HIb0Pg9Gg3Pn7RNfD` remains **disabled**. Resume only after the Facebook hit rate is where it needs to be.

---

## The LLM identity stack (items 57, 60, 61, 64, 65, 66, 70)

All shipped. Recorded here as constraints on future work rather than open tasks.

### Ladder as built

```
alias fast-path → offline confident gate → pruned catalog (Ford/Chevy) →
single Claude call → deterministic exact-match gate → fallback
```

`src/valuation/resolveListingWithLLM.ts`. **~81% of listings skip Claude** via `alias_hit` or `offline_hit`. Over 24h: 9,464 `alias_hit`, 1,576 `llm_hit`, 1,787 `llm_needs_review`, 62 `llm_invalid_pick`, 19 `offline_hit`.

**This is the tension §72 exists to resolve** — §70 optimised for token cost and skip rate, not pick accuracy. Accuracy wins.

| Item | What shipped | Constraint it imposes |
|------|--------------|----------------------|
| **57** | Claude Y/M/M/S normalization, `LLM_YMMS_ENABLED=true` both envs since 2026-07-22 | Full design in [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) — read before changing the prompt |
| **60** | Description / condition / miles / location reach Claude on every ingest path | Evidence is capped at 1,000 chars; location dropped from the prompt |
| **61** | Auto-accept above 0.50 confidence, ignoring `needsReview` | ~50% of Claude calls become `llm_hit` |
| **64** | Catalog floor to 2013 (44,675 rows), description into the offline matcher | Modest pre-2016 lift (54% → 58%); overall flat |
| **65** | Alias learning from `llm_hit` / `offline_hit` + MMR hit | **Never learn from** `llm_invalid_pick`, sub-0.5 confidence, MMR misses, empty-trim keys, or retry-recovered picks. Migration `0070` purged 865 → 324 rows after bad aliases caused `cox_no_data` |
| **66** | Anthropic prompt caching on system + tool + `(year, make)` catalog prefix | **Per-listing evidence must stay the uncached tail** — anything listing-specific in the prefix destroys the cache |
| **70** | Offline-first gate, Ford/Chevy subtree pruning, prefetch sorted by `(year, make)`, evidence trim, token columns (migration `0069`) | Rejected: `max_tokens` 1024→256, and "fix `needs_review` waste" |

**Cost context:** ~$200 Anthropic spend over ~4 days at ingest volume before caching. Research in [`LLM-Token-Efficiency.md`](LLM-Token-Efficiency.md).

### Scraper review mode

`SCRAPER_REVIEW_MODE = "true"` is a **permanent product decision** (2026-07-16), not a soak flag. The Unprocessed Leads tab is a permanent queue surface. Window `SCRAPER_REVIEW_WINDOW_HOURS`; `SCRAPER_REVIEW_MIN_YEAR = 2011` hides 2010 and older.

Suggestions on detail (`catalog_match_suggestions` + Apply button) already exist from item 55 Phase C-b — reuse them for §72 action 9 rather than building new UI.

---

## Archive — shipped

| # | Item | Commit(s) |
|---|------|-----------|
| **40–41** | Queue tab count/list parity (Needs action / Mine) | `6486776` |
| **42** | **Received** timestamp column + `received_desc` sort | `6486776` |
| **43 + 52** | Tab latency + double-click — optimistic tab state, 60s `staleTime`, `placeholderData`, hover prefetch. Root cause: unmounting the whole client when `query.data` went undefined | `e55015b` |
| **58** | Home ↔ Opportunities ~10s — thin RSC pages, client React Query, hover/idle prefetch | — |
| **44** | **Listed** date from seller post time (`listing_date_ms` → `posted_at`); relative + tooltip; does not need `fetchDetailedItems` | `65d3b93` |
| **45 + 47** | Dismiss / flag bad lead with required reason; excluded from default views for everyone; audited in `opportunity_actions` | `3ed1c8f`, migration `0062` |
| **46** | Cox Y/M/M autofill — `resolveListingToCatalog`, **Use listing identity**, MMR Lab prefill | — |
| **48** | VIN → Y/M/M/S + fresh MMR / Max buy on blur/save | `3dfd38a` |
| **49** | VIN cleared on save — detail client keeps local state from PATCH, not stale SSR props | `fe50370` |
| **50** | Refresh valuation wipe — keep prior cards, restore on failure | `fe50370` |
| **53** | Salesperson / Appraiser directory + admin CRUD (`tav.staff_directory`, `role = both`) | `24db7a7`, `d557463` |
| **54** | No guessed miles; persist YMM; miles optional for MMR + Max buy. Historical invented-miles snapshots left as-is | `af362d7`, `9bc8bd3`, `43e921b` |
| **55** | Scraper review mode + ingest Y/M/M/S; Phases A–E incl. offline matcher, catalog tree, suggestions UI, alias quality | `f2328da`, `b2064dd`, `569b4885`, `c9e40f47`, `414ce2f` |
| **56** | Apify `unmapped_task` outage backfill (~5k listings, original Received times). Root cause: production `APIFY_TASK_REGION_MAP` lacked the custom task IDs | `347ca3c` |
| **63** | Craigslist source adapter | `bc09841` |
| **15–35** | MMR Lab polish + opportunity detail redesign (grade conversion, exact Cox deltas, blur-save, compact valuation cards, state dropdowns, stepper rename) | — |

**Buyer email 2026-07-09 → item map:** #1→47 (+45) · #2→48 (+46) · #3→49 · #4→50 · #5→51 · #6→52 (+43) · #7→53

---

## Deferred

- UX backlog §4–7 (role nav, shell polish)
- Item 58 leftover polish: queue badges/KPI cards; detail two-column layout, claim banner and stepper; MMR Lab skeleton
- Item 52: global pending style on async buttons
- `handoff.md` production deploy dates are stale

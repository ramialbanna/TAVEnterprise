# Next Steps â€” MMR Lab

**Last updated:** 2026-08-13 · **Focus:** **72** — MMR quality (identity accuracy over alias speed). **~59% MMR hit is unacceptable** — target near-universal evaluation on eligible inventory. Also open: **71** dealer AI filter, **68–70** Dallas FB. Craigslist **67** deprioritized.

> **Fresh chat prompt:**
> **2026-08-13:** **Alias quality fix** — bad `mmr_style_aliases` caused `cox_no_data` (e.g. 2018 Wrangler Unlimited → wrong Sahara alias + invalid model `WRANGLER UNLIMITED`). Shipped: title-trim before empty-trim lookup, catalog validation on alias hits, no empty-trim learning, uppercase make, migration **`0070`** (865 → **324** aliases). Worker staging `b3616613` + production `e97c673e`. Commit **`414ce2f`** on `main` (Vercel auto-deploy). **Unprocessed Leads** tab hides **2010 and older** (`SCRAPER_REVIEW_MIN_YEAR=2011`). **Credits restored ~2026-08-12** — MMR ~**60%** Dallas FB; §68 post-credits validation updated below. **§71 opened** — AI text-based dealer listing detection (complements §69 seller-key blacklist; not built yet). **§72 opened (priority)** — production triage: **~59% MMR hit**; **~85% of `cox_no_data` misses trace to `alias_hit`** (wrong Y/M/M/S sent to Manheim, not “no book value”). Quality over alias skip rate — see §72.
>
> **2026-08-11 (current):** **Priority shift** — main focus is **Facebook Dallas** (`dallas-nick-task` `ZQEsd3nHcLAs5kLwL` → `dallas_tx`), not Craigslist. Goals: **better ingest results fast**, **least validation soak time** (hours / single-run metrics — not 1–3 day soaks when shipping changes). Three tracks — see §68, §69, §70:
> 1. **§68** — Dallas FB scraper throughput + fast validation playbook.
> 2. **§69** — **Dealer seller blacklist**: when a buyer dismisses with reason **`dealer`**, **auto-add** seller to a blocklist; filter **before ingest** (before LLM/MMR) so tokens aren’t wasted. **Scope v1:** `source=facebook` + `region=dallas_tx` only. **Blocked on scraper:** `seller_url` / `seller_name` not in Apify payloads yet (0 rows in `blocked_sellers`); boss still seeing dealer/salvage volume — **§71** scopes AI text classification as the first-sighting complement.
> 3. **§70** — **Token efficiency — shipped 2026-08-11** (offline-first, Ford/Chevy catalog prune, prefetch sort, evidence trim, alias learning fix, token columns). Research doc [`LLM-Token-Efficiency.md`](LLM-Token-Efficiency.md). Worker staging `46ac09a2` + production `7cbd9844`; **credits restored 2026-08-12** — token columns populating; ~**81%** of listings skip Claude via alias/offline.
>
> **2026-08-11 (same session):** **§55 Phase D** offline matcher — `parserGarbagePenalty` regex fix, style tie-break, `2d`/`4d` body tokens, offline alias fallback. Worker staging `57cafd1c` + production `64c6ea94`. Migrations **`0068_blocked_sellers`**, **`0069_llm_ymms_token_usage`** applied Supabase.
>
> **2026-08-08:** **67** chunked Apify ingest shipped prod `467021c6` — synchronous multi-chunk path; verification run `FuPxo5UyEbqDA6jtt` **19/20 processed** (was 7/20). Schedule `HIb0Pg9Gg3Pn7RNfD` still **disabled**; item **67** on hold until FB Dallas wins. See §67.
>
> **2026-07-28:** **66** shipped (`bdf3e20`, prod `aadd46ef`) — Anthropic `cache_control` on system + tool + `(year, make)` catalog prefix; per-listing evidence is the uncached tail. Worker logs `llm_ymms.anthropic_cache_usage` (read/write/uncached tokens). **Cost + funnel soak pending** — confirm `cacheReadInputTokens` on repeat makes and no MMR regression. **65** Phase 1 alias write **deployed** same prod cut (`834c9ac` in `aadd46ef`); **`mmr_style_aliases` forward-fill soak pending** (0 rows until repeat `llm_hit`+MMR ingests). **63** Craigslist adapter shipped `bc09841`. See §66, §65, §63.
>
> **2026-07-27:** **64** shipped (`b0eda58`) — catalog **2013–2027**, description in offline/live matcher. **2-day soak** (excluding `llm_unavailable` from credit outage): overall MMR **~73%** (flat vs prior 2d); pre-2016 **~58%** (+4 pts); `model_variant_missing` / `trim_missing` down ~30–48%. **`catalog_not_synced` = 0.** Credit outage 7/26–27 tanked raw funnel — refill before re-judging. **59** ingest Max buy **100%** on MMR hits after deploy (`c49c49f` ~14:43 UTC 7/25). **65** Phase 1 alias code shipped (`834c9ac`). **66** opened then shipped same day. See §64 soak notes, §65, §59.
>
> Sprint through **2026-07-16**: **55** Phase C shipped including catalog **2016–2027**. Worker **`9e4d2765`** (missing-years cron sync + skip-on-502). Web **deployed** (`tav-enterprise.vercel.app` — suggestions UI live). **`cox_catalog_tree`:** **35,978 rows** (2016–2027; +2,692 on 2026-07-16, 1 model skipped). Daily cron syncs **missing years only**. **Funnel (live ingests):** post-Phase C ~**49.8%** MMR hit vs **48.7%** post-Phase B; `model_variant_missing` **55.4%** vs **56.3%** of misses — need multi-day soak for offline-matcher lift. **`SCRAPER_REVIEW_MODE` permanent.** **51** buyer checklist. See §55 Phase C.
>
> **2026-07-18:** Claude API access unblocked (in principle). Decided to replace/augment **55**'s offline matcher with an LLM (Claude) call per listing — full plan, locked decisions, and rollout phases live in [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md). **Read that doc first**, this file's item **57** below is just the tracker entry. **Same day:** built and merged all of Phase 0 (`scripts/eval-llm-ymms.mjs`) and Phase 1's code (`src/llm/*`, `src/valuation/resolveListingWithLLM.ts`, migration `0066`, wired into `workerClient.ts` behind `LLM_YMMS_ENABLED="false"`, 30 new unit tests, full suite green at 1252 tests). **Nothing has actually run against real data** — no `ANTHROPIC_API_KEY` is configured anywhere yet, and the ingest batch-concurrency fix (doc §6) is still not done, so the flag must stay off. Next actual work: get the real key into `.dev.vars`, run `npm run eval:llm-ymms`, read the results.
>
> **2026-07-20:** `ANTHROPIC_API_KEY` set via Cloudflare dashboard on both `tav-aip-staging` and `tav-aip-production` secrets. Worker redeployed to both (`wrangler deploy --env staging` / `--env production`) — still `LLM_YMMS_ENABLED="false"` everywhere, purely to ship the dormant item-57 code paths. Migration `0066_llm_ymms_decisions` applied directly to Supabase (was missing — `list_migrations` showed `0065` as the latest before this). Local `.dev.vars` created from the template and filled in (`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — note: this project is on Supabase's **new key format** (`sb_secret_...`), the legacy `service_role` JWT is disabled). Ran `npm run eval:llm-ymms` (100 rows, `model_variant_missing`, no `--verify-mmr`): 17 `catalog_not_synced`, 83 reached Anthropic and **all 83 failed** with HTTP 400 `"Your credit balance is too low to access the Anthropic API."` — **this is a billing/account problem, not a code or config problem**; the pipeline (key, migration, prompt, gate) is confirmed wired correctly end-to-end. Blocked on adding credits to the Anthropic account before the eval can actually be scored. Ingest batch-concurrency fix (§6) and all item-57 file changes remain **uncommitted** in the working tree as of this update — commit before this is lost. *(Update 2026-07-21: this was committed later the same evening — `90940e9` Phase 0+1, `dee2613` §6 Phase 1 — nothing was lost.)*
>
> **2026-07-21:** Credits added to the Anthropic account. Re-ran `npm run eval:llm-ymms` (100 rows, `model_variant_missing`, no `--verify-mmr`, local `.dev.vars`): 18 `catalog_not_synced`, 82 real Anthropic calls, **0 errors** (credits blocker confirmed cleared), **0 `llm_invalid_pick`** → **valid Cox token rate 100%** (Phase 0 bar was ≥99% — met). Breakdown of the 82: 16 `llm_hit` (confident, valid pick), 66 `llm_needs_review` (valid pick but the model itself flagged low confidence — mostly 0.3–0.75, a few up to 0.85). Raw results: `scripts/_eval-results/llm-ymms-eval-2026-07-21T13-32-26-650Z.json`. Also logged as a new item: **59** — Max buy badge is missing on most **Needs action** queue rows (root cause: Max buy is evaluated on-demand from the detail page, not at ingest, so unopened/unclaimed leads have nothing cached — see §59).
>
> **2026-07-21 (later):** Considered running `--verify-mmr` for the real would-have-hit-MMR number, but it requires `INTEL_WORKER_SECRET` and the local `.dev.vars` copy is still `replace_me` — Cloudflare secrets can't be read back once set, so the only paths were (a) someone had a recorded copy (nobody did) or (b) rotate the shared secret between `tav-aip-*` and `tav-intelligence-worker-*`. **Decision: skip `--verify-mmr` entirely** rather than touch a live shared secret for a secondary signal. This is safe, not a corner cut: `workerClient.ts` (§Phase 1, already deployed) only ever trusts a confident `llm_hit` to actually resolve the catalog — `llm_needs_review` and `llm_invalid_pick` fall straight through to the unchanged existing offline-matcher path, so skipping the verify step can only under-measure the lift, never cause a bad price to reach a buyer. **Where this leaves item 57:** code-wise there is nothing left to build for Phase 0/1. The only remaining question is a product one — is a ~19.5% (16/82) confident-hit rate on this sample worth flipping `LLM_YMMS_ENABLED="true"` on **staging only** for a real funnel soak (same cohort methodology as item 55 Phase C) before ever touching production — **not decided, flag is still `"false"` everywhere.**

> **2026-07-23 (later):** On the live **custom-vehicle-scraper** Apify task(s), ops turned on **Fetch Listing Photos & Videos** (and **Fetch Detailed Item Info** where applicable) so datasets include full seller text + media, not search-feed thumbnails only. **Product note → item 62:** replicate the Facebook listing on the **opportunity detail page** (photo gallery, description, price/location/seller) so closers triage without opening Facebook. Ingest/DB/UI **not built yet** — today `raw_listings.raw_item` often has `primaryImage` only; `normalized_listings.images` is still empty and detail has no listing mirror block. See §62; ties to item **60** (persist description), item **57** Phase 2 (vision follow-up on low-confidence Y/M/M/S), and [`docs/04-operations/apify.md`](04-operations/apify.md) (refresh task config note when verified on Dallas/Oklahoma tasks).
>
> **2026-07-25:** Production analysis (since 2026-07-23 17:00 local) confirms **Y/M/M/S → MMR is mostly working** (~68% hit; Cox `lookup_trim` stored on every hit) but **Y/M/M/S is not linked to Max buy**. Ingest never calls Max buy; detail auto-run requires `opportunity.style` from `listing.trim` (null on **66%** of MMR hits) even though `valuation_snapshots.lookup_trim` has the Cox style; Max buy re-MMRs with parsed listing fields / `"base"`, not ingest's resolved Cox tokens. **0 / 3,537** new listings got a `maxbuy_recommendations` row. Full breakdown → §59. *(Update same day: item **59** shipped — ingest-time Max buy + identity bridge; `c49c49f`, prod `c244a655`.)*
>
> **2026-07-25 (evening):** Buyer case — **2015 BMW X3 xDrive28d** (`a36595cc…`): rich **description** in DB (*"xDrive28d"*, diesel) but title sparse (`2015 BMW X3`), ingest **`trim_missing`**, no LLM call. Root cause: **`cox_catalog_tree` starts at 2016** → item **57** LLM returns `catalog_not_synced` before Claude runs; offline matcher also skipped; live catalog fallback uses **title + trim only**, not description. MMR Lab worked only via **manual** Cox pick (`X SERIES` / `X3 4D SUV 28D XDRIVE`). **44×** `trim_missing` on **2015** listings in recent cohort alone. → **Item 64:** extend offline catalog + LLM gates to **2013**; improve overall **MMR hit rate** (~**68%** today — target higher; see §64).

**Legend:** `[x]` done Â· `[~]` in progress Â· `[ ]` not done

---

> ## Product principle — identity paths + always-fresh valuation
>
> **Confirmed 2026-07-09 (buyer screenshot + feedback); shipped 2026-07-10 (#48):** Entering a VIN on opportunity detail (e.g. `7MUCAAAG7NV022177`) decodes via Cox, fills catalog Make/Model/Series, and remounts valuation for fresh MMR/Max buy. Year may already be present from the listing.
>
> **Intuitive dual path (both must work):**
> 1. **VIN-first** — enter/save a valid VIN → decode → fill Y/M/M/(S) from Cox → persist → run **fresh** MMR + Max buy (item **48**).
> 2. **Y/M/M/S-first** — pick catalog year/make/model/series (no VIN or VIN later) → same fresh MMR + Max buy path (items **46**, valuation block).
>
> **Non-negotiable:** Whatever path the closer uses, the detail page must surface **current** MMR and Max buy — not stale saved cards when identity just changed, and not a blank valuation after VIN/YMM edits. Closers will not all work the same way; the app must not punish either path.
>
> **Rules for future identity/valuation work:**
> 1. After a successful VIN decode or Y/M/M/S save that changes valuation identity, auto-run (or clearly offer) live MMR + Max buy — do not require a separate tribal-knowledge “Refresh valuation” as the only path.
> 2. VIN decode must write Cox-catalog-compatible dropdown values (reuse `matchCatalogOption` / item **46** helpers) — orphan free-text in selects is a failure.
> 3. Failed decode/lookup: keep user input, show an error, do not clear YMM or wipe a prior good valuation (see **49** / **50**).
> 4. Prefer one shared “identity → valuation” pipeline for detail + MMR Lab so behavior stays consistent.
> 5. **Never invent odometer** (item **54**). If miles are unknown, leave them unknown — do not use 15k/year (or any) estimator for MMR, Max buy, or deal math. Send unknown / omit to Cox; keep **Mileage unknown** on the deal. Y/M/M/S from title is OK as a starting guess; fake miles are not.
> 6. **Miles are optional** for both MMR and Max buy. Asking price still required for Max buy. When miles are missing, Max buy uses mileage band `unknown` (already supported by `mileageBand(null)`); do not call `estimateMileage`.
> 7. Ingest / listing identity (year/make/model/style) must **persist and display** on detail end-to-end; blank Cox dropdowns while the queue shows wholesale is a bug (case/catalog match — **46** / **54**).

---

> ## ⚠ CRITICAL — NEVER ROUND MMR ADJUSTMENT DOLLAR VALUES
>
> **Do not round, truncate, or approximate any dollar figure in the MMR Adjustments panel.**
> Cox/Manheim returns exact cents-precision values for odometer, build-options, grade, color, and region adjustments.
> Any rounding — even to the nearest dollar — produces deltas that diverge from Manheim's native tool and mislead buyers.
>
> **Known violation history (2026-06-20):**
> - The intel worker's mileage cache key used a 5,000-mile bucket (`mileageBucket`), causing lookups at 5,000 and 5,800 miles to return the same cached Cox response. The user saw `+$3,000` (the cached 5,000-mile result) instead of the correct `+$2,560` for 5,800 miles.
> - **Fix deployed:** `deriveVinCacheKey` / `deriveYmmCacheKey` now use the exact mileage integer (no bucket) whenever the caller provides a real odometer value (`isInferred = false`).
>
> **Rules for all future work on MMR Lab:**
> 1. Cox adjustment values (`adjustedBy.Odometer`, `adjustedBy.buildOptions`, `adjustedBy.Grade`, etc.) must be forwarded to the frontend as-is — no `Math.round`, no `toFixed`, no division by 1,000.
> 2. The `nonZeroDelta` helper in `mmr-adjustment-display.ts` applies `Math.round` (nearest dollar) — this is acceptable only because Cox already returns whole-dollar integers; do not change it to round to larger increments.
> 3. Cache keys that include mileage must use the exact value for user-provided/listing-actual mileage. **Do not invent mileage** (item **54**). The old 5,000-mile bucket / 15k×year estimator must not be used to fabricate odometer for MMR or Max buy.
> 4. Any derived odometer adjustment (computed as `total − buildAdj` when Cox sends mileage as a string) is only as accurate as the underlying `adjustedPricing.wholesale.average`. If Cox rounds that value, our derived delta inherits the rounding — do not attempt to "correct" it with additional math.

---

## Context

**TAV-AIP** â€” internal buyer app for Texas Auto Value. Next.js in `web/`; API is a Cloudflare Worker in `src/` (proxied via `web/app/api/app/*`).

**This doc:** **Priority shift 2026-08-13** — **72** (MMR quality / identity accuracy) is the main ingest goal; **~59% MMR hit is not acceptable**. Supporting: **71** (dealer AI filter), **68–70** (Dallas FB throughput + token efficiency — shipped). **`SCRAPER_REVIEW_MODE` permanent** (2026-07-16). Also open: **51**, funnel soak items.

| Area | Path |
|------|------|
| Opportunities page | `web/app/(app)/opportunities/page.tsx` |
| New-mode client | `web/app/(app)/opportunities/_components/opportunities-client-new.tsx` |
| Queue tabs + summary | `web/app/(app)/opportunities/_components/opportunities-queue-tabs.tsx` |
| Table + columns | `web/app/(app)/opportunities/_components/opportunities-table-new.tsx` |
| Detail client | `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx` |
| Valuation block | `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx` |
| Client view filter | `web/lib/opportunities/view-filter.ts` |
| Page fetch + fallback | `web/lib/app-api/opportunities-page-fetch.ts` |
| Worker list + view rules | `src/persistence/opportunities.ts` |
| API route | `src/app/routes.ts` (`GET /app/opportunities`) |
| Column prefs | `web/lib/opportunities/table-preferences.ts` |
| Web CI Cursor rule | `.cursor/rules/web-ci-react-effects.mdc` (lint + typecheck before push) |

### Verify (after each item)

```bash
cd web && npm run lint && npm run typecheck && npm test
cd .. && npm run lint && npm run typecheck && npm test
```

---

## Active work

### Shipped this sprint (2026-07-06 → 2026-07-13)

| # | Item | Commit(s) | Notes |
|---|------|-----------|--------|
| **40–41** | Queue tab count/list parity (Needs action / Mine) | `6486776` | Server `total` + aligned Mine identity |
| **42** | **Received** timestamp column + sort | `6486776` | Default sort `received_desc` |
| **49** | VIN cleared on save | `fe50370` (+ CI follow-ups `c374bf3`, `5ead1cd`) | Local detail state from PATCH; during-render prop sync |
| **50** | Refresh valuation wipe | `fe50370` | Keep prior cards; restore on failure |
| **43** | Tab switch latency | `e55015b` | `staleTime` 60s, `placeholderData`, hover prefetch, tab spinner |
| **52** | Double-click / dead UI on tabs | `e55015b` | Optimistic tab selection; shell stays mounted |
| **48** | VIN → Y/M/M/S + fresh MMR/Max buy | `3dfd38a` | Decode on VIN blur/save → catalog fill + valuation remount |
| **45/47** | Flag/dismiss bad lead | `3ed1c8f` | Queue Flag → reason dialog → `bad_lead`; excluded from default views |
| **53** | Salesperson / Appraiser directory | `24db7a7`, `d557463` | Dropdowns + admin CRUD; roster `role = both` |
| **54** slices 1–2 | Max buy no invent + detail UX | `af362d7`, `9bc8bd3` | Null mileage / unknown band; saved ingest MMR; catalog case-match |
| **54** ingest | Stop inventing miles on MMR ingest | `43e921b` | Omit odometer; null snapshot mileage; docs |
| **44** | **Listed** date (seller post time) | `65d3b93` | `listing_date_ms` → `posted_at`; relative Listed column + detail |
| **55** Phase A | Scraper review queue soak | `f2328da`, `6722d08` | `SCRAPER_REVIEW_MODE` + tab; 120h window for item **56** backfill |
| **55** Phase B | Ingest listing→Cox Y/M/M/S before MMR | `b2064dd` | `resolveListingToCatalogForIngest`; deployed `tav-aip-production` `ccde935f` |
| **55** Phase C-a | Parser + variant signals + style soft-fail | `569b4885` | facebook adapter; `selectCatalogModelVariant`; style scoring in ingest |
| **55** Phase C-b | Offline catalog matcher + suggestions UI | `c9e40f47` | migration `0065`; `matchListingToCoxCatalog`; detail Apply + alias learning |
| **55** Phase C-b sync | Worker cron catalog tree sync | `d0cbae12` | retry-on-502 + skip bad models; **33,286 rows** (2016–2025) |
| **55** Phase C-b web | Suggestions UI on detail | Vercel `7WdvQ8t` | `tav-enterprise.vercel.app` — Apply + alias learning |
| **56** | Apify missed-run backfill + custom-task fix | `347ca3c` | `unmapped_task` fix; ~5k outage listings in Scraper review |

**Also:** Expanded buyer email backlog **47–53** + product principle (VIN + YMM paths, always-fresh valuation). Web-ci Cursor rule requires lint+typecheck before push.

### Still open

| # | Item | Priority | Status |
|---|------|----------|--------|
| **72** | **MMR quality — identity accuracy over alias speed** — `alias_hit` → `cox_no_data` recovery; §72 | **Critical** | [ ] opened 2026-08-13 |
| **68** | **Facebook Dallas throughput + fast validation** — main scraper focus; hours-not-days sign-off; §68 | **Critical** | [~] baseline + partial validation 2026-08-11 |
| **69** | **Dealer seller blacklist (pre-ingest)** — auto-add on `dealer` dismiss; Dallas FB only; **blocked on scraper seller fields**; §69 | **Critical** | [~] deployed `c786c54b`; verify blocked |
| **70** | **LLM token efficiency** — §70 shipped (offline-first, prune, tokens); staging `46ac09a2` prod `7cbd9844` | **High** | [~] credits out; partial §68 validation |
| **71** | **AI dealer listing detection (pre-ingest)** — text LLM + heuristics; complements §69; §71 | **High** | [ ] scoped 2026-08-13 |
| **55** | **Scraper review / ingest YMMS** — Phase D offline matcher 2026-08-11; staging `57cafd1c` prod `64c6ea94` | **High** | [~] |
| **51** | **Expand workflow statuses (buyer email #5)** — Bad Lead shipped as `bad_lead`; Purchased exists; fuller list pending from buyer | **High** | [~] |
| **58** | **UI/UX polish** — badges/KPI cards, detail two-column layout + claim banner + stepper, MMR Lab skeleton state | **Medium** | [ ] |
| **59** | **Max buy / YMMS linkage at ingest** — identity bridge + background evaluate on MMR hit; §59 (**shipped** `c49c49f`, prod `c244a655`; soak ongoing) | **High** | [~] |
| **60** | **LLM listing context (description + Apify fields)** — Phase A wired in code (description/condition/miles/location → Claude); deploy + funnel measure pending | **High** | [~] |
| **61** | **LLM auto-accept above 0.50 confidence** — ignore `needsReview`; §61 (**deployed, soak ongoing**) | **High** | [~] |
| **62** | **In-app listing mirror on detail** — photos + description + seller context; §62 (**v1 shipped**; multi-photo waits on Apify payload) | **High** | [~] |
| **63** | **Craigslist source adapter** — `parseCraigslistItem` + ingest routing shipped `bc09841`; scheduled ingest soak → §67 | **Medium** | [~] |
| **67** | **Apify CL automotive-scraper** — chunked ingest shipped; schedule still off; **deprioritized** vs §68; §67 | **Medium** | [~] |
| **64** | **Catalog 2013–2027 + MMR hit-rate lift** — shipped `b0eda58`; soak done (modest pre-2016 lift, overall flat ~73%); §64 | **Critical** | [~] |
| **65** | **LLM → offline matcher learning loop** — Phase 1 deployed prod `aadd46ef` (`834c9ac`); alias soak pending; §65 | **Medium** | [~] |
| **66** | **Anthropic prompt caching for item 57 Y/M/M/S** — shipped prod `aadd46ef`; cost soak pending; §66 | **High** | [~] |

**Full status board (incl. shipped):**

| # | Item | Priority | Status |
|---|------|----------|--------|
| **40** | **Needs action** tab — badge/summary shows `(1)` but table lists many rows | **Critical** | [x] |
| **41** | **Mine** tab — badge shows `(1)` but tab body is empty | **Critical** | [x] |
| **42** | **Lead received timestamp** — show when the lead came in; sort/filter by freshness | **Critical** | [x] |
| **43** | **Tab switch latency** — Needs action / Mine / Worth a look / All feel slow (~2s) after click | **High** | [x] |
| **44** | **Listing posted date** — **Listed** relative time from seller post (`listing_date_ms`); distinct from Received | **High** | [x] |
| **45** | **Dismiss opportunity** — right-side queue action with required reason; remove from active views | **High** | [x] |
| **46** | **Cox Y/M/M autofill** — map listing-parsed identity to Cox catalog tokens so MMR Lab / detail valuation can run without manual dropdown hunting | **High** | [x] |
| **47** | **Flag bad lead (buyer email #1)** — reason vocabulary: not a good lead, Title Issues, Dealer, etc.; filters out for everyone | **Critical** | [x] |
| **48** | **VIN → Y/M/M/S + fresh MMR / Max buy** — enter VIN → fill catalog Y/M/M/(S) + live valuation (confirmed UX 2026-07-09) | **Critical** | [x] |
| **49** | **VIN cleared on save (buyer email #3)** — VIN input empties after save | **Critical** | [x] |
| **50** | **Refresh valuation wipes results (buyer email #4)** — Refresh clears everything and returns nothing | **Critical** | [x] |
| **51** | **Expand workflow statuses (buyer email #5)** — Bad Lead + Purchased minimum; fuller list pending from buyer | **High** | [~] |
| **52** | **Double-click / app-wide action lag (buyer email #6)** — tabs and actions need 2 clicks; whole-app feel | **Critical** | [x] |
| **53** | **Salesperson / Appraiser lookup (buyer email #7)** — dropdown + admin add/remove (no free text) | **High** | [x] |
| **54** | **No guessed miles; persist YMM; optional miles for MMR + Max buy** — inventing odometer misleads deals; detail must show ingest identity + saved wholesale | **Critical** | [x] |
| **55** | **Scraper review / ingest YMMS** — Phase D offline matcher 2026-08-11; staging `57cafd1c` prod `64c6ea94`; funnel soak ongoing | **High** | [~] |
| **56** | **Apify missed-run backfill** — pull Apify datasets from the `unmapped_task` window into TAV (Scraper review; original Received times) | **Critical** | [x] |
| **57** | **LLM Y/M/M/S normalization via Claude API** — **`LLM_YMMS_ENABLED="true"`** staging + production since 2026-07-22; item **66** prompt caching prod `aadd46ef`; funnel/cost soak ongoing | **Critical** | [~] |
| **58** | **UI/UX polish** — Opportunities list, detail page, TAV MMR page (see §58) | **Medium** | [ ] |
| **59** | **Max buy / YMMS linkage at ingest** — identity bridge + background evaluate; §59 (**shipped** `c49c49f`; soak ongoing) | **High** | [~] |
| **60** | **LLM listing context — description + Apify text for item 57** — Phase A in code; see §60 | **High** | [~] |
| **61** | **LLM trust threshold — confidence > 0.50, ignore needsReview** — see §61; **deployed, soak ongoing** | **High** | [~] |
| **62** | **Listing mirror on opportunity detail** — Facebook-style photos + description in TAV; see §62 | **High** | [~] |
| **63** | **Craigslist ingest adapter** — `parseCraigslistItem` shipped `bc09841`; Apify bridge + soak → §67 | **Medium** | [~] |
| **67** | **Apify CL automotive-scraper eval + bridge** — chunked ingest shipped; schedule off; **deprioritized**; §67 | **Medium** | [~] |
| **68** | **Facebook Dallas throughput + fast validation** — main scraper focus; §68 | **Critical** | [~] partial validation 2026-08-11 |
| **69** | **Dealer seller blacklist (pre-ingest filter)** — auto-add on dealer dismiss; Dallas FB v1; scraper blocked; §69 | **Critical** | [~] deployed `c786c54b` |
| **70** | **LLM token efficiency** — §70 shipped; staging `46ac09a2` prod `7cbd9844` | **High** | [~] credits out; partial validation |
| **71** | **AI dealer listing detection (pre-ingest)** — text LLM + heuristics; §71 | **High** | [ ] scoped 2026-08-13 |
| **72** | **MMR quality — identity accuracy over alias speed** — §72 | **Critical** | [ ] opened 2026-08-13 |
| **64** | **Extend Cox catalog to 2013 + improve MMR hit rate** — shipped `b0eda58`; soak §64 | **Critical** | [~] |
| **65** | **LLM → offline matcher learning** — Phase 1 deployed prod `aadd46ef`; alias soak §65 | **Medium** | [~] |
| **66** | **LLM prompt caching (item 57 cost)** — shipped prod `aadd46ef`; §66 | **High** | [~] |

**Buyer email 2026-07-09 → item map:** #1→47 (+45) · #2→48 (+46) · #3→49 · #4→50 · #5→51 · #6→52 (+43) · #7→53

_Paused / parallel:_ UX backlog §4–7 (role nav, shell polish). Queue latency **43/52** done (web quick wins; Worker SQL push still optional if network remains slow).

---

## 40 — Needs action tab: count does not match table

**Reported:** 2026-07-06 (production New mode, `/opportunities`)

**Symptom:**

- Summary line: `1 need you · No new listings today`
- **Needs action** tab badge: `(1)`
- Clicking **Needs action** shows **many** rows (e.g. 7+ vehicles), not 1

**Expected:** Tab badge, summary line, and visible table rows must use the **same** filter rules and the **same** total.

### Likely root cause (code review 2026-07-06)

Tab counts and table body use **different code paths**:

| Surface | Source | File |
|---------|--------|------|
| Tab badge `(1)` | `extractTotal()` on count-only API response (`limit: 1`) | `opportunities-client-new.tsx` |
| Table rows | `displayResult` re-filters `result.data.items` client-side, then paginates | `opportunities-client-new.tsx` + `view-filter.ts` |

Comment in client already acknowledges drift: _"Always align table rows with the active tab (API count can differ from list body)."_

Additional split-brain risk:

- `fetchOpportunitiesPage` may **classic-fallback** to an unfiltered array and apply view rules in the browser (`opportunities-page-fetch.ts` + `shouldApplyClientViewFilter`).
- Count requests and list requests can therefore disagree on which rows match `needs_action`.
- Server view rules: `src/persistence/opportunities.ts` → `matchesNeedsAction` (uses workflow map).
- Client view rules: `web/lib/opportunities/view-filter.ts` → `matchesNeedsAction` (uses row fields only). Rules are intended to mirror but are not guaranteed identical after fetch/fallback.

`needs_action` definition (both tiers today): unassigned (`!assignedTo`), OR manual submission with `status` new/null, OR active claim expiring within 4h.

### Investigation steps

1. In browser devtools, compare network calls for tab load:
   - Count: `GET /api/app/opportunities?limit=1&offset=0&sort=spread_desc&view=needs_action`
   - List: same with `limit=25`
   - Confirm `data.total` vs `data.items.length` and whether items actually match `needs_action`.
2. Check whether list response is paginated `{ items, total, offset }` or legacy array (triggers client fallback).
3. Log how many rows pass `matchesNeedsAction` client-side vs server `total`.

### Fix direction

- **Single source of truth:** tab count must be derived from the **same filtered set** as the table (prefer server-side `total` on the list query; do not maintain a separate count query with different fetch behavior).
- Remove or narrow `displayResult` client re-filter if the Worker already applies `view=` correctly.
- If client fallback stays, count queries must use the **same** fallback path so `total` matches.
- Add regression tests: count === filtered row total for each view (`needs_action`, `mine`, `worth_a_look`).

### Primary files

- `web/app/(app)/opportunities/_components/opportunities-client-new.tsx`
- `web/lib/app-api/opportunities-page-fetch.ts`
- `web/lib/opportunities/view-filter.ts`
- `src/persistence/opportunities.ts`
- `web/lib/app-api/opportunities-page-fetch.test.ts`
- `web/app/(app)/opportunities/_components/opportunities-client-new.test.tsx`

### Exit criteria

- [ ] **Needs action** badge count equals number of rows on page 1 (and `data.total` from API)
- [ ] Summary line `N need you` matches **Needs action** badge
- [ ] Switching tabs does not show a full queue under a `(1)` badge
- [ ] Unit + integration tests lock count/list parity per view

---

## 41 — Mine tab: count shows 1, list empty

**Reported:** 2026-07-06 (production New mode, `/opportunities`)

**Symptom:**

- **Mine** tab badge: `(1)`
- Clicking **Mine** shows empty state: _"Nothing assigned to you yet"_
- User expects one assigned or claimed deal

**Expected:** If badge is `(1)`, exactly one row visible (or clear empty state with badge `(0)`).

### Likely root cause (code review 2026-07-06)

Same count-vs-list split as item **40**, plus a **Mine-specific identity mismatch**:

| Layer | `matchesMine` logic |
|-------|---------------------|
| Worker (`opportunities.ts`) | `row.assignedTo === viewerUserId` OR active claim where `workflow.claimedByUserId === viewerUserId` |
| Web (`view-filter.ts`) | `row.assignedTo === viewerUserId` OR active claim where `row.claimedBy === viewerDisplayName` |

Server count can match on **user id**; client list filter can drop the row if `claimedBy` on the row is a **user id string** (see `mapToOpportunityRow`: `claimedBy: claimedByName ?? claimedBy`) while the client compares **display name**.

`displayResult` always re-applies client `matchesMine` after fetch — so API can return `total: 1` while client filter yields **0 rows**.

`view=mine` also requires `GET /app/me` before fetch (`enabled: view !== "mine" || meQuery.isSuccess`) — verify `viewerUserId` / `viewerDisplayName` passed consistently to count and list queries via `viewerFetchOptions`.

### Investigation steps

1. Identify the row the server counts as "mine" (assigned vs claimed; user id vs display name).
2. Compare `assignedTo`, `claimedBy`, `claimExpiresAt` on that row to signed-in `getAppMe` payload.
3. Confirm count query and list query both pass the same `viewerUserId` / `viewerDisplayName` headers/options.

### Fix direction

- Align client `matchesMine` with server: match **user id** for claims (`claimedByUserId`), not display name only.
- Ensure `claimedBy` on `OpportunityRow` is unambiguous (separate `claimedByUserId` + `claimedByName` if needed).
- Derive tab badge from list `total` after unified filter (same as item 40).

### Primary files

- `web/lib/opportunities/view-filter.ts`
- `src/persistence/opportunities.ts` (`matchesMine`, `mapToOpportunityRow`)
- `web/app/(app)/opportunities/_components/opportunities-client-new.tsx`
- `web/lib/opportunities/view-filter.test.ts`

### Exit criteria

- [ ] Assign deal to signed-in closer → **Mine** shows `(1)` and one row
- [ ] Claim deal → **Mine** shows row for claim owner
- [ ] Badge `(0)` when nothing assigned/claimed (no false `(1)`)
- [ ] Tests cover assignee-by-id and claim-by-id (not display-name-only)

---

## 42 — Lead received timestamp (freshness)

**Reported:** 2026-07-06 — **critical for buyer workflow**

**Symptom:**

- New-mode Opportunities table has no visible **when did this lead arrive?** column
- Buyers cannot tell which leads are freshest; default sort is `spread_desc`, not arrival time
- `lastSeenAt` exists but is **hidden by default** in column picker and reflects **last scrape**, not lead creation

**Expected:** Buyers can see and sort by when the opportunity became actionable (lead received / first surfaced), newest first.

### Data model notes

| Field | Source today | Meaning |
|-------|----------------|---------|
| `firstSeenAt` | `normalized_listings.first_seen_at` | First time listing was ingested |
| `lastSeenAt` | `normalized_listings.last_seen_at` | Last scrape (updates on re-ingest) |
| `leads.created_at` | **Not exposed** on `OpportunityRow` | When lead record was created — closest to "lead came in" |

Manual submissions have `manual_opportunity_submissions.created_at` — also not on queue row today.

### Product decision (confirm at implementation)

| Option | Label | Sort | Best for |
|--------|-------|------|----------|
| A (recommended) | **Received** | `leads.created_at` (or manual `created_at`) | "When we decided this is a lead" |
| B | **First seen** | `first_seen_at` | When listing first hit the system |
| C | Both | Two columns | Power users; may be noisy |

Default queue sort for **Needs action** / **All** should likely be **newest received first**, not spread.

### Implementation sketch

1. Worker: add `receivedAt` (or `leadCreatedAt`) to `OpportunityRow` in `mapToOpportunityRow` from `lead.created_at`, else manual submission `created_at`, else `first_seen_at` fallback.
2. Web schema: extend `OpportunityRow` in `web/lib/app-api/schemas.ts`.
3. Table: add **Received** column — **visible by default** in `table-preferences.ts`.
4. Sort: add `received_desc` (or `lead_created_desc`) to `OPPORTUNITY_SORTS` in Worker + sort dropdown in New table.
5. Optional: show relative time in Vehicle cell ("2h ago") for scan speed.

### Primary files

- `src/persistence/opportunities.ts` (`LEAD_COLUMNS`, `mapToOpportunityRow`, `sortOpportunityRows`)
- `src/app/routes.ts` (`OPPORTUNITY_SORTS`)
- `web/lib/app-api/schemas.ts`
- `web/lib/opportunities/table-preferences.ts`
- `web/app/(app)/opportunities/_components/opportunities-table-new.tsx`
- `test/app.routes.test.ts` / `web/app/(app)/opportunities/_components/opportunities-table-new.test.tsx`

### Exit criteria

- [ ] **Received** (or agreed label) column visible by default on New-mode queue
- [ ] Timestamp reflects lead creation for `type=lead` rows (verified against Supabase `tav.leads.created_at`)
- [ ] Manual submissions show submission time
- [ ] Sort **Newest first** available and documented; consider making it default for `needs_action`
- [x] Tooltip explains difference vs "Last seen" if both shown

---

## 43 — Tab switch latency (queue feels slow)

**Reported:** 2026-07-06 (production New mode, `/opportunities`) — **fixed 2026-07-09** (`e55015b`)

**Symptom (before fix):**

- Clicking **Needs action**, **Mine**, **Worth a look**, or **All** waits ~1–3 seconds before the table updates
- UI feels unresponsive during the gap (no instant feedback or stale rows held in place)
- Buyers switching tabs frequently notice the pause on every click

**Expected:** Tab switch feels **instant** — previous rows stay visible with a light loading state, or cached data shows immediately while revalidating in the background. Target: perceived switch **&lt; 200ms**; network refresh can complete asynchronously.

### Likely contributors (code review 2026-07-06)

| Layer | What happens today | File |
|-------|-------------------|------|
| **Tab click** | `router.replace` updates `?view=` → new React Query key → **fresh fetch** every switch | `opportunities-client-new.tsx` |
| **List query** | No `staleTime` / `placeholderData` on main list query (unlike summary queries at 60s) | `opportunities-client-new.tsx` |
| **Network path** | Browser → Next `/api/app/opportunities` → Cloudflare Worker → Supabase (full round trip per tab) | `web/app/api/app/*`, `src/app/routes.ts` |
| **Worker assembly** | `listOpportunities` with `view=` fetches up to **500** listings, then joins valuations, leads, manual submissions, workflow, maxbuy summaries, filters in memory, sorts, paginates | `src/persistence/opportunities.ts` |
| **Parallel load on mount** | Four extra summary queries (tab counts + new-today) compete for Worker/DB on first paint | `opportunities-client-new.tsx` (`useQueries`) |
| **No prefetch** | Hovering a tab does not warm the cache for that view | — |

### Investigation steps

1. DevTools **Network**: measure `GET /api/app/opportunities?view=…` duration per tab switch (TTFB + total). Compare views.
2. DevTools **Performance**: confirm table unmounts or shows blank vs keeps previous rows during fetch.
3. Worker logs / Supabase: check whether latency is DB-bound (large `normalized_listings` scan + N joins) or Worker CPU (in-memory filter on 500 rows × 4 views).
4. Repeat after cache warm (second click on same tab) — if still slow, caching is not helping.

### Fix direction (pick smallest wins first)

**Web (quick wins):**

- `placeholderData: keepPreviousData` (TanStack Query v5: `placeholderData: (prev) => prev`) on the list query so rows don't disappear while refetching
- Add `staleTime` (e.g. 30–60s) on list queries so revisiting a tab serves cache immediately
- **Prefetch** adjacent tabs on hover/focus (`queryClient.prefetchQuery` with each `view`)
- Show subtle **tab-level loading** indicator (spinner on active tab or table overlay) so the wait is visible, not a dead UI
- Consider `router.replace` + `startTransition` to avoid blocking paint

**API / Worker (if network is the bottleneck):**

- Reduce `MAX_FETCH` work for view-filtered requests or push `view` filters closer to SQL (assigned_to, claim expiry) instead of assembling 500 rows then filtering in memory
- Dedicated **count-only** endpoint or `?countOnly=true` so summary badges don't each trigger full assembly
- Index / query plan review on `normalized_listings.last_seen_at`, `leads.assigned_to`, workflow tables
- Optional short-lived **edge cache** for paginated queue responses (careful with auth + mine view)

**Do not:**

- Re-introduce client-side double-filtering (items 40–41 regression risk)

### Primary files

- `web/app/(app)/opportunities/_components/opportunities-client-new.tsx`
- `web/app/(app)/opportunities/_components/opportunities-queue-tabs.tsx`
- `web/lib/app-api/opportunities-page-fetch.ts`
- `web/lib/query.ts` (`queryKeys.opportunitiesPage`)
- `src/persistence/opportunities.ts` (`listOpportunities`, `MAX_FETCH`)
- `src/app/routes.ts`

### Exit criteria

- [x] Tab switch keeps previous table visible during refetch (no empty flash) — `placeholderData` on list query
- [x] Second visit to same tab within 60s renders from cache — `staleTime: 60_000`
- [ ] Measured p95 tab-switch perceived latency &lt; 500ms on production (or documented baseline + improvement) — verify after deploy
- [x] Prefetch or staleTime documented; no client double-filter regression (items 40–41)
- [x] Hover/focus prefetch warms Mine / Worth a look / All

**Fix (2026-07-09):** Optimistic `view` state + `startTransition(router.replace)`; list `staleTime` 60s + ok-only `placeholderData`; tab spinner while placeholder refetching; hover prefetch. Do not unmount queue shell when `query.data` is briefly undefined.

---

## 44 — Listing posted date (when seller listed on marketplace)

**Reported:** 2026-07-08 (production New mode, `/opportunities`)  
**Decided:** 2026-07-11 (Apify run analysis + buyer preference)  
**Shipped:** 2026-07-11 — ingest + queue **Listed** + detail; new Facebook ingests only (no historical backfill)

**Symptom:**

- Queue shows **Received** as an absolute datetime (when TAV surfaced the lead) but not **when the seller originally posted** the Facebook listing
- Buyers reviewing scraper leads cannot tell if a vehicle was listed 20 minutes ago vs 3 days ago on the marketplace itself
- `lastSeenAt` is hidden by default and reflects last scrape, not seller post time

**Expected:** Queue shows **Listed** as relative time (e.g. `3 hours ago`, `just now`) from the marketplace post timestamp, with the exact datetime on hover. Distinct from **Received**.

### Confirmed data (2026-07-11 Apify check)

Actor: `raidr-api/custom-vehicle-scraper`.

| Apify field | Meaning | Available when detail OFF? |
|-------------|---------|----------------------------|
| **`listing_date_ms`** | Seller listing post time (epoch ms) — **use this** | **Yes** (present on search results) |
| `listing_date` | Same time, epoch seconds | Yes |
| `extraListingData.creation_time` | Detail-mode twin (~same as `listing_date_ms`) | Only when `fetchDetailedItems: true` |
| `_fetchedAt` | When the scraper fetched the item | Yes — **not** post time |
| Our `first_seen_at` / Received | When TAV ingested / surfaced | Yes — **not** post time |

Example ([Honda Civic listing](https://www.facebook.com/marketplace/item/1030036669435233/)): `listing_date_ms` → `2026-07-11T06:14:23Z` (~“3 hours ago” on FB); `_fetchedAt` → `06:30Z`; our `posted_at` was **null** before this fix.

**Do not depend on detail mode for Listed date** — `listing_date_ms` is enough. Detail mode is optional for description/condition.

### Data model notes

| Field | Source today | Meaning | Exposed on queue? |
|-------|----------------|---------|-------------------|
| `receivedAt` | `leads.created_at` / manual submission / `first_seen_at` fallback | When TAV made this actionable | ✅ Yes (item 42) — keep |
| `firstSeenAt` | `normalized_listings.first_seen_at` | First ingest into TAV | Hidden by default |
| `lastSeenAt` | `normalized_listings.last_seen_at` | Last scrape | Hidden by default |
| `posted_at` | `normalized_listings.posted_at` ← Apify `listing_date_ms` | **Seller listing post time** | ✅ **Listed** column |

**Ingest gap (fixed 2026-07-11):** `payloadAdapter.ts` already mapped `listing_date_ms` → `postedAt`; `parseFacebookItem` now copies `postedAt` / `posted_at` / `listedAt` into `NormalizedListingInput.postedAt` so `p_posted_at` persists.

### Product decision (locked 2026-07-11)

| Choice | Decision |
|--------|----------|
| Primary queue clock | **Listed** = seller post time (`posted_at` ← `listing_date_ms`) |
| Display format | **Relative** via existing `formatRelativeTime` — `just now`, `5 minutes ago`, `3 hours ago` |
| Exact time | Tooltip (and detail page) shows absolute datetime |
| Received | Keep available (column or detail) — “when TAV got it”; not the main glance metric |
| Sort | `posted_desc` available in sort dropdown |

Tooltip copy: **Listed** = when the seller posted on Facebook; **Received** = when TAV created/surfaced the opportunity.

### Implementation sketch

1. **Ingest:** ✅ `parseFacebookItem` passes `postedAt` into `NormalizedListingInput`
2. **Worker:** ✅ expose `postedAt` on `OpportunityRow` / `OpportunityDetail` from `normalized_listings.posted_at`
3. **Web schema:** ✅ `postedAt` on `OpportunityRow`
4. **Table:** ✅ **Listed** column — relative + absolute tooltip
5. **Sort:** ✅ `posted_desc`
6. **Detail:** ✅ Listed + Received on listing block
7. **Backfill:** new ingests only (optional Apify backfill later)

### Primary files

- `src/sources/facebook.ts` (`parseFacebookItem` — persist posted time)
- `src/apify/payloadAdapter.ts` (already maps `listing_date_ms` → `postedAt`)
- `src/persistence/opportunities.ts` (`LISTING_COLUMNS`, `mapToOpportunityRow`, sorts)
- `src/app/routes.ts` (`OPPORTUNITY_SORTS`)
- `web/lib/app-api/schemas.ts`
- `web/lib/format.ts` (`formatRelativeTime`)
- `web/lib/opportunities/table-preferences.ts`
- `web/app/(app)/opportunities/_components/opportunities-table-new.tsx`
- `web/app/(app)/opportunities/_components/opportunity-listing-block.tsx`

### Exit criteria

- [x] `posted_at` populated on **new** Facebook ingests (verify in Supabase after ingest fix)
- [x] **Listed** column shows relative time (e.g. `3 hours ago`) for scraper leads
- [x] Hover/tooltip shows exact datetime
- [x] Distinct from **Received** — copy documents both
- [x] Manual submissions / missing source post time show `—` (no fake timestamp)
- [x] Does **not** require `fetchDetailedItems` to be on

---

## 45 — Dismiss opportunity with reason (queue right-side action)

**Reported:** 2026-07-08 (production New mode, `/opportunities`) — **no code change yet**

**Symptom:**

- No quick way to **pass/dismiss** a row from the queue without opening detail
- Right-side row actions today are only **View listing** (external link) and **Claim** (`opportunity-row-actions-new.tsx`)
- Workflow supports `passed` via `POST /app/opportunities/:id/status` on the **detail** page, but there is no reason capture and no one-click dismiss from the table

**Expected:** A **Dismiss** control on the right side of each queue row. Clicking opens a lightweight prompt (modal or popover) requiring the user to pick **why** before the row leaves the active queue.

### Product decisions (confirm at implementation)

**Dismiss behavior:**

- Row moves to a terminal/suppressed workflow state (likely `passed` or new `dismissed` — see below)
- Default queue views (`needs_action`, `mine`, `worth_a_look`, `all`) **exclude** dismissed rows
- Action is **audited** in `tav.opportunity_actions` with actor, timestamp, and selected reason

**Reason vocabulary (starter set — confirm with buyers):**

| Reason code | Label | Example use |
|-------------|-------|-------------|
| `wrong_vehicle` | Wrong vehicle type | Motorcycle, commercial, parts car |
| `bad_price` | Price out of range | Above ceiling / unrealistic |
| `bad_condition` | Condition concerns | Salvage, obvious issues in photos |
| `too_far` | Too far / wrong market | Outside buy radius |
| `duplicate` | Duplicate | Already working same VIN/listing |
| `not_interested` | Not interested | Generic pass |
| `other` | Other | Requires free-text note (min length?) |

**Status mapping options:**

| Option | Pros | Cons |
|--------|------|------|
| A (recommended) | Reuse `passed` + store `dismiss_reason` in action `metadata` | "Passed" may conflate buyer-contacted-pass vs queue-dismiss |
| B | Add `dismissed` to `MUTATABLE_WORKFLOW_STATUSES` + DB enum | Migration + filter updates |
| C | `archived` with reason metadata | Semantically muddy |

Recommend **A** for v1 unless buyers need a separate "contacted then passed" vs "never looked" distinction in reporting.

### Implementation sketch

1. **UI — queue row:** add Dismiss button to `OpportunityRowActionsNew` (icon + label; stop row click propagation).
2. **UI — reason picker:** `DismissOpportunityDialog` — radio list of reasons; optional note for `other`; Confirm disabled until reason selected.
3. **API:** either extend `POST /app/opportunities/:id/status` body with optional `reason` + `notes`, or add `POST /app/opportunities/:id/dismiss` that sets status + writes action atomically.
4. **Worker:** `opportunityWorkflow.ts` — validate reason code; write `OpportunityActionRecord` with `action: "status_changed"`, `metadata: { reason, previousStatus }`; enforce `canMutateWorkflow` (claim owner, assignee, or admin).
5. **List filters:** ensure `matchesNeedsAction` / default views exclude terminal statuses (`passed` already in `TERMINAL_WORKFLOW_STATUSES`).
6. **Optimistic UI:** remove row from table on success; invalidate tab counts.
7. **Admin/reporting (later):** filter by dismiss reason in a suppressed/closed view.

### Primary files

- `web/app/(app)/opportunities/_components/opportunity-row-actions-new.tsx`
- `web/app/(app)/opportunities/_components/opportunities-table-new.tsx`
- `web/app/(app)/opportunities/_components/opportunities-client-new.tsx` (mutation + cache invalidation)
- `web/lib/app-api/client.ts` (`updateOpportunityStatus` or new dismiss endpoint)
- `src/app/routes.ts` (`POST /app/opportunities/:id/status` or `/dismiss`)
- `src/persistence/opportunityWorkflow.ts`
- `docs/02-product/v2-opportunities.md` (closed/suppressed states §6)

### Exit criteria

- [x] Dismiss button visible on queue rows for users with mutate permission
- [x] Cannot dismiss without selecting a reason
- [x] Dismissed row disappears from **Needs action** / **All** default views immediately
- [x] `tav.opportunity_actions` row records reason + actor + timestamp
- [x] Detail page action history shows dismiss event
- [x] Tests: API validation (missing reason → 400), filter exclusion, permission gates

---

## 46 — Cox Y/M/M autofill for MMR evaluation

**Reported:** 2026-07-08 (production opportunity detail + MMR Lab)

**Status:** **Complete 2026-07-11** — Phase A case-match + Phases B–D (`resolveListingToCatalog`, **Use listing identity**, Open in MMR Lab prefill).

**Symptom (original):**

- Listing-parsed year/make/model from Facebook titles (e.g. `2018 Kia Sportage FE` → make `kia`, model `sportage fe`) does not always match **Cox/Manheim catalog tokens** required for `POST /app/mmr/ymm`
- Buyers must manually hunt Y/M/M/S dropdowns on the Vehicle block or MMR Lab even when the listing already has usable identity
- MMR lookup fails or returns wrong trim when free-text model strings are not Cox-canonical (known pain: verbose trim in title, non-catalog makes)

**Expected:** On opportunity detail (and optionally MMR Lab prefill), **autofill** year/make/model/style inputs with the closest **Cox-ingestible** values so one click (or auto on load) can run MMR and return wholesale adjustments.

### What exists today

| Piece | Status | File |
|-------|--------|------|
| Cox catalog dropdowns (Y/M/M/S) | ✅ | `opportunity-vehicle-block.tsx`, `use-vehicle-catalog.ts` |
| `matchCatalogOption` / `pickCatalogOptionFuzzy` | ✅ | `use-vehicle-catalog.ts` |
| `resolveListingToCatalog` | ✅ | Fuzzy model + style inference + drivetrain variants |
| Case-match on load | ✅ | Vehicle block (item 54) |
| **Use listing identity** | ✅ | Apply + PATCH + valuation remount |
| Open in MMR Lab | ✅ | Catalog-canonical `?year=&make=&model=&style=` or `?vin=` |
| Manual submit parse match | ✅ | Uses `resolveListingToCatalog` via `resolveParsedVehicleFields` |

### Exit criteria

- [x] Opening a lead with exact case-insensitive make/model (e.g. `honda` / `odyssey`) pre-selects Cox catalog tokens on Vehicle block
- [x] Opening a lead with `2018 Kia Sportage FE` (verbose model/trim) pre-fills Cox make/model/style via **Use listing identity**
- [x] MMR YMM lookup uses autofilled catalog tokens (or clear no-match error) — not silent wrong trim
- [x] User sees when autofill changed parser output vs Cox canonical (badge / inline diff)
- [x] Manual override still works; autofill never locks fields
- [x] Tests: `matchCatalogOption` / `resolveListingToCatalog` + Vehicle block apply flow
- [x] MMR Lab prefill parity (Open in MMR Lab with canonical tokens)

---

## Buyer feedback — 2026-07-09

Email from buyer (paraphrased). Map to items **47–53**. Overlaps with **43**, **45**, **46** called out per item.

| Email # | Ask | Item | Overlaps |
|---------|-----|------|----------|
| 1 | Flag deal: not a good lead, Title Issues, Dealer, etc. — filter out for everyone | **47** | **45** (dismiss w/ reason) |
| 2 | Enter VIN → year/make/model/(series) populate | **48** | **46** (listing→Cox catalog) |
| 3 | VIN cleared on save | **49** | — |
| 4 | Refresh valuation clears everything / returns nothing | **50** | item 38 refresh path |
| 5 | Expand workflow (Bad Lead, Purchased min; fuller list TBD) | **51** | **45/47** status mapping |
| 6 | Slow + double-click to execute (tabs + whole app) | **52** | **43** (tab latency) |
| 7 | Salesperson / Appraiser dropdown + admin CRUD | **53** | — |

---

## 47 — Flag bad lead / not a good lead (shared filter)

**Reported:** 2026-07-09 (buyer email #1)

**Symptom:**

- No way to mark a deal as a bad lead (not a good lead, Title Issues, Dealer, etc.) so **other buyers stop seeing it**
- Today closers can only pass/dismiss from detail workflow (limited statuses); queue has no shared “filter out for everyone” action with a reason vocabulary buyers asked for

**Expected:** One-click (or short dialog) to flag a lead with a required reason. Flagged leads leave default queue views for **all** users and remain auditable.

### Relationship to item 45

Item **45** already scopes “Dismiss with reason” on the queue row. **47** is the product vocabulary + shared-filter confirmation from buyers:

| Reason (buyer language) | Suggested code | Notes |
|-------------------------|----------------|-------|
| Not a good lead | `not_a_good_lead` | Generic pass |
| Title Issues | `title_issues` | Title/lien/brand problems |
| Dealer | `dealer` | Dealer listing / wholesale flip |
| _(from 45 starter set)_ | `wrong_vehicle`, `bad_price`, `bad_condition`, `too_far`, `duplicate`, `other` | Keep unless buyers reject |

Implement **45 + 47 together** as one dismiss/flag feature: same UI, expanded reason list, same “exclude from active views for everyone” behavior.

### Product decisions (confirm)

- Status: reuse `passed` + reason in `opportunity_actions.metadata` (item 45 option A), **or** add `bad_lead` as first-class status (aligns with item **51**)
- Queue views: `needs_action` / `mine` / `worth_a_look` / `all` exclude flagged rows; optional later “Suppressed / Bad leads” admin view
- Who can flag: claim owner, assignee, or admin (same as `canMutateWorkflow`)

### Primary files

- Same as item **45** (`opportunity-row-actions-new.tsx`, dismiss dialog, `opportunityWorkflow.ts`, list filters)
- `docs/02-product/v2-opportunities.md` — closed/suppressed states

### Exit criteria

- [x] Buyer can flag with at least: Not a good lead, Title Issues, Dealer (+ other agreed reasons)
- [x] Flagged row disappears from default queue views for **all** users (not just actor)
- [x] Action audited with reason + actor + timestamp
- [x] Cannot submit without a reason
- [x] Tests: filter exclusion + permission + missing reason → 400

**Follow-up (2026-08-11):** Item **69** — extend `dealer` dismiss to **auto-add seller to pre-ingest blacklist** (Dallas Facebook v1). See §69.

---

## 48 — VIN entry populates Y/M/M/S + fresh MMR / Max buy

**Reported:** 2026-07-09 (buyer email #2) · **Reconfirmed:** 2026-07-09 screenshot — VIN `7MUCAAAG7NV022177` entered; Year `2021` from listing; Make/Model/Series still “Select…”; no auto valuation refresh.

**Shipped:** 2026-07-10 — VIN blur/save decodes via `POST /app/mmr/vin` → `hydrateVinAutofill` catalog Y/M/M/S → PATCH → Valuation block remounts on identity change for fresh MMR + Max buy.

**Should it autofill + value today?** **Yes** (after this ship). VIN save persists the VIN string (#49) and now also fills catalog identity + remounts valuation.

**Symptom (before fix):**

- Closer enters VIN, expects **year, make, model, and sometimes series** to fill and **MMR + Max buy** to update
- Vehicle block saved VIN as text only; Y/M/M/S stayed empty or listing-only until manual catalog picks
- Cox VIN MMR (`POST /app/mmr/vin`) already returned identity on the valuation path, but did **not** write back into Vehicle dropdowns or auto-trigger after VIN save

**Expected:**

1. Valid VIN on blur/save (or Decode) → Cox decode → Y/M/M/(S) filled with **catalog** values (“From VIN” badge when changed).
2. Same action → **fresh** MMR + Max buy on the Valuation block (not only after tribal “Refresh valuation”).
3. Y/M/M/S-only path still works without a VIN (product principle).

### Relationship to item 46

| Path | Source of identity | Item |
|------|--------------------|------|
| Listing title / parser → catalog match | Facebook/scraper YMM | **46** |
| VIN → Cox decode → catalog match + live valuation | User-entered VIN | **48** |

Ship **48** as VIN-driven; reuse `matchCatalogOption` / `resolveParsedVehicleFields` from **46** so both land on the same Cox tokens. Wire valuation remount/refresh after identity PATCH so Max buy/MMR stay current.

### Implementation (shipped)

1. On VIN blur/save (11–17 char valid): `decodeVinToVehicleSelection` → `POST /app/mmr/vin` + `hydrateVinAutofill`.
2. Set Vehicle block fields; “From VIN” status when filled; persist via existing Save → PATCH.
3. Detail client remounts Valuation block when vin/year/make/model/style/mileage change.
4. Failed decode: keep VIN + existing YMM, show inline error; still PATCH VIN if dirty (#49 / #50).

### Primary files

- `web/app/(app)/opportunities/_components/decode-vin-to-vehicle.ts`
- `web/app/(app)/opportunities/_components/opportunity-vehicle-block.tsx`
- `web/app/(app)/opportunities/_components/use-vehicle-catalog.ts`
- `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx` (valuation identity key)
- `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx` (auto-run after remount)
- `web/app/(app)/mmr-lab/_components/hydrate-vin-autofill.ts`
- `web/lib/app-api/client.ts` (`postMmrVin`)
- `src/app/routes.ts` (`POST /app/mmr/vin`)

### Exit criteria

- [x] Known-good VIN fills Year/Make/Model; Series when Cox provides trim/style
- [x] Values match Cox catalog options (dropdowns selected, not orphan free text)
- [x] After VIN save/decode, MMR + Max buy refresh to current results without requiring a separate manual hunt
- [x] Y/M/M/S-only edits still produce fresh valuation when identity is sufficient _(valuation remount key includes YMM)_
- [x] Failed decode does not wipe VIN, existing YMM, or last good valuation
- [x] Tests: mock VIN → fields + valuation triggered; invalid VIN → no silent clear

---

## 49 — VIN cleared on save (bug)

**Reported:** 2026-07-09 (buyer email #3) — **fixed 2026-07-09** (`fe50370`)

**Symptom (before fix):**

- User enters VIN on opportunity detail Vehicle block
- On **Save** (Vehicle block still has explicit Save — commit `4828361`), the VIN field **clears**

**Expected:** VIN remains visible and persisted after save; reload shows same VIN.

### Likely investigation areas (code review 2026-07-09)

| Layer | Check |
|-------|--------|
| PATCH body | `opportunity-vehicle-block.tsx` — `patch.vin = values.vin.trim() \|\| null` |
| Worker PATCH | `src/app/routes.ts` / opportunity patch handler — does VIN write to `normalized_listings`? |
| Response mapping | Detail remount / `patchRevision` — does GET omit `vin` or map null? |
| Catalog cascade | Y/M/M/S Save path (`4828361`) — does cascade reset wipe `values.vin`? |
| Controlled input | Local state reset from `opportunity.vin` after parent refresh with stale/null VIN |

### Fix direction

1. Reproduce with network tab: confirm PATCH includes `vin`, response/detail refetch returns `vin`.
2. If API drops VIN → fix persistence mapping.
3. If API OK but UI clears → fix local state / `key={patchRevision}` remount using stale props; preserve VIN across catalog clears.

### Primary files

- `web/app/(app)/opportunities/_components/opportunity-vehicle-block.tsx`
- `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx`
- Worker opportunity PATCH + `mapToOpportunityDetail` / listing columns
- Tests: vehicle block save round-trip keeps VIN

### Exit criteria

- [x] Enter VIN → Save → field still shows VIN
- [x] Hard refresh still shows VIN _(persisted via PATCH; client applies response before remount)_
- [x] Regression test: PATCH + remount does not clear VIN
- [x] No interaction with empty-string → null that re-seeds input as blank incorrectly

**Fix (2026-07-09):** `OpportunityDetailClientNew` keeps local `opportunity` state from PATCH responses and remounts form blocks from that copy — not stale SSR `initial`. Evaluate-on-open no longer overwrites local vehicle fields.

---

## 50 — Refresh valuation clears everything / returns nothing (bug)

**Reported:** 2026-07-09 (buyer email #4) — **fixed 2026-07-09** (`fe50370`)

**Symptom (before fix):**

- On opportunity detail Valuation block, **Refresh valuation** clears MMR / Max buy UI and ends with **empty / nothing** instead of refreshed numbers
- Related history: item **38** (Max buy refresh) and compact cards (item **33**); commit `ffbb88d` / `4e8281f` touched refresh + cache bypass

**Expected:** Refresh keeps prior summary visible (or loading overlay), then replaces with new MMR + Max buy results. On failure, show error and **retain last good result** (do not wipe to blank).

### Likely investigation areas

| Layer | Check |
|-------|--------|
| Loading state | `opportunity-valuation-block.tsx` — `setView({ kind: "loading" })` may unmount cards with no placeholder |
| Identity gate | Refresh runs but `identitySufficientForMmrAutoRun` fails after vehicle remount (VIN cleared — **49**) |
| `refresh_valuation` | VIN/YMM request flag + intel cache bypass; empty/error envelope handling |
| Max buy | Live evaluate fails → both cards blanked together |
| Session | `session === null` after refresh path resets MMR session |

### Fix direction

1. Reproduce with VIN present and with VIN missing (isolate **49** coupling).
2. Keep previous `view` / summary as `placeholderData` while refresh in flight; only replace on success.
3. On error: toast + restore last ok view; never leave permanent empty.
4. Ensure Refresh sends same identity (VIN or Y/M/M/S) that auto-run would use.

### Primary files

- `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx`
- `web/app/(app)/mmr-lab/_components/build-mmr-recompute-request.ts`
- `web/lib/app-api/client.ts` (MMR + maxbuy evaluate)
- `opportunity-valuation-block.test.tsx` (extend: refresh failure keeps prior; refresh success updates)

### Exit criteria

- [x] Refresh with valid identity returns MMR + Max buy (not blank)
- [x] During refresh, UI does not flash to empty with no recovery _(recomputing keeps prior cards)_
- [x] Failed refresh shows error and keeps last successful valuation
- [x] Still works when only VIN or only Y/M/M/S identity is present
- [x] Tests cover success + failure paths

**Fix (2026-07-09):** Refresh with a prior ok MMR result uses recomputing (not blank loading skeletons). On MMR/Max buy failure, restore prior view + toast instead of wiping.

---

## 51 — Expand workflow statuses (Bad Lead, Purchased, …)

**Reported:** 2026-07-09 (buyer email #5) — **full list TBD from buyer**

**Symptom:**

- Stepper today is roughly **Found → Working → Contacted → Appraised** (item **30**); mutatable statuses in Worker are limited (`contacted`, `purchased`/`bought`, `passed`, etc. — see `MUTATABLE_WORKFLOW_STATUSES`)
- Buyers want a richer pipeline. Off-the-cuff list:

```
Found → Working → Bad Lead → Contacted → Appraised →
Not Negotiable/Overpriced → Purchased → In Scheduling →
Delivered → At Auction → Sold
```

**Minimum for v1 (buyer):** **Bad Lead** + **Purchased** (Purchased may already exist as `purchased` / UI “Mark bought” — confirm label + visibility on queue/detail).

**Expected:** Workflow can represent at least Bad Lead and Purchased clearly; fuller enum after buyer provides final list.

### Product decisions (confirm before coding)

| Topic | Options |
|-------|---------|
| Bad Lead vs Passed | **Resolved:** first-class `bad_lead` + dismiss reasons (**45/47**). Keep `passed` as separate “Passed” for now. |
| Stepper vs status | Linear stepper may not fit branches (Bad Lead / Overpriced). Prefer **happy-path stepper** + **status dropdown** for branches/terminals. |
| Wait for final list? | **Minimum done.** Fuller enum blocked on buyer checklist below — do not invent statuses. |

### Buyer checklist (send before coding fuller enum) — drafted 2026-07-10

For each proposed status, buyer confirms: **keep?** · **exact label** · **active in queue** vs **drop out of default queues** · **needs reason?**

| Proposed label | Keep? | Queue | Reason? | Notes / map to existing |
|----------------|-------|-------|---------|-------------------------|
| Found | | active / drop | | Likely = new / unworked |
| Working | | active / drop | | Likely = reviewed / claimed |
| Bad Lead | Y (shipped) | drop | Y (shipped) | `bad_lead` |
| Contacted | | active / drop | | exists as `contacted` |
| Appraised | | active / drop | | may need new code vs stepper-only |
| Not Negotiable / Overpriced | | active / drop | | new? or dismiss reason? |
| Purchased | Y (shipped) | drop | | `purchased` — UI still says “Bought” in places |
| In Scheduling | | active / drop | | new |
| Delivered | | active / drop | | new |
| At Auction | | active / drop | | new |
| Sold | | active / drop | | exists in DB as `sold`; not in mutatable picker yet |
| Passed (current) | | drop | | keep alongside Bad Lead? |
| Negotiating (current) | | active | | keep? |

Also confirm: rename UI **Bought → Purchased** everywhere?

### Implementation sketch (fuller list — after checklist returns)

1. Single status registry: Worker enum + Zod + labels + terminal/suppressed sets.
2. Migration only for truly new codes; map buyer labels onto existing codes where possible.
3. Happy-path stepper steps only; branches via status dropdown (+ reason when required).
4. Thin slices: (a) Bought→Purchased labels, (b) mid-pipeline active statuses, (c) post-purchase + queue rules.

### Primary files

- `src/persistence/opportunityWorkflow.ts` (`MutatableWorkflowStatus`, terminal set)
- `web/app/(app)/opportunities/_components/opportunity-workflow-stepper.tsx`
- `web/app/(app)/opportunities/_components/opportunity-workflow-block.tsx` / hero CTAs
- `web/app/(app)/opportunities/_components/workflow-helpers.ts` (labels)
- Supabase migration if DB constraint lists statuses
- `docs/02-product/v2-opportunities.md`

### Exit criteria

- [x] **Bad Lead** settable + excluded from default queues
- [x] **Purchased** clearly available and labeled
- [ ] Buyer’s fuller list confirmed via checklist (do not invent statuses beyond minimum without confirmation)
- [x] Tests for new status transitions + terminal filter

---

## 52 — Double-click / whole-app action lag

**Reported:** 2026-07-09 (buyer email #6) — **queue tabs fixed 2026-07-09** (`e55015b`; same change set as **43**)

**Symptom (before fix):**

- Queue tabs (Needs action → Mine → Worth a look → All) feel **very slow**
- Actions often seem to need **two clicks** before they “execute”
- Buyer reports this pattern on the **entire app**, not only Opportunities

**Expected:** First click registers immediately (active tab / pressed state); data can load async. No double-click required.

### Relationship to item 43

Item **43** covers Opportunities tab switch latency (React Query `staleTime` / `placeholderData` / prefetch). **52** widens scope:

| Layer | Hypothesis |
|-------|------------|
| Perceived lag | Same as **43** — blank table while waiting → user clicks again |
| Double-click | `router.replace` + slow re-render; click target unmounts; first click “eaten” |
| App-wide | Shared shell / Next navigation / Auth session refetch / lack of optimistic UI on buttons |
| Overlay | Full-page loading states blocking pointer events |

### Fix direction

1. Ship **43** quick wins first (keepPreviousData, staleTime, tab loading indicator, prefetch).
2. Audit click handlers: ensure `onClick` sets local selected state **before** await/navigation.
3. Check app shell links (Next `<Link>` vs buttons) for full remounts.
4. If still app-wide: profile with Chrome Performance on tab switch + one detail action; document baseline.

### Primary files

- Item **43** files (`opportunities-client-new.tsx`, queue tabs, query keys)
- `web/components/app-shell/*` (nav click behavior)
- Any shared Button that waits on network before visual feedback

### Exit criteria

- [x] Single click switches tab selection immediately (optimistic `view` + item **43**)
- [x] No systematic double-click required on queue tabs (shell stays mounted via placeholderData)
- [x] Queue lag addressed on Opportunities; app-wide shell follow-up only if buyers still report after deploy
- [ ] Optional: global “pending” style on async buttons (disabled + spinner after first click)

**Fix (2026-07-09):** Same change set as **43** — root cause was unmounting the whole client (including tabs) when `query.data` went `undefined` on view change.

---

## 53 — Salesperson / Appraiser dropdown + admin CRUD

**Reported:** 2026-07-09 (buyer email #7)

**Symptom:**

- Salesperson and Appraiser on opportunity detail are **free-text** inputs (`opportunity-salesperson-appraisal-block.tsx`)
- Buyers will enter inconsistent names (“mess”) if left as text
- Need an **admin tool** to add/remove people from the lists

**Expected:** Both fields are dropdowns (or searchable combobox) fed from a managed directory. Admins can add/remove entries. Closers pick from the list only (or “Other” if product allows — default **list-only**).

### Implementation sketch

1. **Schema:** `tav.staff_directory` (or `salesperson_roster` / shared `directory_people` with `role` in `salesperson` \| `appraiser` \| both).
2. **API:** `GET /app/directory?type=salesperson|appraiser`; admin `POST/DELETE` under `/app/admin/...` or existing admin routes.
3. **UI — detail:** Replace text inputs with Select/Combobox bound to directory.
4. **UI — admin:** Simple list on `/admin` (or ops page) — add name, remove, maybe deactivate instead of hard delete for historical rows.
5. **Migration:** Existing free-text values — show as legacy option or require re-pick on next edit.

### Primary files

- `web/app/(app)/opportunities/_components/opportunity-salesperson-appraisal-block.tsx`
- `web/app/(app)/admin/` (new section or page)
- `src/app/routes.ts` + admin routes
- New Supabase migration for directory table
- PATCH opportunity still stores selected **name string** (or FK — prefer stable id + display name)

### Exit criteria

- [x] Salesperson and Appraiser are dropdowns populated from directory
- [x] Admin can add and remove (or deactivate) entries
- [x] Closer cannot free-type arbitrary strings (unless explicit Other is approved)
- [x] Historical opportunities with old free-text still display sensibly
- [x] Tests: API CRUD + block renders options

---

## 54 — No guessed miles; persist YMM; optional miles for MMR + Max buy

**Reported:** 2026-07-10 (prod investigation — e.g. 2023 Honda Odyssey @ $21,995)

**Status:** **Complete 2026-07-11** — slices 1–2 + ingest invent stop + docs. Historical invented-miles snapshots left as-is.

### Symptom (what we saw — before slices 1–2)

| Surface | What closer sees | What’s actually true |
|---------|------------------|----------------------|
| Queue | Wholesale **$33,500**, badges Estimated miles / style / MMR | Ingest called Manheim with title-parsed `2023` / `honda` / `odyssey`, **invented ~54k miles**, estimated style `MINIVAN ELITE` |
| Detail Vehicle | Year `2023`; Make/Model show **Select…**; VIN/odometer empty | DB has `make=honda`, `model=odyssey` — Cox dropdowns didn’t select (`honda` vs `Honda`) — **fixed slice 2** |
| Detail Valuation | “Add vehicle identity to run MMR and Max buy” | Block ignored saved `mmr_value` — **fixed slice 2** (shows saved ingest MMR) |

**After remaining ingest work (2026-07-11):** New ingests omit odometer when miles unknown; snapshots store null mileage used; queue shows **Mileage unknown** (not Estimated miles from invent). Historical rows with invented miles stay as-is.

### Product rules (locked 2026-07-10)

1. **Never invent odometer** — not at ingest, not in intel-worker YMM path, not in Max buy `evaluateRun`, not in UI “fill for me.”
2. **Miles are optional** for **both** MMR and Max buy. If unknown → leave null, badge **Mileage unknown**, send **unknown / omit** to Cox (do not substitute 15k×age).
3. **Y/M/M/S from listing title is OK** as the starting identity; keep those values on the deal for the whole lifecycle.
4. **Detail must display** that starting identity (catalog-matched where possible — overlaps **46**) and must **show the saved ingest MMR** (clearly labeled if estimated style / unknown miles) — not a blank “add identity” card while the queue shows a number.
5. **On any identity change** (VIN, year, make, model, series, real miles, ask) → re-run **MMR + Max buy** so cards match Vehicle block.
6. Max buy without miles is a **coarser** signal (mileage band `unknown`); still useful as a screen — same honesty bar as Estimated MMR.

### Product framing (2026-07-10 clarification)

**Desired Max buy mental model:** Given **year / make / model**, tell closers **what the company usually paid** (and related deal fit vs ask). Miles are **not** part of the requirement. Style/VIN/miles can refine later; they must not block a YMM answer.

This is **not** “rewrite Max buy from scratch.” Benchmarks already resolve `exact → ymm → mm → global`. Making miles optional mostly means **stop inventing miles** and **prefer / allow the YMM tier** (band `unknown` or skip mileage-keyed `exact`) so the output is “usual paid for this YMM,” not “usual paid for this YMM in a fake 30–60k band.”

| Scope | Size | What it is |
|-------|------|------------|
| **A — Miles optional, YMM-first answer** | **Small–medium** | Remove invent + UI gate; segment without real miles → `unknown` / YMM benchmark; keep MMR + transport/expense + verdict math |
| **B — “Usually paid” as the headline** | **Medium** | Same as A, plus UI/copy: lead with historical/segment paid (or sale) for YMM; demote mileage-sensitive MMR adjustments when miles unknown |
| **C — Throw away current Max buy, rebuild** | **Large** | New service/schema — **not needed** for the product ask above |

Default plan for **54**: ship **A** (and light **B** copy). Do not schedule **C**.

---

### How Max buy changes if miles are optional

**Slices 1–2 shipped** (`af362d7`, `9bc8bd3`): invent path removed; detail gate no longer requires miles.

| Layer | Before (buggy) | Now / remaining |
|-------|----------------|-----------------|
| Detail gate `identitySufficientForMaxbuyAutoRun` | Required `mileage != null` (+ ask) | ✅ Ask required; **miles not required** |
| `evaluateRun.ts` | `estimateMileage(year)` when null | ✅ Null mileage; band `unknown`; `MILEAGE_UNKNOWN` badge |
| Segment / benchmarks | Fake band e.g. `30-60k` | ✅ `mileageBand(null)` → `"unknown"` |
| MMR inside Max buy | Passed invented miles | ✅ Omit odometer when null |
| Scoring badges | `ESTIMATED_MILES` from invent | ✅ `MILEAGE_UNKNOWN` when omitted |
| Persistence | `is_estimated_miles` on invent | ✅ Null mileage; not year-estimated |
| Asking price | Required | ✅ Still required |

`mileageBand()` already supports null → `"unknown"`. Remaining Max buy work is mostly copy/headline (**scope B**) if desired — not invent.

### Ingest / MMR path changes (same rule) — **shipped 2026-07-11**

| Layer | Before | After |
|-------|--------|-------|
| `workerClient` YMM | `getMmrMileageData` invented miles when listing mileage null | ✅ No invent; omit mileage in body; `mileageUsed` null when unknown |
| `estimateFlags.mmr` / Estimated miles | Fired when valuation stored invented miles | ✅ New rows: listing null + snapshot null → **Mileage unknown** only; style estimate may still badge Estimated style / Estimated MMR |
| Snapshot | Could store invented `valuation_snapshots.mileage` | ✅ Stores null when odometer omitted |

**Cox / odometer:** Intel worker already supports **omitting** `?odometer=` on VIN and YMM calls. Ingest now matches that contract.

**App-layer mileage gates — done:**

| Gate | Status |
|------|--------|
| `docs/03-api/manheim-cox.md` | ✅ Odometer optional; omit → Cox average |
| App `POST /app/mmr/ymm` | ✅ Mileage already optional |
| MMR Lab search / Value | ✅ Miles not required for YMM |
| Detail live MMR auto-run | ✅ Miles not required; series still preferred for live YMM (saved ingest MMR shown without series) |

### Existing data (invented-miles snapshots)

Deals already in `valuation_snapshots` with invented `mileage` (e.g. 54000) and **Estimated miles** badges: **leave historical rows as-is** for v1 (no mass re-value). New ingest + new evaluations follow **54**.

### Exit criteria

- [x] **Slice 1 (2026-07-10):** Max buy `evaluateRun` does not call `estimateMileage`; null mileage → band `unknown`; YMM MMR omits odometer; response `vehicle.mileage` nullable; `MILEAGE_UNKNOWN` badge; `getRecommendation` no invent fallback
- [x] **Slice 2 (2026-07-10):** Detail Max buy gate no longer requires miles (ask still required); Vehicle block catalog-matches listing make/model/style casing; Valuation shows saved ingest MMR with provenance when live identity cannot auto-run
- [x] **Ingest (2026-07-11):** No production path invents 15k×age for MMR ingest (`workerClient`); Cox omit when miles unknown; snapshot stores null mileage used
- [x] App `POST /app/mmr/ymm` + MMR Lab YMM path do not require mileage
- [x] Max buy **detail auto-run gate** allows Y/M/M + ask without miles
- [x] Detail Vehicle shows catalog-matched listing Y/M/M (not blank Select) when parser values exist; control value is Cox token casing
- [x] Detail Valuation shows saved ingest MMR when present (even without series); re-runs MMR + Max buy when identity fields change
- [x] Historical invented-miles snapshots left as-is
- [x] Tests: worker YMM without invent; app/MMR Lab ymm without mileage
- [x] Docs: `manheim-cox.md` mileage gating updated to match omit/average behavior

---

## 55 — Scraper review mode (see Apify output in the queue)

**Status (2026-07-16):** Phase C **shipped**. Worker `9e4d2765` (missing-years cron sync, skip-on-502). Web **deployed** to `https://tav-enterprise.vercel.app` (Suggested Cox matches + Apply on detail). **`cox_catalog_tree`:** **35,978 rows**, years **2016–2027** (synced 2026-07-16; +2,692 rows, 1 model skipped). Daily cron (`0 6 * * *`) syncs **missing years only**. **Funnel re-measure (live ingests):** post-Phase C **49.8%** MMR hit vs post-Phase B **48.7%**; `model_variant_missing` **55.4%** vs **56.3%** of misses — need multi-day soak. **`SCRAPER_REVIEW_MODE` permanent.** **Phase D (2026-08-11):** offline matcher fixes — staging `57cafd1c`, prod `64c6ea94`. Item `[~]` until funnel lift confirmed.

**Reported:** 2026-07-11 (scraper soak — “we need to see what the scraper actually sends before fine-tuning filters”)

**Symptom:** Apify is delivering hundreds of Facebook listings, but the Opportunities queue only shows scored **leads** + strict **near misses**. ~86% of new listings never appear because they lack MMR (or fail near-miss economics). That hides scraper output during testing.

**Goal (now):** Surface recent scraped inventory in the app so buyers/ops can judge **scraper quality** (titles, prices, freshness, junk rate) and work unprocessed rows. **`SCRAPER_REVIEW_MODE` stays on permanently** (product decision 2026-07-16) — the Scraper review tab is a permanent queue surface, not a temporary soak to disable later.

### Funnel snapshot (since start of yesterday, America/Chicago — measured 2026-07-11)

| Stage | Count | Notes |
|-------|------:|-------|
| Apify `item_count` (sum of runs) | ~4,905 | Many already-seen (dedupe) |
| `processed` into pipeline | ~1,262 | |
| Adapter `filtered_out` | **46** | All `missing_ymm` — small |
| New Facebook `normalized_listings` | ~1,213 | |
| Latest valuation **no usable MMR** | ~1,043 | **~86% of new listings** — invisible in queue today |
| MMR hit | ~170 | |
| Became `tav.leads` | **50** | grades: good 36, fair 14 |
| MMR hit but **no lead** (`pass`-ish) | ~120 | Mostly **over MMR** (avg spread ≈ −108%) |

**Top valuation miss reasons:** `cox_no_data` ~602 · `trim_missing` ~481 · (has MMR) ~177

### Product decision (locked 2026-07-11)

**Phase A — scraper testing (do this first)**

| Do | Don’t |
|----|-------|
| **Feature-flagged “Scraper review” path** so recent scrapes show in the queue **even without MMR** | Change what a real **lead** is (`finalScore ≥ 55` / `upsertLead`) for the soak |
| Soften or skip `isReviewableNearMiss` economics gate **while the flag is on** | Permanently lower the pass threshold to inflate `tav.leads` |
| Badge rows clearly (`No MMR`, `Scraper review`, keep Near miss / lead grades when present) | Mix unlabeled junk into **Needs action** as if they were buy-box leads |
| Cap to recent `first_seen_at` (e.g. last **24–48h**) so the table stays usable | Dump the entire historical `normalized_listings` corpus into the UI |
| Prefer a dedicated tab/view **Scraper review** (optional but cleaner) | Pretend review rows are production deals in metrics/reporting |

**Phase B — after soak (quality) — plan locked 2026-07-13**

| Do | Don’t |
|----|-------|
| Turn the flag **off** (or admin-only) when testing is done | Leave review mode on in production forever by accident |
| Improve MMR hit rate by sending Cox **better Y/M/M/S** (reuse **46**) | Treat overpriced MMR-no-lead rows as “missed good deals” |
| Only then reconsider score tweaks **if** a sample shows underpriced near-cuts | Lower pass “just to see more rows” without a flag + exit plan |
| Measure **new ingest** only after the mapping fix | Re-value the item-**56** direct backfill dump through Cox (out of scope) |

Ops baseline still stands for **production lead quality**: [diagnostics.md](04-operations/diagnostics.md) — don’t lower `pass` to manufacture leads. Review mode is a **separate, temporary** surface.

### Phase B review (2026-07-13 — read-only)

Last **120h** of `tav.normalized_listings`:

| Stage | Count | Notes |
|-------|------:|-------|
| Listings | ~8,281 | Includes item-56 Scraper-review backfill |
| With valuation snapshot | ~3,398 | Worker actually asked Cox |
| No snapshot | ~4,883 | Mostly **56** direct DB load (never called Cox — expected) |
| MMR hit | ~451 | ~13% of valued |
| Leads | ~111 | 73 good / 37 fair |
| MMR hit, no lead | ~340 | Mostly **over MMR** (avg spread ≈ −83%) — economics working |

**Miss reasons (valued, no MMR):** `cox_no_data` ~53% · `trim_missing` ~47%.

**Plain English root cause:** When the Worker *does* ask Cox, it often sends incomplete car identity — e.g. “Ford F-150” with no trim/style, or trim glued into model (`mustang gt`). Cox can’t price that well. This is **not** “Worker skipped” and **not** a Cox outage — it’s weak Facebook-title → Cox-catalog mapping at ingest. The detail page already fixes this for closers via item **46**; ingest does not yet.

**Top miss platforms:** F-150 / Silverado / Ram (both miss buckets). Titles often already contain style cues (`EcoBoost Coupe`, `328i`, `Elevation`, `Nightshade`) that never become Cox style tokens.

### Implementation sketch (Phase B) — make ingest Y/M/M/S better

**Goal:** Before the Worker calls Cox, clean the listing into Cox dropdown tokens the same way a closer’s detail page does.

1. **Pull style/trim from the title** — e.g. EcoBoost Coupe, 328i, Elevation, Super Duty, Nightshade.
2. **Split trim out of model** — `Mustang GT` → model Mustang + style GT; `Altima 2.5` / `Rogue SV` same idea.
3. **Match to Cox catalog** — reuse item **46** (`resolveListingToCatalog` / `matchCatalogOption` helpers), not free-text Facebook strings.
4. **Then call Cox** with those cleaned Y/M/M/S values (miles still optional per **54** — never invent odometer).
5. **Badge guessed style** — Estimated style when inferred, so buyers know.
6. **Prioritize trucks** — F-150 / Silverado / Ram dominate misses; cab/bed/trim from title when possible.
7. **Re-measure funnel** on **new** scrapes only.

**Do not:** lower the lead pass floor; mass-revalue item-56 backfill rows; invent miles.

### Implementation sketch (Phase A)

1. **Env / Worker flag** — e.g. `SCRAPER_REVIEW_MODE=true` (staging first; easy off-switch).
2. **List path** (`src/persistence/opportunities.ts`):
   - Today `resolveOpportunityType` returns `null` without lead/MMR/manual → row dropped.
   - When flag on: include recent Facebook (etc.) listings with no MMR as a review type **or** as near_miss with an honest badge; relax `isReviewableNearMiss` deal-score ≥ 25 while flagged.
3. **Time window** — only `first_seen_at` within last N hours (config; start 48h; temporarily 120h during outage soak).
4. **UI** — badges; optional queue tab `view=scraper_review` so Needs action stays clean.
5. **Do not** write synthetic `tav.leads` rows for every scrape.
6. **Pair with item 44** when ready — **Listed** relative time makes scraper freshness readable.

### Primary files

**Phase A (shipped):**
- `src/persistence/opportunities.ts` — `resolveOpportunityType`, `isReviewableNearMiss`, `mapToOpportunityRow`, list/view filters
- `src/app/routes.ts` / env — feature flag
- `web/lib/opportunities/view-filter.ts` + queue tabs — optional `scraper_review` view
- `web/app/(app)/opportunities/_components/*` — badges / tab copy

**Phase B (shipped 2026-07-13 · `b2064dd` · prod `ccde935f`):**
- `src/valuation/resolveListingToCatalog.ts` — `resolveListingToCatalogForIngest` (item **46** cascade for ingest)
- `src/valuation/matchCatalogOption.ts` — case-insensitive + fuzzy catalog match
- `src/valuation/resolveCatalogStyleFromEvidence.ts` — trim token → Cox style
- `src/valuation/workerClient.ts` — YMM path calls resolver before MMR lookup
- `src/valuation/__tests__/resolveListingToCatalog.test.ts`, `test/valuation.workerClient.test.ts`

### Related items

- **44** — Listed relative time (`listing_date_ms` → `posted_at`) — high value during scraper soak
- **46** — Cox Y/M/M autofill (Phase B reuses this on **ingest**, not only detail)
- **54** — no inventing miles
- **56** — backfill without Cox is separate; do not conflate with Phase B mapping work
- Apify `fetchDetailedItems` — richer description/condition; optional later boost, not required to start Phase B

### Exit criteria

**Phase A**

- [x] Flag documented; default **off** in production until soak is intentional (`SCRAPER_REVIEW_MODE` in `wrangler.toml` / `src/types/env.ts` / `.dev.vars.example`)
- [x] With flag on, recent scrapes without MMR appear in queue/review tab with clear badges (`Scraper review`, `No MMR`; soft near-miss keeps Near miss + Scraper review)
- [x] Real lead creation / grade threshold unchanged (list path only; no `upsertLead` change)
- [x] Window cap prevents unbounded historical dump (`first_seen_at` within 48h; **120h** during item-**56** soak)
- [x] Flag off restores prior queue behavior (`view=scraper_review` empty; production views unchanged)

**Phase B**

- [x] Ingest runs listing → Cox-catalog Y/M/M/S (item **46** path) before MMR lookup
- [x] Title style cues and model/trim splits covered for top miss platforms (esp. trucks)
- [x] Funnel re-run on **new** scrapes: `trim_missing` / `cox_no_data` share down vs 2026-07-13 baseline (see **Phase B funnel re-measure** + **Phase C** below)
- [x] Lead count rises from more fair+ MMR hits, not from permanent pass-floor cuts (431 leads / ~7k valued post-deploy vs 81 / ~2.8k pre-outage baseline)
- [x] Estimated-style badge when style was inferred
- [x] `SCRAPER_REVIEW_MODE` on permanently — Scraper review tab stays (product decision 2026-07-16; **not** a temporary soak to disable)

### Phase C funnel re-measure (2026-07-16 — live ingests only)

Cohort: `source_run_id IS NOT NULL`. Post-Phase B = `fetched_at` 2026-07-13 12:00 UTC → 2026-07-15. Post-Phase C = `fetched_at >= 2026-07-16` (C-a/C-b worker + partial offline tree).

| Metric | Post Phase B | Post Phase C (1 day) | Notes |
|--------|------------:|---------------------:|-------|
| Valued (Cox called) | 5,192 | 1,899 | C cohort still small |
| MMR hit rate | **48.7%** | **49.8%** | +1.1 pts — early |
| Miss: `model_variant_missing` share | **56.3%** | **55.4%** | Not yet ≥50% reduction vs baseline |

**Read:** Offline tree (2016–2025) only populated ~15:20 UTC 2026-07-16; need **multi-day soak** before judging exit criteria. Next cron should finish **2026/2027** with retry/skip logic (`d0cbae12`).

### Phase B funnel re-measure (2026-07-15 — live ingests only)

Cohort: `source_run_id IS NOT NULL` (excludes item-**56** backfill). Post-Phase B = valuations `fetched_at >= 2026-07-13 12:00 UTC`. Pre baseline = live ingests `2026-07-08` → `2026-07-11` (healthy days before Apify outage).

| Metric | Pre Phase B | Post Phase B | Notes |
|--------|------------:|-------------:|-------|
| Valued (Cox called) | 2,797 | 6,997 | |
| MMR hit rate | **13.1%** | **48.9%** | ~3.7× |
| Leads | 81 | 431 | ~5.3×; economics gate still working (MMR-no-lead avg spread ≈ −81%) |
| Miss: `trim_missing` + `cox_no_data` | **99.9%** of misses | **43.7%** of misses | Legacy buckets collapsed |
| Miss: `model_variant_missing` | 0% | **56.2%** of misses | New top bucket — Cox model split, no variant evidence |

**Root cause shift:** Phase B fixed make/model/style cascade for many rows, but **`model_variant_missing` hard-fails** when Cox splits a model (e.g. `RAV4 AWD` / `RAV4 FWD`) and the Facebook title lacks drivetrain. ~**2,300 / 48h** listings still can't get Y/M/M/S for auto-MMR (~85% `model_variant_missing`, ~15% parser/title bugs like `BIGHORN 1500`, `Honda+Hr-V`). **Unprocessed Leads** tab must stay until Phase C reduces manual volume.

### Phase C — Cox catalog tree + offline matcher (design — 2026-07-15)

**Goal:** Pre-download Cox Y/M/M/S per year, build a scored cross-reference from Facebook title tokens → best Cox path, and stop hard-failing on variant ambiguity when title evidence is partial. Extend item **46** / Phase B — do not fork a second identity pipeline.

**Product rules (carry forward):**

- Never invent odometer (**54**).
- Auto-match only above a confidence floor; badge **Estimated style** / **Estimated variant** when guessed.
- Below floor → keep row in **Unprocessed Leads** with **top-3 suggested Cox matches** for one-click closer pick on detail.
- Closer corrections feed alias tables (learning loop).

#### Phase C-a — Quick wins (no catalog sync; ship first) — **shipped 2026-07-15 · prod `569b4885`**

| # | Change | Fixes | Files |
|---|--------|-------|-------|
| C-a.1 | **Title parser normalization** — trim-before-model (`BIGHORN 1500` → model `1500`, trim `Big Horn`); strip duplicate make; normalize `+` / `bighorn` | ~15% `trim_missing` | `src/sources/facebook.ts` |
| C-a.2 | **Variant signals beyond drivetrain** — cab/bed/body (`Crew Cab`, `5 1/2 ft`, `Double Cab`, `Pickup 4D`) in `selectCatalogModelVariantForListing` | Trucks (Tundra, F-150, Ram) | `src/valuation/selectCatalogModelVariant.ts` |
| C-a.3 | **Don't hard-fail `model_variant_missing`** — when variants tie, score each variant's styles against title tokens; pick best above floor, else store suggestions | ~70% `model_variant_missing` | `src/valuation/resolveListingToCatalog.ts`, `src/valuation/workerClient.ts` |

#### Phase C-b — Pre-downloaded catalog cross-reference — **shipped 2026-07-15 · prod `c9e40f47`**

**Why:** Today ingest does **3–4 live intel-worker catalog fetches per listing** and bails on ambiguity. `tav.mmr_reference_makes` / `mmr_reference_models` are flat (no year, no styles, no variants). A local tree enables offline scoring in one query.

**Sync job** (nightly cron or manual admin trigger):

1. For each Cox year in range (recommend: current year − 10 … current year + 1):
   - `GET /catalog/years/{year}/makes` → for each make → models → for each model → styles.
2. Upsert into `tav.cox_catalog_tree` (see schema below).
3. Record run in `tav.cox_catalog_sync_runs`.
4. Rate-limit intel worker; resume on failure.

**Matcher** (`matchListingToCoxCatalog` — new shared module, used by ingest + detail):

```
Input:  year, make, model, trim, title (from Facebook parser)
Output: { make, model, style, confidence, estimatedFlags[], alternatives[] }
```

**Scoring** (0–100 per candidate Cox path `(year, make, model, style)`):

| Signal | Weight | Match |
|--------|-------:|-------|
| Make token overlap | 15 | `ram` ↔ `Ram` |
| Model token overlap | 25 | `1500`, `rav4`, `silverado 1500` |
| Trim token in style | 25 | `xle`, `limited`, `big horn`, `rst` |
| Drivetrain in model or style | 15 | `awd`, `fwd`, `4x4`, `4wd` |
| Cab/bed in style | 10 | `crew cab`, `double cab`, `5 1/2 ft` |
| Body in style | 5 | `sport utility`, `sedan 4d`, `pickup 4d` |
| Penalty: unmatched Cox tokens | −10 each | Cox string has tokens title doesn't explain |
| Penalty: parser garbage | −30 | `honda+hr-v`, `bighorn 1500` ordering |

**Confidence policy:**

| Score | Action |
|------:|--------|
| ≥ 80 | Auto Cox MMR lookup with matched Y/M/M/S |
| 60–79 | Auto lookup + badge **Estimated style** or **Estimated variant** |
| 40–59 | No auto-MMR; persist top-3 in `catalog_match_suggestions`; show on Unprocessed detail |
| < 40 | Unprocessed only; no suggestions unless ≥ 25 |

**Tie-break:** prefer candidate whose style contains the most trim tokens from title; if still tied on model variants, prefer variant with more style token overlap (not "first catalog row").

#### Schema sketch

```sql
-- Full Cox Y/M/M/S tree (year-specific — not replaceable by flat mmr_reference_models)
CREATE TABLE tav.cox_catalog_tree (
  year          smallint NOT NULL,
  make          text     NOT NULL,
  model         text     NOT NULL,   -- includes Cox splits: "RAV4 AWD", "1500", "K5 FWD"
  style         text     NOT NULL,   -- Cox bodyname / trim token
  search_text   text     NOT NULL,   -- lowercased concat for trigram/GIN: "2022 ram 1500 4d crew cab big horn"
  variant_kind  text     NULL        -- 'drivetrain' | 'cab_bed' | 'powertrain' | 'base'
    CHECK (variant_kind IS NULL OR variant_kind IN ('drivetrain','cab_bed','powertrain','base')),
  synced_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, make, model, style)
);

CREATE INDEX cox_catalog_tree_year_make_idx ON tav.cox_catalog_tree (year, make);
CREATE INDEX cox_catalog_tree_search_gin ON tav.cox_catalog_tree USING gin (search_text gin_trgm_ops);
-- Requires pg_trgm extension if not already enabled.

CREATE TABLE tav.cox_catalog_sync_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL CHECK (status IN ('running','completed','failed','partial')),
  years_synced  smallint[] NOT NULL DEFAULT '{}',
  row_count     integer,
  error_message text
);

-- Top-N matcher output for Unprocessed / detail (optional JSONB on listing or separate)
CREATE TABLE tav.catalog_match_suggestions (
  normalized_listing_id uuid PRIMARY KEY REFERENCES tav.normalized_listings (id) ON DELETE CASCADE,
  suggestions           jsonb NOT NULL,  -- [{ make, model, style, score, estimatedVariant, estimatedStyle }]
  best_score            smallint,
  computed_at           timestamptz NOT NULL DEFAULT now()
);

-- Learning loop: closer-picked Y/M/M/S → instant re-match next time
CREATE TABLE tav.mmr_style_aliases (
  alias           text NOT NULL,
  canonical_make  text NOT NULL,
  canonical_model text NOT NULL,
  canonical_style text NOT NULL,
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ingest_learned')),
  PRIMARY KEY (alias, canonical_make, canonical_model)
);
```

**`suggestions` JSON example:**

```json
[
  { "make": "Toyota", "model": "RAV4 FWD", "style": "4D SUV XLE", "score": 72, "estimatedVariant": true, "estimatedStyle": false },
  { "make": "Toyota", "model": "RAV4 AWD", "style": "4D SUV XLE", "score": 68, "estimatedVariant": true, "estimatedStyle": false }
]
```

#### Implementation order

1. [x] **C-a.1** parser fixes + tests (facebook adapter fixtures from prod failures)
2. [x] **C-a.2** cab/bed variant signals
3. [x] **C-a.3** variant soft-fail + suggestion persistence (no sync yet — still uses live catalog API)
4. [x] **C-b.1** migration + sync — worker daily cron + admin trigger (`5ef2f318`); **partial first run** 33,286 rows (2016–2025); 2026 pending
5. [x] **C-b.2** offline matcher module + wire into `workerClient` ingest path
6. [x] **C-b.3** detail UI: "Suggested Cox match" + Apply — **web deployed** `tav-enterprise.vercel.app`
7. [x] Funnel re-measured (2026-07-16) — early; multi-day soak needed
8. [x] Finish **2026/2027** catalog sync (2026-07-16 — partial, 1 model skipped; cron now backfills missing years only)

**Catalog sync (production · shipped 2026-07-16 · `5ef2f318`):**
- **Cron:** existing daily `0 6 * * *` (after stale sweep) — uses Worker secrets + `INTEL_WORKER` binding; **no manual secret entry**
- **Admin:** `POST /admin/catalog/sync-cox-tree` (Bearer `ADMIN_API_SECRET`)
- **First run (2026-07-16):** status `partial`, **33,286 rows**, years **2016–2025**; failed on 2026 Mercedes Sprinter styles (intel HTTP 502)
- **Local ops only:** `scripts/sync-cox-catalog.mjs` (not required in prod)

**Product decision (2026-07-16):** `SCRAPER_REVIEW_MODE` **stays on permanently** — Scraper review tab is a permanent queue surface; do **not** plan to disable.

#### Primary files (Phase C)

- `src/sources/facebook.ts` — parser (C-a.1)
- `src/valuation/selectCatalogModelVariant.ts` — cab/bed signals (C-a.2)
- `src/valuation/matchListingToCoxCatalog.ts` — **new** offline scorer (C-b.2)
- `src/valuation/resolveListingToCatalog.ts` — delegate to matcher; remove hard `modelVariantAmbiguous` bail
- `src/valuation/workerClient.ts` — ingest path; persist `catalog_match_suggestions`
- `src/catalog/syncCoxCatalogTree.ts` — worker cron + admin sync (C-b.1 prod)
- `src/catalog/intelCatalogClient.ts` — intel catalog fetch for sync
- `scripts/sync-cox-catalog.mjs` — local-only ops script (C-b.1 dev)
- `supabase/migrations/0065_cox_catalog_tree.sql` — schema
- `web/.../opportunity-vehicle-block.tsx` — show suggestions on detail
- `src/persistence/opportunities.ts` — expose suggestions on Unprocessed rows (optional column/badge)

#### Exit criteria (Phase C)

- [x] `cox_catalog_tree` synced for years current−10 … current+1 — **35,978 rows; 2016–2027 done** (2026-07-16)
- [x] Ingest uses offline matcher (DB first; live catalog API fallback when tree stale/miss)
- [~] `model_variant_missing` share down ≥ 50% vs post-Phase B baseline — **55.4% vs 56.3% after 1 day; re-check after soak**
- [x] Parser garbage (`BIGHORN 1500`, `Honda+Hr-V`) resolves in adapter tests
- [x] Unprocessed rows show top-3 suggested Cox matches on detail — **live on Vercel**
- [x] Closer manual pick writes `mmr_style_aliases`; repeat listing auto-matches
- [x] Auto-guessed variant/style always badged; never silent
- [x] Funnel re-measured (2026-07-16); ongoing soak

**Enable review queue:** `SCRAPER_REVIEW_MODE = "true"` permanent (2026-07-16). Worker: Phase C-b sync cron `9e4d2765` (missing-years daily). Web: `tav-enterprise.vercel.app`.

#### Phase D — offline matcher fixes (2026-08-11)

**Shipped:** Worker staging `57cafd1c-e3a9-416e-856e-3d281f93de2f` + production `64c6ea94-9117-4b25-a9da-a5277e172ef2`.

| Change | File | Notes |
|--------|------|-------|
| Fix `parserGarbagePenalty` regex | `src/valuation/matchListingToCoxCatalog.ts` | `${...}` inside non-template regex literal was a no-op; duplicate-make titles (e.g. `honda honda`) now penalized correctly |
| Style tie-break on equal scores | `matchListingToCoxCatalog.ts` | Prefer style match when variant scores tie |
| `2d` / `4d` body tokens | `matchListingToCoxCatalog.ts` | Added to `BODY_TOKENS` for coupe/sedan disambiguation |
| Offline alias fallback | `src/valuation/buildIngestCatalogOfflineDeps.ts` | Uses `lookupMmrStyleAliasWithFallback` (same as LLM path) |
| Exported helpers | `matchListingToCoxCatalog.ts` | `isOfflineConfidentCatalogMatch`, `AUTO_LOOKUP_MIN` for §70 offline-first gate |

**Tests:** `src/valuation/__tests__/matchListingToCoxCatalog.test.ts` (parser garbage, tie-break, body tokens).

**Validation:** §68 post-§55 run pending (deploy ~2026-08-11 afternoon UTC). Prior §70 window showed **`offline_hit`: 3**, **`alias_hit`: 27** since §70 deploy.

#### Phase E — alias quality + unprocessed year floor (2026-08-13)

**Shipped:** Worker staging `b3616613-bb62-4f42-be6f-b3652ba23bf4` + production `e97c673e-e345-4d48-9b76-1a1a8cca5382`. Commit **`414ce2f`** on `main`.

| Change | File | Notes |
|--------|------|-------|
| Title-trim before empty-trim alias lookup | `mmrStyleAliases.ts`, `resolveListingWithLLM.ts` | e.g. "Sport" from title before catch-all `jeep\|wrangler unlimited\|` |
| Reject alias hits not in `cox_catalog_tree` | `catalogAliasValidation.ts`, `resolveListingWithLLM.ts`, `resolveListingToCatalog.ts` | Invalid model tokens (e.g. `WRANGLER UNLIMITED` without V6/4C) fall through to Claude/offline |
| Safer alias learning | `learnIngestStyleAlias.ts` | No empty-trim keys; require trim from listing or title; validate catalog before upsert; uppercase make |
| Unprocessed Leads year floor | `opportunities.ts`, `web/lib/opportunities/view-filter.ts` | `SCRAPER_REVIEW_MIN_YEAR=2011` — hide 2010 and older from Scraper review tab |
| DB cleanup | migration `0070_fix_mmr_style_aliases.sql` | Purged invalid + empty-trim aliases (**865 → 324** rows) |

**Root cause example:** 2018 Jeep Wrangler Unlimited "Sport" got `alias_hit` → Sahara + invalid Cox model → `cox_no_data` / No MMR in queue.

---

## 56 — Apify `unmapped_task` outage + missed-lead backfill

**Reported / diagnosed:** 2026-07-13  
**Related:** item **55** soak looked empty; `SCRAPER_REVIEW_MODE` was already `true` on Cloudflare the whole time — **not** the root cause.

### Timeline

| When | What |
|------|------|
| **2026-07-07** | `dallas-nick-task` (`ZQEsd3nHcLAs5kLwL`) wired + schedule `tav-tx-dallas-custom`; region map change existed in a session but **never landed on `main` / stayed production-durable**. |
| **~2026-07-08** | Custom-scraper `payloadAdapter` price/location gap found (`invalid_price`); fix remained local WIP. |
| **2026-07-11 ~10:13 UTC** | Last `tav.source_runs` row for Dallas (`run_id` `1bFsK5ozMSRyeinrP`). After this, Apify kept succeeding but TAV stopped recording runs. |
| **2026-07-11 → 2026-07-13** | Schedule + webhooks healthy every ~5 min. Worker returned **HTTP 200** with `{"ok":true,"skipped":"unmapped_task","actor_task_id":"ZQEsd3nHcLAs5kLwL"}` (same for Oklahoma `UfFehLMz5zylHOxCS`). Apify marked dispatches SUCCEEDED; **zero new normalized listings / leads** from those tasks. |
| **2026-07-13** | Diagnosed via Apify webhook dispatch bodies + Supabase `source_runs`. Root cause: production `APIFY_TASK_REGION_MAP` lacked custom-task IDs (committed map only had the four original facebook-marketplace tasks). |

### Fix shipped (2026-07-13)

- Commit **`347ca3c`** — map `ZQEsd3nHcLAs5kLwL` → `dallas_tx`, `UfFehLMz5zylHOxCS` → `oklahoma_city_ok`; extend `payloadAdapter` for custom-scraper `price.{amount,formatted}` + flat `location.{city,state}`.
- Deployed `tav-aip-production` (region map + adapter live). Ops doc: `docs/04-operations/apify.md`.
- **`SCRAPER_REVIEW_MODE`** remains intentional soak flag only — was already true on CF; local `wrangler.toml` `[env.production]` synced to `"true"`.

### Done — missed Apify inventory in Scraper review (2026-07-13)

Closed without full Worker/Cox webhook replay. Product ask: surface missed Dallas/OK scrapes in **Scraper review** with **Received** = original Apify scrape time (`first_seen_at`).

- [x] Enumerated Apify SUCCEEDED runs for `dallas-nick-task` + Oklahoma (`2026-07-11 10:13 UTC` → fix window); ~1,065 runs, ~6.5k unique parseable listings
- [x] Direct upsert into `tav.normalized_listings` (`entry_method = scraper`) with original `scraped_at` / `first_seen_at` / `posted_at` — no Cloudflare ingest, no lead/MMR creation
- [x] ~5k rows landed in the outage window (accepted as good enough; remainder skipped/dupes/interrupted)
- [x] Scraper review lookback temporarily **120h** (was 48) so original Received timestamps still appear during soak (`SCRAPER_REVIEW_WINDOW_HOURS`)
- [x] Live path remains fixed (`347ca3c`); new schedule runs continue via webhook

**Primary refs:** `docs/backfill-scraper-review-extract.mts`, `src/persistence/opportunities.ts` (window), `docs/04-operations/apify.md`

---

## 57 — LLM Y/M/M/S normalization via Claude API (replaces offline matcher as primary path)

**Status (2026-07-22):** **`LLM_YMMS_ENABLED="true"` on staging + production** (commit `47844d7`, Worker `5185eeb5…`). Phase 0 + Phase 1 code live; credits blocker cleared 2026-07-21. First production hours (~14:06 UTC+): **`llm_ymms_decisions`** show mix of `llm_hit` / `llm_needs_review`; Bronco Black Diamond title → correct Cox style + MMR; sparse titles (e.g. `2016 Ford F-150 · Short Bed`) still `needs_review` → offline fallback → No MMR — **motivates item 60** (richer listing text to Claude). Full design: [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md). **Next ingest-quality work:** item **60**, not re-flipping the flag.

**Status (2026-07-21, historical):** Design locked, Phase 0 + Phase 1 code built and deployed (`LLM_YMMS_ENABLED="false"` until 2026-07-22). Re-ran Phase 0 eval: 82 Anthropic calls, **valid Cox token rate 100%**, 16/82 `llm_hit`, 66/82 `needs_review`. **`--verify-mmr` deliberately skipped.** Tracker pointer + later-phase backlog below; read [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) first in a fresh chat for item 57 rules.

**Decided:** 2026-07-18 (Claude API access unblocked by leadership; see `TAV API.md`).

**Built 2026-07-18:** `src/llm/ymmsPrompt.ts`, `src/llm/anthropicClient.ts`, `src/valuation/resolveListingWithLLM.ts`, `src/persistence/llmYmmsDecisions.ts` + migration `0066`, wired into `workerClient.ts`, `scripts/eval-llm-ymms.mjs` (`npm run eval:llm-ymms`), 30 new unit tests (full suite: 93 files / 1252 tests green).

**Done 2026-07-20:** `ANTHROPIC_API_KEY` set as a Cloudflare secret on both `tav-aip-staging` and `tav-aip-production`; Worker redeployed to both (flag still `"false"` — dormant code only). Migration `0066_llm_ymms_decisions` applied to Supabase. Local `.dev.vars` populated (Supabase project uses the **new key format** — `sb_secret_...`, not legacy `service_role`). Ran `npm run eval:llm-ymms` against 100 historical `model_variant_missing` rows: 17 `catalog_not_synced` (expected — catalog tree gaps), 83 reached Anthropic, **all 83 returned HTTP 400 "credit balance too low."** Pipeline confirmed wired correctly end-to-end (key auth, prompt build, tool-use gate) — the only blocker is billing on the Anthropic account.

**Done 2026-07-20 (later): ingest batch-concurrency fix (§6 Phase 1) built.** `createLlmYmmsPrefetch()` (new export, `src/valuation/workerClient.ts`) runs a fixed-size sliding window (default concurrency 8) of `resolveListingWithLLM()` calls — all indices up to the cap start immediately, and the window slides forward one slot every time a caller `consume()`s an item, so several listings' Claude round-trips overlap instead of blocking the main ingest loop one at a time. `handleIngest.ts` builds the per-batch input map up front (pure, side-effect-free `parseFacebookItem` pre-pass — no change to the existing per-item order/timing) and threads the prefetched resolution into `getMmrLookupOutcome`'s new optional third arg (`{ llmResolution }`); when omitted (every call site outside ingest), `performMmrCall` resolves inline exactly as before — fully backward compatible. Everything else in the loop (raw insert, adapter, dedupe, per-item deadline check, scoring, lead upsert) is untouched and still 100% sequential — verified the existing deadline-truncation tests (which depend on exact per-item sequencing) still pass unmodified. Inert today: with `LLM_YMMS_ENABLED="false"` everywhere, `resolveListingWithLLM` short-circuits with zero I/O, so this is a pure addition with no effect on current traffic. 8 new unit tests (`test/valuation.llmYmmsPrefetch.test.ts`) cover the windowing/concurrency logic directly; 5 new tests in `test/valuation.workerClient.test.ts` / `test/ingest.test.ts` cover the opt-in passthrough and ingest wiring. Full suite: 94 files / 1263 tests green. **Also still true:** all item-57 files are uncommitted in the working tree — needs a commit before anything else touches this branch. See doc §6/§9/§13 for the exact done/not-done split.

**Goal:** Cut MMR miss rate from ~50% toward 5–10% by replacing item **55**'s offline scored matcher with a Claude API call per listing that reasons over the **full** Cox `(year, make)` catalog subtree (not a pre-scored top-3) and the listing title/description. AI proposes; the existing deterministic exact-match gate against `cox_catalog_tree` disposes — same principle as **55**/**46**, only the proposal step changes from scoring to an LLM call, and the candidate universe widens from top-3 to the full subtree.

**Locked decisions (do not re-litigate — see doc for full rationale):**
- Single structured-output Claude call per listing — **not** an agent, **not** multi-turn tool use.
- Full unfiltered model+style list for `(year, make)` fed as context — not the scorer's top-3.
- Runs on **every** listing (primary path, not a miss-only fallback) — this is why the ingest budget fix below is mandatory, not optional.
- Deterministic exact-match validation against `cox_catalog_tree` stays mandatory after Claude's pick.
- `mmr_style_aliases` fast-path runs before any Claude call (cost control + reuse of the existing learning loop).
- Photos/vision deferred to a later phase (needs Apify capture + durable storage first — Facebook URLs expire).
- Never let the model call Cox/Manheim directly or invent mileage/trim (carry-forward from **54**).

**Hard constraint found this session — FIXED 2026-07-20 (Phase 1):** `ingestCore` (`src/ingest/handleIngest.ts`) loops items sequentially with `BATCH_TIMEOUT_MS = 25_000` (`COMPLETION_RESERVE_MS = 1_500`), batches up to `MAX_INGEST_ITEMS = 500`. One sequential Claude round-trip per item was exhausting that budget after ~15 items. `resolveListingWithLLM` calls now run through a bounded-concurrency prefetch window (`createLlmYmmsPrefetch`, concurrency 8) instead of one sequential await per item — see the "Done 2026-07-20 (later)" note above and doc §6. Still worth a second pass once real Anthropic traffic exists: confirm the concurrency cap and window depth hold up under production latency/error-rate, not just the mocked unit tests.

**Primary files (built):** `src/llm/ymmsPrompt.ts`, `src/llm/anthropicClient.ts`, `src/valuation/resolveListingWithLLM.ts`, `src/persistence/llmYmmsDecisions.ts` + migration `0066_llm_ymms_decisions.sql`, `scripts/eval-llm-ymms.mjs`, env vars in `src/types/env.ts` / `wrangler.toml` / `.dev.vars.example` (`ANTHROPIC_API_KEY`, `LLM_YMMS_ENABLED`, `LLM_YMMS_MODEL`). **Also built (§6 Phase 1):** `createLlmYmmsPrefetch` + `MmrLookupOutcomeOpts` in `src/valuation/workerClient.ts`, `buildLlmYmmsPrefetchInputs` in `src/ingest/handleIngest.ts`. **Not built:** §6 Phase 2+ (learning-loop / cost tiering, listed below) — not required to safely flip the flag, just further headroom/cost work.

**Related items:** **55** (offline matcher this supersedes as primary path; kept as fallback on Claude API error/timeout), **46** (ingest cascade/alias pattern this reuses), **54** (never invent mileage — same rule applies here).

### Exit criteria — Phase 0 (offline eval, do this before touching prod)

- [x] `scripts/eval-llm-ymms.mjs` pulls historical `model_variant_missing` (or any `missing_reason`) listings from `tav.valuation_snapshots`, joins `normalized_listings`, builds full-catalog context, calls Claude, logs result vs current offline matcher, writes JSON results (`npm run eval:llm-ymms`)
- [x] Anthropic API key confirmed in Worker secrets (staging + production) and local `.dev.vars`
- [x] Actually ran the eval (100 rows, 2026-07-20) — **blocked mid-result:** all 83 non-`catalog_not_synced` rows failed with Anthropic HTTP 400 "credit balance too low"; not a code/config issue
- [x] **Unblocked 2026-07-21:** credits added to the Anthropic account
- [x] Re-run eval once credits exist and actually read the accuracy numbers — done 2026-07-21 (100 rows, `model_variant_missing`, no `--verify-mmr`): 18 `catalog_not_synced`, 82 Anthropic calls, 0 errors, 16 `llm_hit`, 66 `llm_needs_review`, 0 `llm_invalid_pick`. Results: `scripts/_eval-results/llm-ymms-eval-2026-07-21T13-32-26-650Z.json`
- [x] Valid-Cox-token rate ≥ 99% on eval set — **100% (82/82)**, bar met
- [x] Would-have-hit-MMR rate (via `--verify-mmr`) — **deliberately skipped 2026-07-21** (would've required rotating the shared `INTEL_WORKER_SECRET` between two live Workers just for a secondary signal; not worth the risk). **Safe to skip because** `workerClient.ts` only ever trusts a confident `llm_hit` — `llm_needs_review`/`llm_invalid_pick` fall back to the existing offline matcher unchanged, so there's no regression risk, only a measurement gap.
- [x] Product decision on the `needsReview` / confidence threshold — **decided 2026-07-23 → item 61:** auto-accept when **`confidence > 0.50`** and **`isValidCoxPick`**; ignore model **`needsReview`**. **Shipped in code 2026-07-23** (`classifyYmmsProposalIngestOutcome`); deploy soak pending.
- [ ] Real next step: decide whether a 19.5% (16/82) confident-hit rate on this sample is worth flipping `LLM_YMMS_ENABLED="true"` on **staging only** for a soak, measured the same way as item 55 Phase C (funnel re-measure), before touching production
- [x] **Flipped `LLM_YMMS_ENABLED="true"`** staging + production — 2026-07-22 (`47844d7`, deploy `5185eeb5…`); monitor `llm_ymms_decisions` + MMR funnel
- [ ] **Item 60** — pass description + Apify listing text into Claude (see §60)
- [x] Ingest batch-concurrency fix (§6 Phase 1) — built and tested 2026-07-20, independent of the credits blocker

### Later phases (backlog — not yet scoped in detail; expand `LLM-YMMS-Normalization.md` when picked up)
- [x] Learning loop — persist accepted Claude/offline picks into `mmr_style_aliases` (`ingest_learned`) so repeats skip the LLM call — Phase 1 prod `aadd46ef`; §70 extended to `offline_hit` + alias key fix (2026-08-11)
- [ ] Vision tier — enable Apify photo capture, persist images (R2 or equivalent), low-confidence-triggered vision follow-up call only
- [ ] Model tiering / prompt caching once Phase 0 data shows an easy/hard listing split worth exploiting
- [ ] Seller classification (dealer vs private/curbstoner) — **moved to item 71** (§71); RFP FR-3.5; text v0 + vision later; not blocking item 57
- [x] Fix `parserGarbagePenalty` regex bug in `matchListingToCoxCatalog.ts` — shipped 2026-08-11 (staging `57cafd1c`, prod `64c6ea94`); tie-break + alias fallback same cut

---

## 58 — UI/UX polish: Opportunities list, detail page, TAV MMR page

**Status (2026-07-20):** Built (uncommitted). Raised as a "no changes, just suggest" visual review of production (`tav-enterprise.vercel.app`) while item 57 is blocked on Anthropic credits; buyer approved the subset below, rejected the rest (deeper badge/spacing rework, dashboard-wide theming, etc. — not in scope here). All checklist items implemented and covered by lint/typecheck/vitest (`npm run lint && npm run typecheck && npm test` in `web/`, 589/589 passing); no E2E/UAT run yet — pending review.

**Goal:** Fix specific visual/UX friction found via live review: badges and the KPI strip read as same-weight inline text instead of a dashboard; the detail page is a narrow single-column form with no visible reason for its disabled-gray fields and a flat button-group instead of a progress stepper; MMR Lab shows bare `--` placeholders before any search.

### Opportunities list

**Primary files:** `web/app/(app)/opportunities/_components/opportunities-table-new.tsx`, `opportunities-queue-tabs.tsx`

- [x] Recolor status/quality badges by meaning, not just text: green/amber/red for lead quality; a distinct muted "duplicate/estimate" style (small dot + gray text, not a same-weight pill) so the eye jumps to what matters (deal score, room-to-make) instead of every badge competing for attention. Shared tone/meta classification now lives in `web/lib/opportunities/badge-style.ts` (used by both `opportunity-badges-new.tsx` and the detail-page `opportunity-badges.tsx`); meta badges (`Possible duplicate`, `Seen again…`, `Price changed`, `Estimated …`) render via the new `MetaBadgeDot` (`web/components/ui/meta-badge.tsx`) instead of a same-weight `Badge` pill.
- [x] Convert the KPI strip ("57 need you · 57 new today") into actual stat cards (number + label + small trend indicator), visually separated from the tabs below with a card/border — should read as a dashboard summary, not inline text. New `QueueSummaryStats`/`QueueStatCard` in `opportunities-client-new.tsx`; each card shows the count + label with an attention icon (amber `AlertCircle` / green `Sparkles`) that lights up only when the count is non-zero, plus a `border-b` separating the stats row from the queue tabs. Full sentence kept as `sr-only` text so existing regex-based tests/assistive tech still read "N need you" / "N new today".

### Opportunity detail page

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx`

- [x] Two-column responsive layout: Contact + Vehicle side by side on desktop, stacked on mobile — use full page width instead of a narrow centered form. Contact Info moved out of the hero card (now full width, header-only) into a `lg:grid-cols-2` row alongside Vehicle.
- [x] Persistent claim/status banner at the top ("This lead is unclaimed — claim it to edit fields") so the disabled-gray-everywhere state has an obvious reason instead of looking broken. Enabled fields should visually pop (white background + border) vs. disabled (flat gray, no border). New `OpportunityClaimBanner`/`resolveClaimBannerState` (`opportunity-claim-banner.tsx`) renders one of three tones (editable/unclaimed/locked) under the hero; `Input`, `Checkbox`, and the Vehicle/Salesperson/Title Information `selectClass` strings now use `disabled:bg-muted disabled:border-transparent disabled:opacity-100` instead of a flat `opacity-50` fade on the enabled look.
- [x] Collapse Title Information (lien/tag/warranty) by default until the deal reaches Appraised or later; only auto-expand when relevant, reducing initial scroll/clutter. `resolveDetailStep` (exported from `opportunity-workflow-stepper.tsx`) drives `defaultOpen`; the block is keyed on that boolean so it re-seeds open state live when the deal crosses the Appraised boundary, without fighting a manual user toggle otherwise.
- [x] Replace the plain-text/flat-button-group workflow status row (Found / Working / Contacted / Appraised) with an actual horizontal stepper component — connected dots/lines, current step highlighted, completed steps visually distinct from upcoming ones. Confirmed via screenshot 2026-07-20: today it renders as four equal-weight buttons with only the active one filled blue, not a progress stepper — the state data (items **30**/**51**) already exists, this is visual treatment only. Rebuilt `OpportunityWorkflowStepper` with numbered/checked dots connected by a colored line (filled through completed steps).

### TAV MMR page

**Primary file:** `web/app/(app)/mmr-lab/` components

- [x] Show a lightweight example/skeleton state before search (e.g. "Try VIN 1HGCM...") instead of bare `--` placeholders everywhere pre-search. New `ResultBandIdle` in `result-band.tsx` replaces the dash-filled grid for `phase === "idle"` with a dashed-border hint card ("No vehicle looked up yet" + example VIN), matching the existing idle pattern already used by `HistoricalProjected`/`TransactionsTable`. Updated `result-band.test.tsx` and `mmr-lab-client.test.tsx` accordingly (old tests asserted the bare-`--` behavior this item explicitly removes).

**Exit criteria:**
- [x] All checked items above implemented
- [ ] No regression to existing E2E/UAT for opportunities list, detail page, MMR Lab — unit/lint/typecheck all green; no E2E/UAT pass done yet
- [ ] Visual review confirms: dashboard-style KPI cards, meaning-based badge colors, two-column detail layout, claim/status banner, Title Information collapsed pre-Appraised, real horizontal stepper, MMR Lab skeleton state

---

## 59 — Max buy not shown; Y/M/M/S not linked to Max buy

**Reported:** 2026-07-21 (buyer feedback, production `/opportunities` — Needs action tab)  
**Expanded:** 2026-07-25 (production funnel analysis — YMMS → MMR works; YMMS → Max buy does not)

**Symptom:** Deals sitting in the **Needs action** tab mostly show no Max buy badge at all in the queue row (`OpportunityVehicleCellNew` renders nothing, or the muted **"MaxBuy: add VIN"** hint) — buyers can't see a Max buy verdict/number to help triage which unclaimed leads to work first.

### Root cause (code review 2026-07-21)

This is **not** a rendering bug — the queue row component and the Worker's `listOpportunities` query already treat Max buy uniformly across every tab/view:

- `fetchMaxbuySummaries()` (`src/persistence/opportunities.ts`) joins `maxbuy_recommendations` for **every** listing in the result set, regardless of `view=`.
- `OpportunityVehicleCellNew` (`web/app/(app)/opportunities/_components/opportunity-vehicle-cell-new.tsx`) renders `MaxBuyBadge` whenever `row.maxbuySummary` is present, on every tab.

The actual gap is **upstream**: a `maxbuy_recommendations` row only gets created when someone actually calls `POST` the Max buy evaluate endpoint (`src/maxbuy/handlers/evaluate.ts` → `runEvaluate`) — today that only happens **on-demand from the opportunity detail page** (e.g. after a VIN decode / Y/M/M/S save, per item **48**'s "fresh MMR + Max buy" flow). `src/ingest/handleIngest.ts` never calls Max buy evaluate — ingest only writes the MMR `valuation_snapshots` row, not a `maxbuy_recommendations` row.

**Needs action** is specifically the tab of unassigned/unclaimed/freshest leads — by definition, the rows least likely to have been opened by anyone yet. So the one tab where a buyer most wants an at-a-glance signal for triage is structurally the one least likely to have a cached Max buy verdict. `MAXBUY_EVALUATE_ENABLED` is already `"true"` in both staging and production, so this isn't a flag/config gap — it's a "nobody has clicked in yet" gap.

### Production analysis — Y/M/M/S not linked to Max buy (2026-07-25)

Supabase + Apify ingest review since **2026-07-23 17:00** local (Dallas + Oklahoma Facebook tasks). **No code changes** — analysis only.

**What works (ingest → MMR):**

| Metric | Value |
|--------|-------|
| New listings | 3,537 |
| Parsed Y/M/M from title | 100% |
| MMR hit | ~68% (2,402) |
| MMR hits with Cox `lookup_trim` | 100% of hits |
| LLM decisions (`llm_hit` / `needs_review`) | 3,159 / 676 |

Ingest resolves ambiguous titles to Cox style tokens for MMR (alias → LLM → offline matcher → live catalog). Resolved style lives on **`valuation_snapshots.lookup_trim`**, not on `normalized_listings.trim`.

**Top MMR miss reasons:** `model_variant_missing` (757), `cox_no_data` (699), `llm_unavailable` (465), `trim_missing` (324).

**What does not work (ingest YMMS → Max buy):**

| Gap | Detail |
|-----|--------|
| **No ingest-time Max buy** | `handleIngest.ts` writes `valuation_snapshots` only — never calls `runEvaluate`. **0 / 3,537** new listings have a `maxbuy_recommendations` row. All-time: 1,912 Max buy rows, only **4** linked to a listing (rest = MMR Lab manual). |
| **`lookup_trim` not on opportunity** | `listOpportunities` sets `style: listing.trim` (`opportunities.ts`). **66%** of MMR hits have `lookup_trim` but **null** `listing.trim` → `sessionFromOpportunity()` returns null → **no auto-run MMR or Max buy** on detail open (`opportunity-valuation-block.tsx` requires `style` for YMM path). |
| **Max buy re-MMRs with wrong identity** | `runEvaluate` / `resolveVehicleContext` read `normalized_listings.year/make/model/trim` — **not** `valuation_snapshots.lookup_trim`. Trim defaults to `"base"`. Even when listing trim exists it is often a partial Facebook token (`"sport"`, `"denali"`) not the Cox bodyname that got the ingest MMR hit (`"4D SUV BADLANDS"`). |

**Detail-page behavior today:**

| Listing profile | Ingest MMR | Detail auto-run Max buy |
|-----------------|------------|-------------------------|
| MMR hit, no `listing.trim` (~66%) | Saved | **Blocked** — no session |
| MMR hit, has trim (~34%) | Saved | Possible, but may re-MMR with weaker trim |
| MMR miss | None | Blocked until manual Y/M/M/S |
| Has VIN | N/A | Best path — scraper sends **0** VINs |

**YMMS linkage is correct for MMR at ingest; it does not flow through to Max buy** because Max buy is a separate on-demand path that ignores ingest's Cox-resolved tokens.

### Fix direction (not started — needs product confirmation on cost/latency tradeoff)

- Most direct: run Max buy evaluation as part of ingest (alongside the existing MMR lookup in `handleIngest.ts`) whenever MMR hits — pass **`lookup_make` / `lookup_model` / `lookup_trim`** from the MMR result (or reuse ingest MMR value), not parsed `listing.trim`. Needs a batch-budget check similar to item 57 §6 (Max buy calls go to `maxbuy-worker`, adds another per-item round trip to the same `BATCH_TIMEOUT_MS` budget).
- **Identity bridge (detail + Max buy worker):** expose Cox-resolved style on opportunities when `listing.trim` is empty — e.g. `style` ← `lookup_trim` from latest valuation snapshot; or persist resolved Cox tokens on `normalized_listings` at ingest. Unblocks `sessionFromOpportunity()` and stops Max buy from re-MMRing with `"base"` / wrong trim.
- Cheaper alternative: a small cron/backfill that evaluates Max buy only for rows currently in `needs_action` (bounded set, not every ingest) — lower cost, but still stale between cron runs and does nothing for items 40/41-style "brand new lead" freshness.
- Do not invent mileage/trim to force an evaluation (item **54** rule still applies) — rows without enough identity should keep showing the existing **"MaxBuy: add VIN"** hint, not a fabricated number.

### Primary files

- `src/ingest/handleIngest.ts` — where an ingest-time Max buy call would be added
- `src/valuation/workerClient.ts` — MMR result carries `lookupTrim` / `lookupMake` / `lookupModel` (not forwarded to Max buy today)
- `src/maxbuy/handlers/evaluate.ts`, `src/maxbuy/evaluateRun.ts` — existing on-demand evaluation path to reuse; `resolveVehicleContext` reads listing fields only
- `src/persistence/opportunities.ts` (`fetchMaxbuySummaries`, `listOpportunities`) — `style` from `listing.trim`, not `lookup_trim`
- `src/persistence/valuationSnapshots.ts` — `lookup_trim` stored here on MMR hit
- `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx` (`sessionFromOpportunity`, `shouldAutoRunMaxbuy`)
- `web/app/(app)/opportunities/_components/opportunity-vehicle-cell-new.tsx` (`MaxBuyBadge`, `showAddVinHint`)
- `wrangler.toml` (`MAXBUY_EVALUATE_ENABLED`, `MAXBUY_WORKER_URL`) — already on in staging/production, just unused at ingest time

### Exit criteria

- [x] Product decision: evaluate Max buy at ingest time vs. needs-action-only backfill vs. something else — **ingest-time on MMR hit** (`c49c49f`)
- [x] Cox-resolved Y/M/M/S from ingest (`lookup_trim` at minimum) flows to opportunity detail + Max buy evaluate — not only parsed `listing.trim`
- [ ] Needs action tab shows a Max buy badge (or an honest "add VIN" hint) for the large majority of rows, not just previously-opened ones
- [x] No invented mileage/trim to force an evaluation (item 54)
- [x] No regression to ingest batch timing (same budget concern as item 57 §6)

### Max buy coverage gap — investigated 2026-07-27 (not a bug)

**Question:** Since 7/25 deploy, only **~76%** of MMR-hit listings had a `maxbuy_recommendations` row — expected ~100%.

**Finding:** **100% after deploy.** The gap is entirely the **partial deploy day** on 2026-07-25.

| Day / bucket | MMR-hit listings | With Max buy | Coverage |
|--------------|------------------|--------------|----------|
| 7/25 **before** deploy (~14:43 UTC) | 598 | 10 | ~2% (pre-ship ingests) |
| 7/25 **after** deploy | 669 | 669 | **100%** |
| 7/26 | 745 | 745 | **100%** |
| 7/27 | 451 | 451 | **100%** |

All 588 “missing” rows are 7/25 pre-deploy MMR hits (no `scheduleIngestMaxbuyEvaluate` yet). None had missing price/region/YMM — `buildIngestMaxbuyEvaluateBody` gates were not the cause. **No code fix needed**; optional one-time backfill for pre-deploy 7/25 MMR hits if buyers want badges on those rows.

---

## 60 — LLM listing context: description + Apify fields for item 57

**Opened:** 2026-07-22 (production item **57** live; buyer feedback on unprocessed **No MMR** rows with sparse Facebook titles)

**Symptom:** Claude runs on ingest but often returns **`llm_needs_review`** or fails to disambiguate Cox style when the **title alone** is vague (example: `2016 Ford F-150 · Short Bed` → 392 possible F-150 styles → `needs_review` at 0.2 → offline fallback → **`cox_no_data`** → **No MMR** in Scraper review). Meanwhile **`buildYmmsUserPrompt`** already has a **Listing description:** section that ingest **always leaves as `(none)`**.

**Root cause:** `buildLlmYmmsPrefetchInputs()` (`src/ingest/handleIngest.ts`) only passes **`title`, `price`, `year`, `make`, `model`, `trim`**. It does **not** pass seller description, condition, subtitle mileage hints, or other Apify-mapped text. `mapRaidrApiItem()` can attach **`description`** from `extraListingData.description` onto the **raw ingest item**, but **`NormalizedListingInput`** has no description field and nothing copies it into the LLM path. Eval script `--one` accepts `--description`; production ingest does not.

**Goal:** Feed Claude **all useful listing text we already get from Apify** (minimum: **description**; also consider condition, structured location, odometer when present) so it can make an informed Cox pick when the title is thin — without changing item 57’s deterministic gate or MMR trust rules (`llm_hit` only).

**Detailed spec, file list, phases, exit criteria, fresh-chat checklist:** [`docs/LLM-YMMS-listing-context.md`](LLM-YMMS-listing-context.md) — **read that first** when picking up this item.

**Related:** item **57** (LLM resolver, flag on), item **55** (offline matcher fallback), **`payloadAdapter.ts`** (Apify field mapping), item **54** (do not invent mileage — pass real miles only).

### Exit criteria (summary — full list in companion doc)

- [x] Description (and agreed Apify text fields) wired ingest → `LlmYmmsResolutionInput` → `buildYmmsUserPrompt`
- [x] Tests with Apify-shaped fixture (sparse title + rich description)
- [ ] Measured lift in `llm_hit` or fewer `cox_no_data` on ambiguous-title cohort vs 2026-07-22 baseline
- [ ] Optional: persist description on `normalized_listings` if detail UI should show it (Phase B in companion doc)

**Out of scope here:** listing **photos / vision** (item 57 Phase 2 — separate).

---

## 61 — LLM auto-accept: confidence > 0.50 (ignore `needsReview`)

**Opened:** 2026-07-23 (buyer review of Unprocessed / **`llm_needs_review`** samples on 2016+ listings)

**Status:** **Shipped in code 2026-07-23** — `classifyYmmsProposalIngestOutcome` in `src/llm/ymmsPrompt.ts`; resolver uses **`confidence > 0.5`** (strict), **`needsReview` ignored**. **Deploy + staging/production funnel soak still pending.**

**Problem today:** Ingest only applies Claude’s Y/M/M/S pick when the resolver returns **`llm_hit`** — defined as: valid Cox pick **and** Claude set **`needsReview: false`**. Production (~3 days post–item 57, 2026-07-23): **`llm_hit` ~1,066** vs **`llm_needs_review` ~1,055** — roughly **half** of all Claude calls are discarded for MMR even when the proposal **passes `isValidCoxPick`**. Buyer manually validated several **`needs_review`** examples (e.g. 2022 Camry SE Nightshade, 2023 Yukon XL Denali Ultimate, 2019 F-150 King Ranch) as **good guesses**; hedging was mostly unstated drivetrain/cab/engine, not hallucinated trim.

**Decision (buyer 2026-07-23):**

- **`confidence` is 0–1** (model self-score on the tool output).
- After the existing **`isValidCoxPick`** gate, treat the pick as **`llm_hit` for ingest MMR** when **`confidence > 0.50`** (strictly greater than one-half, unless implementation chooses `>= 0.5` — document which in PR).
- **Ignore Claude’s `needsReview` boolean** for the ingest trust decision — do not let the model veto its own pick when score is above threshold.
- **`llm_invalid_pick`** and **`fallback`** behavior unchanged. **`alias_hit`** unchanged.
- Audit row may still record original `needsReview` + confidence for dashboards; **`accepted`** / outcome labeling should reflect the new rule (e.g. `llm_hit` with metadata that it was threshold-promoted).

**Expected effect:** Many current Unprocessed Leads ( **`model_variant_missing`** after a valid but `needs_review` Claude pick) should get **ingest MMR** on the next scrape/re-ingest. Does **not** fix pre-2016 catalog gap or rows with no Claude call.

**Implementation sketch (when built):**

- **`src/valuation/resolveListingWithLLM.ts`** — after `isValidCoxPick`, branch: if `proposal.confidence > 0.50` → return **`llm_hit`** regardless of `proposal.needsReview`; else keep **`llm_needs_review`**.
- **`src/valuation/workerClient.ts`** — no second gate on `needsReview` (verify none exists beyond resolver kind).
- **Tests** — cases: valid pick, `needsReview: true`, confidence 0.85 → **`llm_hit`**; valid pick, confidence 0.4 → **`llm_needs_review`**; invalid pick → **`llm_invalid_pick`** unchanged.
- **Docs** — update [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) locked decisions when shipped (supersedes “only trust `llm_hit` when needsReview false”).
- **Rollout:** staging deploy + compare Unprocessed count / MMR hit rate vs 2026-07-23 baseline before relying on production.

**Risks (accepted pending soak):** Wrong Cox variant (e.g. FWD vs AWD, 2WD vs 4WD King Ranch) can produce **misleading MMR** — same risk as a closer picking the wrong dropdown; mitigated by Cox gate (never non-catalog tokens) and buyer override on detail.

### Exit criteria

- [x] Resolver promotes valid picks with **confidence > 0.50** to **`llm_hit`**; **`needsReview` ignored** for ingest trust
- [x] Unit tests cover threshold boundary (0.50 / 0.51) and invalid picks
- [ ] Staging soak: measurable drop in **`llm_needs_review`**-only Unprocessed rows on 2016+ ingests
- [x] `LLM-YMMS-Normalization.md` + this § updated with ship date / deploy version (deploy version TBD at push)

---

## 62 — In-app listing mirror (photos + description on opportunity detail)

**Opened:** 2026-07-23 (buyer UX + Apify config)

**Product goal:** On **opportunity detail**, show a **Facebook-style listing block** — **photo gallery** (swipe/lightbox), **full seller description**, price, location, seller name, link to original post — so closers can judge the car **without leaving TAV** to open Facebook.

**Apify (ops, 2026-07-23):** On the **custom-vehicle-scraper** task(s), enabled **Fetch Listing Photos & Videos** (and **Fetch Detailed Item Info** where already on) in the actor **Data Collection** settings. Expect richer `extraListingData` / media arrays on **new** runs after this change. **Verify** on the next Dallas/Oklahoma dataset and update [`docs/04-operations/apify.md`](04-operations/apify.md) (that doc still says “no detail-fetch” for `dallas-nick-task` as of 2026-07-13).

**Current code reality (pre–item 62):**

| Layer | Today |
|-------|--------|
| **Raw ingest** | `raw_listings.raw_item` usually has **`primaryImage`** (single FB CDN URL); full gallery depends on new Apify settings |
| **Normalized** | `normalized_listings.images` column exists but is **not populated**; **`description`** not on normalized row (item **60** Phase B) |
| **Adapter** | `src/apify/payloadAdapter.ts` maps detail **text** fields; does **not** flatten photos into `images[]` for persistence |
| **Detail UI** | No dedicated listing mirror — buyers use external Facebook link |

**Implementation sketch (when picked up):**

1. **Ingest / map** — Extend `payloadAdapter` + `parseFacebookItem` (or post-adapter helper) to extract **`primaryImage` + `extraListingMedia` / photo list** into `NormalizedListingInput.images` (and persist **description** per item **60** Phase B).
2. **Durability** — Facebook CDN URLs **expire**; for production reliability (and item **57** vision tier), copy images to **R2** (or similar) at ingest, store stable URLs on the listing row — same RFP theme as [`docs/TAV API.md`](TAV%20API.md).
3. **API** — Expose `images`, `description`, seller/location on `GET` opportunity / normalized listing payload used by detail.
4. **Web** — New card/section on `opportunity-detail-client-new.tsx` (e.g. **Listing from marketplace**): gallery + description + “View on Facebook” link; mobile-friendly; no autoplay video unless Apify ships stable video URLs.
5. **LLM (optional follow-on)** — Once gallery is persisted, item **57** Phase 2 can run **vision only** on **`llm_needs_review`** rows using stored images — not required for the buyer-facing mirror.

**Related:** item **60** (description → Claude + persist for UI), item **57** §8 / vision backlog, UI backlog listing photos (table thumbnail was deferred — this item is **detail-first**).

### Exit criteria

- [ ] Apify config confirmed on live tasks; sample ingest shows **multi-photo** (+ description) in `raw_listings` after enable
- [ ] Images (+ description) persisted and returned on opportunity detail API
- [ ] Detail page listing mirror matches buyer expectation (gallery + full text; link out optional)
- [ ] Document URL expiry / R2 strategy before relying on photos for LLM vision

---

## 63 — Craigslist source adapter (scheduled scraper → ingest)

**Opened:** 2026-07-23 · **Adapter shipped:** 2026-07-28 (`bc09841`)

**Product goal:** Listings from **Craigslist** flow through the same pipeline as Facebook — normalized listings, MMR, scoring, leads, and Opportunities — with source **Craigslist** in the UI.

**Single source of truth for build context:** [`docs/scrapers/craigslist-tav-adapter.md`](scrapers/craigslist-tav-adapter.md) — read that first in a fresh chat; this section is the tracker only.

**Shipped (2026-07-28 · `bc09841`):**

- **`src/sources/craigslist.ts`** — `parseCraigslistItem`, `detectCraigslistDrift`
- **`handleIngest.ts`** — routes `source === "craigslist"`
- **Tests** — `test/craigslist.adapter.test.ts`, fixtures, ingest integration (`processed > 0`)

**Still open (moved to item 67 for Apify path):** scheduled **`e-commerce/automotive-scraper`** ingest via `/apify-webhook`, production soak, enable Apify schedule. Legacy **solidcode/craigslist-scraper** tasks and direct **`POST /ingest` + HMAC** remain alternate paths — not validated yet.

### Related

- Item **67** — Apify `e-commerce/automotive-scraper` eval + bridge (current blocker for CL schedule)
- Item **62** — listing mirror works for any source once `images` + `description` persist
- Item **54** — never invent mileage on CL ingest
- Item **60** / **57** — LLM listing text from description on CL ingest (follow-up)

### Exit criteria

- [x] Adapter + ingest wiring merged; Facebook ingest unchanged (regression tests green) — **`bc09841`**
- [ ] Staging/production soak with live scraper → **`processed > 0`**, `normalized_listings.source = craigslist` — **blocked on item 67**
- [ ] [`craigslist-tav-adapter.md`](scrapers/craigslist-tav-adapter.md) updated with ship date and field deltas from real scraper output

---

## 67 — Apify Craigslist automotive-scraper eval + bridge

**Opened:** 2026-08-07 (buyer evaluating **`e-commerce/automotive-scraper`** as replacement for solidcode CL scraper)  
**Phase 0:** **go** 2026-08-07 — mapper + eval shipped; report `scripts/_eval-results/cl-automotive-scraper-eval-2026-08-07T15-17-07-531Z.json` (4 runs / 170 items: pass **95.9%**, Y/M/M+price among passed **99.4%**).  
**Phase 1:** **live** 2026-08-07 — staging `cd8033f6` + production `432fef47`.  
**Status (2026-08-11):** **Deprioritized** — team focus shifted to **Facebook Dallas** (§68). Chunked ingest fix shipped 2026-08-08; schedule still off. Revisit after §68–§70 land.

**Status (2026-08-08):** First production manual ingest **succeeded but truncated**. Chunked Apify ingest shipped same day — verification run **`FuPxo5UyEbqDA6jtt`**: **19/20 processed**, 2 leads (was 7/20 on pre-chunk path). **Do not enable the schedule** until product re-prioritizes Craigslist.

**Product goal:** Decide whether the Apify actor is a **usable** Craigslist source for TAV **before** enabling schedules. “Usable” means: extractable Y/M/M/S + price (+ miles when present), acceptable duplicate behavior across runs, and enough signal to reach **ingest MMR** on a representative sample — not just raw scrape volume.

**Do not conflate with item 63:** item **63** shipped the **`parseCraigslistItem`** adapter for flat Craigslist-shaped payloads. This actor emits **schema.org `Car`**. **`mapAutomotiveScraperItem`** (Phase 0) bridges that shape; Phase 1 wires it through `/apify-webhook`.

### Apify state (2026-08-08)

| Resource | ID | Notes |
|----------|-----|--------|
| Actor | `e-commerce/automotive-scraper` (`HqZudyEggO98WZvlN`) | Search-URL input; ~342 fields/listing |
| Task | `cl-dallas-automotive` (`NMTFTt1C0aEnhEuY9`) | Dallas metro; **`maxResultsPerUrl: 100`** ← too large for one Worker batch today |
| Webhook | `k44uPe3kKRoXFH9bx` | → `tav-aip-production` `/apify-webhook` — **working** |
| Schedule | `tav-cl-dallas-automotive` (`HIb0Pg9Gg3Pn7RNfD`) | **`isEnabled: false`** · keep off until truncation fixed |

**Phase 0 eval runs (2026-08-07):** `C1XKAcUiIQUKf0Ck4`, `tdxUXkdtPkaZ6nj7M`, `K3J8fzYvAgNfqOdIS`, `jyAW1nDI7N8I5XpWt`.

### First production ingest (2026-08-07 ~15:27 UTC)

| Field | Value |
|-------|--------|
| Apify run | `VGkVS0ITBNTAceGxj` (SUCCEEDED) |
| Webhook | HTTP **200** — prior run `jyAW…` had been `skipped: unmapped_task` (pre-deploy) |
| Response | `source=craigslist`, **processed 8**, rejected 1, **created_leads 2**, `truncated: true`, **items_skipped 91** |
| `tav.source_runs` | `status=truncated`, `item_count=100`, `error_message=batch_truncated:91_items_skipped` |
| DB | **8** `normalized_listings` with `source=craigslist` |
| MMR on those 8 | **3 hits / 5 misses** (misses included `model_variant_missing`, `llm_unavailable`, `trim_missing`, `cox_no_data`, plus pre-catalog years) |

**Why 91 dropped:** not bad data. Ingest stops when `BATCH_TIMEOUT_MS` (~25s) is nearly exhausted so the Worker can return cleanly. With Claude Y/M/M/S + MMR per listing, ~100 cars do not fit one webhook call.

### What to do next (before enabling schedule)

Preferred order:

1. **Shrink Apify batch** — set task `maxResultsPerUrl` from **100 → ~20–30**, manual re-run, confirm most items process (`truncated` false or near-zero skips).
2. **Then** more manual soaks / optional schedule enable at a cadence that matches the smaller batch.
3. Later options if still needed: cheaper per-listing path (less LLM), or carefully raise Worker time budget (Workers still have hard limits — not a free “2 minutes”).

**Do not enable** schedule `HIb0Pg9Gg3Pn7RNfD` while `maxResultsPerUrl=100` — every scheduled fire would keep throwing away most listings.

### Phase 0 eval result (2026-08-07) — offline only

| Metric | Value |
|--------|-------|
| Adapter pass | **163/170 (95.9%)** |
| Rejects | 7× `invalid_year` (pre-2000) |
| Y/M/M + price among passed | **99.4%** |
| Description / images among passed | **100% / 99.4%** |
| VIN among passed | 25.8% (optional) |

Also fixed: `parseCraigslistItem` parses `priceUsd` directly so structured-YMM rows keep price when Facebook title probe fails.

### Implementation order

**Phase 0 — offline eval:** ✅

1. `src/apify/automotiveScraperAdapter.ts` — `mapAutomotiveScraperItem`
2. Fixture + tests + `npm run eval:cl-automotive-scraper`

**Phase 1 — webhook bridge:** ✅ deployed

1. `APIFY_TASK_CONFIG` — `NMTFTt1C0aEnhEuY9 → { region: dallas_tx, source: craigslist }`
2. `webhookHandler.ts` — mapper + envelope by source
3. `buildLlmYmmsPrefetchInputs` — includes craigslist
4. Deployed staging + production; first manual run ingested (truncated)
5. [`docs/04-operations/apify.md`](04-operations/apify.md) updated

**Phase 1b — fix truncation:** [~] chunked ingest shipped prod `467021c6` (2026-08-08)

1. ~~Lower Apify `maxResultsPerUrl` (~25)~~ — superseded by **`dispatchApifyIngest`** / `INGEST_CHUNK_SIZE=7` synchronous multi-chunk path (`src/ingest/chunkedApifyIngest.ts`)
2. Manual re-run `FuPxo5UyEbqDA6jtt` → **19/20 processed**, status `truncated` (1 chunk timeout)
3. Clean up stuck `source_runs` rows from pre-chunk `waitUntil` deploy (`cHXv0kVEonbFWDtgS`, etc.) — optional ops
4. Document MMR / lead quality on non-truncated sample — **on hold** (§68 priority)

**Phase 2 — schedule (only after 1b OK):**

1. Enable schedule **`HIb0Pg9Gg3Pn7RNfD`** (or tune cron)
2. Multi-day funnel soak vs Facebook Dallas

### Not in scope (yet)

- Oklahoma / other regions
- Retire **solidcode/craigslist-scraper** (`JFzGvWoMqkLgbA4gz`) until automotive-scraper validated at cadence
- Direct **`POST /ingest` + HMAC** external scraper path
- R2 image durability (item **62**)

### Related

- Item **63** — flat Craigslist adapter (shipped)
- Item **55** / **57** / **60** — Y/M/M/S + description at ingest (drives per-listing cost → truncation)
- Item **62** — listing mirror
- Item **54** — never invent mileage

### Exit criteria

- [x] `mapAutomotiveScraperItem` + tests + fixture
- [x] Eval script run on ≥3 Apify runs; report under `scripts/_eval-results/`
- [x] Phase 0 go/no-go — **go** 2026-08-07
- [x] Production webhook ingest **`processed > 0`**, `source = craigslist` — run `VGkVS0ITBNTAceGxj`
- [x] Non-truncated (or near-full) manual run after shrinking Apify batch — **19/20** on `FuPxo5UyEbqDA6jtt` (chunked path)
- [ ] Schedule enabled only after truncation fix + soak sign-off — **blocked on priority shift to §68**
- [x] [`apify.md`](04-operations/apify.md) updated for Phase 1
- [ ] [`craigslist-tav-adapter.md`](scrapers/craigslist-tav-adapter.md) updated with ship date + real field deltas

---

## 68 — Facebook Dallas throughput + fast validation

**Opened:** 2026-08-11 (priority shift — **main scraper focus**)  
**Status:** [~] **baseline captured + validation updated 2026-08-13** — §70 + §55 Phase D–E deployed; credits restored ~2026-08-12; MMR ~**60%** Dallas FB (near 61.5% baseline)

**Product goal:** Get **more usable Dallas Facebook inventory through ingest faster**, with changes validated in **hours** (single Apify run + `source_runs` row + queue spot-check) — **not** the old 1–3 day multi-day soak bar used for items **55**, **64**, **66**.

### Why this is #1 now

| Signal | Facebook Dallas today |
|--------|----------------------|
| Volume | Primary scrape source (~300–500 Apify runs/day on schedule) |
| Truncation | ~**59%** of runs still `truncated` (same `BATCH_TIMEOUT_MS` + LLM+MMR per listing as Craigslist) |
| Token cost | Claude Y/M/M/S on **every** listing that reaches ingest (`LLM_YMMS_ENABLED=true`) |
| Craigslist | Item **67** chunked path works (19/20); schedule off; **deprioritized** |

Chunked ingest (`chunkedApifyIngest.ts`) helps **both** sources but does not fix per-listing cost. **§69** (dealer blacklist) and **§70** (token efficiency) directly reduce wasted work on Dallas FB.

### Apify / region refs

| Resource | ID | Notes |
|----------|-----|--------|
| Task | `dallas-nick-task` (`ZQEsd3nHcLAs5kLwL`) | Custom vehicle scraper; `region=dallas_tx`, `source=facebook` |
| Schedule | `tav-tx-dallas-custom` | ~every 5 min (see [`apify.md`](04-operations/apify.md)) |
| Adapter | `src/sources/facebook.ts` | `parseFacebookItem`; extracts `sellerName`, `sellerUrl` |
| Webhook | production `/apify-webhook` | Same ingest path as Craigslist; chunked when batch > 7 |

### Locked decisions (2026-08-11)

1. **Scope:** Facebook **Dallas only** for this sprint — not Oklahoma, not Craigslist.
2. **Validation cadence:** When shipping a change, sign off on **same-day** metrics — do **not** block on 1–3 day soak windows.
3. **`SCRAPER_REVIEW_MODE`:** Stays **on** (permanent product decision 2026-07-16). “Fast validation” means **ingest throughput + funnel metrics**, not turning off the review tab.

### Fast validation playbook (use instead of multi-day soak)

After each deploy, within **~1–2 hours**:

| Check | Where | Pass bar (starting point — tune as we learn) |
|-------|--------|-----------------------------------------------|
| Run completed | `tav.source_runs` for latest Dallas FB `run_id` | `status=completed` (not stuck `running`) |
| Process rate | `processed / item_count` | ≥ **90%** on a 20-item sample run |
| Truncation | `error_message` | No `batch_truncated` or skips ≤ 2 |
| MMR funnel | `valuation_snapshots` on new listings | MMR hit % not regressed vs prior 24h Dallas cohort |
| Leads | `created_leads` on run | Non-zero on a representative sample (if inventory allows) |
| Token signal | Worker logs `llm_ymms.anthropic_cache_usage` | No spike in uncached tokens per listing (after §70 recommendations) |

Optional: trigger one manual Apify run (`ZQEsd3nHcLAs5kLwL`) before relying on schedule traffic alone.

### Baseline captured (2026-08-11 — §68 Phase A)

**Window:** last 24 hours · `source=facebook` · `region=dallas_tx`

| Metric | Value |
|--------|-------|
| Apify ingest runs | **231** |
| Truncated runs | **4 (1.7%)** |
| Stuck `running` | **6** (532 items claimed — investigate) |
| Avg process rate (`processed/item_count`) | **95.4%** |
| Items scraped / processed | 4,707 / 3,997 |
| Leads created | **309** (~1.37/run) |
| MMR hit (last 200 listings) | **61.5%** (123/200) |

**Top MMR miss reasons** (among misses in sample):

| Reason | Count |
|--------|------:|
| `llm_unavailable` | 46 |
| `cox_no_data` | 18 |
| `model_variant_missing` | 7 |
| `trim_missing` | 6 |

**Notes:** 24h truncation is **much lower** than the ~59% cited from 7-day history — likely smaller FB batch sizes + schedule cadence re-scraping skipped items. **`llm_unavailable` dominates misses** in this window (credit/outage or transient API — worth checking before token-efficiency work). Stuck `running` rows mirror pre-chunk Craigslist pattern on large batches.

**Next step:** §69 blocked on scraper seller fields — vendor contacted. When credits return, re-run §68 playbook for token columns + MMR regression.

### Validation — post §70 deploy (2026-08-11, ~16:07 UTC+ window)

**Production Worker:** `7cbd9844-3cfb-44ab-a218-fd91fab8dfa9` (§70) then `64c6ea94-9117-4b25-a9da-a5277e172ef2` (§55 Phase D).

| Check | Result | Pass? |
|-------|--------|-------|
| Latest completed run | `zGSnkc2CAshruebrr` — **4/4 (100%)** processed | ✓ |
| Truncation on sample | No `batch_truncated` | ✓ |
| `offline_hit` since deploy | **3** | ✓ (§70 offline-first works) |
| `alias_hit` since deploy | **27** | ✓ (alias fast-path active) |
| `mmr_style_aliases` rows | **3** new (`ingest_learned`) | ✓ (alias learning started) |
| MMR hit (post-deploy sample) | **50.8%** vs baseline **61.5%** | ✗ (depressed by credits) |
| Top miss reason post-deploy | **`llm_unavailable` (75)** | — credits out |
| `model_variant_missing` post-deploy | **9** | monitor after §55 |
| Token columns on `llm_ymms_decisions` | Empty (no successful Claude calls) | pending credits |
| Stuck `running` runs | **2** (`sp8b79sGtPlStahrv`, `M1TeVfi3u5h1kofFP`) | ✗ ops flag |

**Recommendation (2026-08-11):** ~~Consider `LLM_YMMS_ENABLED=false` until Anthropic credits refill~~ — **credits restored ~2026-08-12.**

### Validation — post credits restore (2026-08-12 → 2026-08-13)

| Check | Result | Pass? |
|-------|--------|-------|
| Claude calls (~22h post-credits) | **2,269** | ✓ |
| `llm_hit` rate on Claude calls | **50%** | ✓ (item 61 design) |
| Listings skipping Claude (alias + offline) | **~81%** | ✓ §70 |
| `alias_hit` (24h) | **9,607** | ✓ |
| MMR hit Dallas FB (since credits) | **~60.2%** | ✓ (vs 61.5% baseline) |
| `llm_unavailable` (since credits) | **4** | ✓ |
| Token columns populated | Yes | ✓ |
| Top miss reason now | **`cox_no_data`**, **`cox_rate_limited`** | monitor |

**Open ops items:** 4 stuck `running` `source_runs`; dealer/salvage still high in queue (§69 scraper-blocked; **§71** scopes AI text filter); list/detail flag UI cache lag (~60s) under investigation.

### Implementation tracks (ordered)

**Phase A — measure baseline (same day):** ✓ done 2026-08-11

**Phase B — throughput wins:** ✓ chunked ingest already wired; §69 deployed but non-functional until scraper sends seller fields

**Phase C — token wins:** ✓ §70 shipped — see §70 for change list and deploy IDs

### Primary files (when implementing)

- `src/ingest/chunkedApifyIngest.ts`, `src/apify/webhookHandler.ts`
- `src/sources/facebook.ts`, `src/ingest/runIngestItemLoop.ts`
- `src/llm/*`, `src/valuation/resolveListingWithLLM.ts`
- [`docs/04-operations/apify.md`](04-operations/apify.md)

### Exit criteria

- [x] Baseline metrics recorded for Dallas FB (24h truncation + MMR hit) — **2026-08-11**
- [x] At least one post-change manual run meets process-rate bar — **`zGSnkc2CAshruebrr` 4/4 (100%)**
- [~] Truncation rate materially down vs baseline — **already low (1.7% in 24h window)**; multi-day trend TBD
- [~] No regression in lead quality — not spot-checked yet
- [x] MMR hit ≥ baseline after credits return — **~60.2% vs 61.5%** (2026-08-13)
- [ ] Stuck `running` `source_runs` investigated / cleared

### Related

- Item **67** — Craigslist; deprioritized
- Item **69** — dealer pre-filter (biggest immediate token + throughput win)
- Item **70** — token efficiency shipped (offline-first, prune, token columns)
- Items **57**, **60**, **61**, **66** — LLM ingest path

---

## 69 — Dealer seller blacklist (pre-ingest filter)

**Opened:** 2026-08-11  
**Status (2026-08-11):** [~] **Phase 0 + Phase 1 deployed** — migration `0068_blocked_sellers` on Supabase; Worker staging `a86c6854-00c3-42c8-9a73-2668358fd751` + production `c786c54b-3a9e-477d-ae0c-d00a1cd68460`. **Non-functional in prod:** Apify payloads for Dallas FB (~135k listings) have **zero** `seller_url` / `seller_name` — filter + dismiss hook cannot match sellers until scraper vendor adds fields. `blocked_sellers` table: **0 rows**. Vendor contacted 2026-08-11.

**Product goal:** When a buyer flags a listing as **Dealer**, **automatically block that Facebook seller** on future scrapes **before** LLM Y/M/M/S and MMR run — saving tokens, Worker time, and queue noise.

### Locked decisions (2026-08-11)

| Decision | Choice |
|----------|--------|
| Trigger | **Auto-add** when dismiss/flag reason = **`dealer`** (item **47** UI — no separate admin flow for v1) |
| Scope v1 | **`source=facebook`** AND **`region=dallas_tx`** only |
| Seller key | **`seller_url`** primary (Facebook profile URL); **`seller_name`** fallback when URL missing |
| Filter point | **Before ingest processing** — after `parseFacebookItem`, before `runIngestItemLoop` / LLM / MMR |
| List population | Manual via existing buyer flag workflow (crowdsourced over time) |
| Unblock | **Out of scope v1** — no UI to remove from blacklist yet (ops can delete row in DB if needed) |

### Why this makes sense

- Item **47** already captures `dealer` dismiss reason and hides rows from default queue views — but **does not** stop the same seller’s next listing from burning tokens on re-scrape.
- Dallas FB runs ~every 5 min; dealer inventory repeats; pre-filter compounds savings quickly.
- Aligns with §68 fast-validation goal: fewer junk listings → higher effective `processed/item_count`.

### Proposed flow

```
Buyer dismisses lead → reason=dealer
  → upsert tav.blocked_sellers (seller_url, seller_name, source, region, flagged_by, opportunity_id)

Next Apify webhook → parseFacebookItem
  → if dallas_tx + facebook + seller matches blocked_sellers → skip (log + count as rejected/skipped, no LLM)
  → else → normal ingest
```

### Proposed schema (sketch — migrated as `0068_blocked_sellers`)

```sql
-- tav.blocked_sellers (name TBD)
-- seller_url     text        NOT NULL  -- normalized FB profile URL
-- seller_name    text                  -- denormalized display name at flag time
-- source         text        NOT NULL  -- 'facebook' for v1
-- region         text        NOT NULL  -- 'dallas_tx' for v1
-- reason         text        NOT NULL  -- 'dealer' for v1
-- flagged_by     uuid        REFERENCES auth.users(id)  -- or app user id
-- opportunity_id uuid                  -- audit trail
-- created_at     timestamptz NOT NULL DEFAULT now()
-- UNIQUE (source, region, seller_url) WHERE seller_url IS NOT NULL
```

**Normalization rules (to lock in Phase 0):**

- Strip query params / trailing slashes from `seller_url`
- Case-fold URL path for dedupe
- If only `seller_name` available: case-fold + trim; weaker key — log when used

### Implementation order

**Phase 0 — schema + dismiss hook:** ✓ shipped 2026-08-11

**Phase 1 — ingest filter:** ✓ shipped 2026-08-11 (`runIngestItemLoop.ts`, `blockedSellers.ts`)

**Phase 2 — metrics (fast validation per §68):** **blocked** — cannot seed blacklist or verify `ingest.dealer_blocked` until scraper sends seller fields

### Primary files (when implementing)

- `src/persistence/opportunityWorkflow.ts` — dismiss handler
- `src/persistence/opportunities.ts` — read listing seller fields from opportunity
- `src/ingest/runIngestItemLoop.ts` or `src/sources/facebook.ts` — pre-filter hook
- `src/apify/webhookHandler.ts` — ensure seller fields present before filter
- `web/lib/opportunities/dismiss-reasons.ts` — already has `dealer`

### Exit criteria

- [x] Migration applied; table live in Supabase (`0068_blocked_sellers`)
- [x] Dismiss with `dealer` auto-creates blacklist row (Dallas FB listing with seller URL) — coded + unit test
- [x] Re-ingest of same seller skipped before LLM — coded in `runIngestItemLoop` + prefetch skip
- [x] `ingest.dealer_blocked` logged with counts per run
- [x] **Deploy Worker** — staging `a86c6854` + production `c786c54b` (2026-08-11)
- [ ] Verify on one manual Dallas FB run after flagging a known dealer (`ingest.dealer_blocked` in logs) — **blocked on scraper seller fields**
- [x] No filter applied to Oklahoma / Craigslist / other regions in v1

### Related

- Item **47** / **45** — dismiss + dealer reason (shipped)
- Item **68** — Dallas FB throughput + validation
- Item **70** — further token reductions after blacklist
- Item **71** — AI dealer detection on first sighting (text; complements seller-key blocklist)

---

## 70 — LLM token efficiency

**Opened:** 2026-08-11  
**Status:** [~] **research + implementation shipped 2026-08-11; validated post-credits 2026-08-13** — staging `46ac09a2` + production `7cbd9844`; alias quality fix **`e97c673e`** (2026-08-13)

**Product goal:** Reduce Claude token spend and ingest latency on Dallas FB without regressing MMR hit rate. Research doc [`LLM-Token-Efficiency.md`](LLM-Token-Efficiency.md); implementation followed buyer sign-off on ranked recommendations.

### Sign-off decisions (2026-08-11)

| Approved | Rejected |
|----------|----------|
| #1 Offline-first gate before Claude | #2 Fix `needs_review` waste |
| #3 Catalog pruning (Ford/Chevy subtrees) | #6 Reduce `max_tokens` 1024→256 |
| #4 Sort prefetch by `(year, make)` | |
| #5 Trim listing evidence (1000 char cap; drop location from prompt) | |
| #7 Fix alias learning (model mapping + key strategy) | |
| #8 Persist token columns on audit rows | |

### Shipped implementation (2026-08-11)

| Change | Primary files |
|--------|---------------|
| Offline-first gate (`offline_hit` outcome) | `src/valuation/resolveListingWithLLM.ts`, `workerClient.ts` |
| Ford/Chevy catalog subtree pruning | `src/llm/pruneCatalogSubtree.ts` (new), `resolveListingWithLLM.ts` |
| Prefetch sorted by `(year, make)` for cache locality | `src/valuation/workerClient.ts` |
| Listing evidence cap 2000→1000; location removed from prompt | `src/llm/listingTextContext.ts`, `src/llm/ymmsPrompt.ts` |
| `output_tokens` in Anthropic usage | `src/llm/anthropicClient.ts` |
| Token usage helpers | `src/llm/tokenUsage.ts` (new) |
| Token columns on `llm_ymms_decisions` + fixed `model` audit mapping | `src/persistence/llmYmmsDecisions.ts`, migration `0069_llm_ymms_token_usage.sql` |
| Alias learning from `offline_hit` + `llm_hit` | `src/valuation/learnIngestStyleAlias.ts` |
| Offline alias fallback | `src/persistence/mmrStyleAliases.ts` — `lookupMmrStyleAliasWithFallback` |

**Deploy:** staging `46ac09a2` + production `7cbd9844` (2026-08-11).

**Observed post-deploy (§68 window):** `offline_hit` **3**, `alias_hit` **27**, **3** new `mmr_style_aliases` rows; MMR hit **50.8%** vs **61.5%** baseline — dominated by **`llm_unavailable` (75)** with credits out, not a regression signal yet.

**Follow-up (2026-08-13):** §**72** — production triage shows **~85% of `cox_no_data` traced to `alias_hit`** after credits restored. §70 alias skip rate must be rebalanced for **identity accuracy** (see §72).

### Research phase (completed)

| Section | Content |
|---------|---------|
| Current baseline | Tokens per listing today (cache hit vs miss from prod logs); prompt structure inventory |
| Anthropic official | Prompt caching (item **66** — what's left?), batch API, model choice, `max_tokens`, tool design, structured outputs |
| Community / industry | Curated tips from Claude docs, Anthropic cookbook, practitioner posts (with links) |
| Already shipped in TAV | Item **66** caching, **61** auto-accept >0.50, offline matcher fallback — what not to redo |
| Ranked recommendations | Impact (tokens saved) × effort × risk; each with “fast validation” check from §68 |
| Explicit non-goals | Things that would hurt MMR accuracy or add multi-day soak dependency |

### Research sources (starting list)

- [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Anthropic batch processing](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing)
- Item **66** implementation: `src/llm/ymmsPrompt.ts`, cache_control wiring
- Prod logs: `llm_ymms.anthropic_cache_usage` (read/create/write token breakdown)
- [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) — Phase 2+ backlog (vision, etc.)

### Candidate themes to evaluate (hypotheses — not decisions)

- Skip LLM when offline matcher is already confident (title + description sufficient)
- Shorter evidence tail / trim description length caps
- Narrower catalog tool payload per request
- Stronger pre-LLM heuristics (dealer blacklist §69, junk title filter)
- Model downgrade for easy titles vs hard titles (if accuracy holds)
- Batch API for non-real-time ingest slices (latency tradeoff)

### Implementation order (completed 2026-08-11)

1. ~~Review [`LLM-Token-Efficiency.md`](LLM-Token-Efficiency.md) with buyer/ops~~ ✓
2. ~~Implement approved items (#1, #3–#5, #7–#8)~~ ✓
3. ~~Deploy; measure via §68 playbook~~ partial — credits out blocks token-column verification
4. **When credits return:** confirm token columns populated, cache read/write ratios, MMR hit ≥ baseline

### Exit criteria

- [x] `docs/LLM-Token-Efficiency.md` drafted with ≥5 ranked recommendations (10 ranked — see doc §5)
- [x] Buyer sign-off on approved items (#1, #3–#5, #7–#8; rejected #2, #6)
- [x] Implementation shipped — offline-first, Ford/Chevy prune, prefetch sort, evidence trim, alias fix, token columns
- [x] Migration `0069_llm_ymms_token_usage` applied to Supabase
- [x] **Deploy Worker** — staging `46ac09a2` + production `7cbd9844` (2026-08-11)
- [x] §68 validation post-credits — MMR ~60%, token columns, alias skip rate confirmed (2026-08-13)

### Related

- Item **68** — fast validation playbook
- Item **69** — pre-ingest dealer filter (non-LLM token win)
- Item **71** — AI dealer detection on first sighting (planned)
- Item **72** — MMR quality / alias over-trust (priority)
- Items **57**, **60**, **61**, **66** — existing LLM ingest stack

---

## 71 — AI dealer listing detection (pre-ingest)

**Opened:** 2026-08-13  
**Status:** [ ] **Scoped — not started**

**Product goal:** Detect **dealership listings from listing text** (title, description, seller name) **before** Y/M/M/S + MMR run — so first-time dealer inventory is filtered without waiting for a buyer dismiss (§69) or scraper seller fields.

**Problem today:** §69 only blocks **known** sellers (`blocked_sellers` keyed on `seller_url` / `seller_name`). Apify payloads often lack seller fields → blacklist empty → dealer inventory still burns Claude + MMR tokens and fills the queue. Buyers already flag **`dealer`** dismiss reason (item **47**), but that is reactive, not pre-ingest.

**Principle:** *Separate LLM task from item 57 Y/M/M/S.* Do **not** extend the Cox catalog prompt — dealer detection is a cheap classification call with its own prompt, tool schema, eval harness, and feature flag.

### Locked decisions (2026-08-13)

| Decision | Choice |
|----------|--------|
| Scope v1 | **`source=facebook`** + **`region=dallas_tx`** (same as §69) |
| Filter point | **After adapter**, **before** offline/LLM Y/M/M/S — same hook as `isBlockedSeller` in `runIngestItemLoop.ts` |
| Auto-reject gate | Only when `seller_type=dealer` **and** `confidence >= 0.85` (threshold tuned on eval — not locked until labeled set exists) |
| Lower confidence | Ingest continues as today (no regression on private-party edge cases) |
| On auto-reject | `writeFilteredOut(..., reason_code: "dealer_listing")` + log `ingest.dealer_listing_blocked`; optionally **upsert `blocked_sellers`** when seller URL/name present |
| Feature flag | `SELLER_CLASSIFY_ENABLED="false"` default; staging first |
| Model tier | Prefer **Haiku** (or cheapest sufficient model) — classification is simpler than Cox Y/M/M/S |
| Not in v1 | Vision/photos (RFP FR-3.5 Tier 3); salvage/junk classification; auto-learning from dismiss without eval |

### Proposed pipeline

```
adapter OK
  → §69 blocked_sellers lookup (seller key)     — already shipped
  → Phase 0: cheap text heuristics (optional)    — zero-token obvious dealers
  → Phase 1: classifyListingSeller (Claude)      — only if flag on + heuristics ambiguous
       → dealer + high conf → filter + optional blacklist upsert
       → else → normal ingest (offline / LLM YMMS → MMR)
```

### Phase 0 — heuristics (do first, no API cost)

Regex / rules on title + description + seller name before any LLM call:

- Financing / CARFAX / “we finance” / “bad credit OK”
- Business suffixes (LLC, Auto Group, Motors, Dealership)
- Lot / inventory language (“over 100 vehicles”, “visit our lot”)
- Multiple vehicles mentioned in one listing

**Output:** `dealer_heuristic` → skip listing immediately, or pass through to Phase 1 when ambiguous.

### Phase 1 — text LLM (v0)

**Inputs** (reuse item **60** extractors): `title`, `description`, `sellerName`, `price`, `location` — from `extractLlmListingTextFromIngestItem` + adapter fields.

**Structured output (tool schema):**

```json
{
  "seller_type": "dealer" | "private_party" | "curbstoner_suspected" | "unknown",
  "confidence": 0.0,
  "reasoning": "one sentence",
  "signals": ["financing_language", "business_name", "..."]
}
```

**Primary files (when implementing):**

| Piece | Pattern / path |
|-------|----------------|
| Prompt + tool | new `src/llm/sellerClassifyPrompt.ts` (mirror `ymmsPrompt.ts`) |
| API caller | extend `src/llm/anthropicClient.ts` or thin wrapper |
| Resolver | new `src/valuation/classifyListingSeller.ts` |
| Ingest hook | `src/ingest/runIngestItemLoop.ts` — after §69 check, before norm/dedupe/LLM YMMS |
| Eval harness | new `scripts/eval-seller-classification.mjs` (`npm run eval:seller-classify`) |
| Audit (optional v1) | new table or extend `filtered_out` details — TBD in Phase 0 |

### Phase 2 — vision (later backlog)

- Requires persisted listing photos (FB URLs expire; RFP R2 capture)
- Low-confidence text → optional photo follow-up
- See [`docs/TAV API.md`](TAV%20API.md) seller classification section + item **57** vision tier backlog

### Eval before production (non-negotiable)

Build **50–100 buyer-labeled listings** (dealer / private / curbstoner) from dismiss reasons + manual review. Measure precision/recall at auto-reject threshold. **Do not** wire to production ingest until eval shows acceptable false-positive rate on private-party listings.

### Cost control

- Run **before** Y/M/M/S — saves more tokens than the classification call costs when dealer rate is meaningful
- Skip LLM when Phase 0 heuristics are confident
- Optional: cache classification by `(seller_url | seller_name | normalized title hash)` in KV for repeat posters

### Relationship to §69

| Mechanism | When it helps |
|-----------|----------------|
| §69 buyer dismiss → `blocked_sellers` | Repeat listings from **same seller key** (needs scraper seller fields) |
| §71 AI text classification | **First sighting** — no prior buyer flag required |
| §71 + seller URL on reject | Seeds blacklist so §69 handles repeats even before next buyer dismiss |

### Implementation order

1. **Phase 0** — heuristics module + unit tests; wire to `writeFilteredOut` behind flag
2. **Eval set** — export labeled rows from dismiss=`dealer` + private-party controls
3. **Phase 1** — prompt + resolver + eval script; tune confidence threshold on eval
4. **Staging soak** — `SELLER_CLASSIFY_ENABLED=true` on staging only; §68 fast-validation metrics (`ingest.dealer_listing_blocked`, token savings, false-positive spot-check)
5. **Production** — only after staging sign-off

### Exit criteria

- [ ] Labeled eval set (≥50 rows) with documented precision/recall at chosen threshold
- [ ] Phase 0 heuristics shipped with unit tests
- [ ] Phase 1 text classifier + eval script; `SELLER_CLASSIFY_ENABLED` flag
- [ ] Ingest hook filters high-confidence dealers before Y/M/M/S
- [ ] Optional blacklist upsert on reject when seller fields present
- [ ] Staging validation: dealer volume down, no material private-party false-positive reports
- [ ] `docs/TAV API.md` cross-link updated when shipped

### Related

- Item **47** / **45** — dismiss + `dealer` reason (shipped)
- Item **69** — seller-key blacklist (shipped; scraper-blocked)
- Item **68** — fast validation playbook
- Item **57** — separate LLM stack; seller classification explicitly **not** part of Y/M/M/S prompt
- Item **70** — token savings compound when junk listings never reach Claude Y/M/M/S
- [`docs/TAV API.md`](TAV%20API.md) — RFP FR-3.5 seller classification notes

---

## 72 — MMR quality: identity accuracy over alias speed

**Opened:** 2026-08-13  
**Status:** [~] **Phases 0–1 shipped to production 2026-08-13** — post-deploy validation pending; Phases 2–5 not started

| Commit | What | Staging | Production |
|--------|------|---------|------------|
| `1b75ab3` | Year floor + first (inline) retry | `7ade46ca` | `c7a3341a` |
| `bea3556` | Workers Logs enabled | `2f7f133e` | `e1242be2` |
| **`31e1724`** | **Retry moved out of the batch (current)** | **`eff0caa3`** | **`e779a844`** |

**Watch after this deploy (§68 playbook):** `ingest.mmr_no_data_retry` recovery rate, Anthropic spend (the retry roughly doubles Claude calls — ~2.2k `cox_no_data`/day each now costing one extra Claude + one extra Manheim call), `cox_rate_limited` trend, and MMR hit on eligible inventory. Roll back by redeploying the prior version if rate limiting climbs materially.

**Product goal:** **Near-universal MMR evaluation on eligible vehicle inventory** — every real private-party listing that Manheim can price should get a wholesale number at ingest. **~59% MMR hit today is unacceptable.** Target: **85–90%+** on Dallas FB eligible inventory in weeks (not “stable at 60%”).

**Buyer mental model (correct):** Parse listing → load all Cox model/style options for `(year, make)` → send catalog + listing evidence to AI → AI picks exact Y/M/M/S → Manheim returns MMR.

**What actually happens today:** That AI path (**item 57**) exists, but **~80% of listings skip Claude** via **`alias_hit`** (learned memory) or **`offline_hit`** (rules). §**70** optimized for token cost and speed — not pick accuracy. When the shortcut sends the **wrong** Cox tokens, Manheim returns **`cox_no_data`** and the listing lands in Scraper review with no price.

### Production evidence (Dallas FB, 2026-08-13, last 24h)

| Metric | Value |
|--------|------:|
| MMR hit rate (listings) | **~59%** |
| Valuation attempted, missed | **~40%** |
| Miss reason **`cox_no_data`** | **66%** of all misses |
| **`cox_no_data` rows traced to `alias_hit`** | **~85%** (~1,895 / 2,237) |
| Listings skipping Claude (`alias_hit` + `offline_hit`) | **~81%** |
| **`llm_ymms_decisions.normalized_listing_id` populated** | **0%** (audit gap) |
| Miss snapshots storing Cox tokens sent (`lookup_*`) | **Not wired** from ingest |

**Interpretation:** Failures are **wrong identity sent to Manheim**, not “Manheim has no book.” Aliases pass **`isCatalogAliasValid`** (row exists in `cox_catalog_tree`) but map the **wrong trim/variant** for this listing.

### Example failures (`alias_hit` → `cox_no_data`)

| Listing | Alias sent to Cox | Why wrong |
|---------|-------------------|-----------|
| 2023 Corolla **Sport** | `COROLLA` / **4D SEDAN SE** | SE ≠ Sport |
| 2017 Rogue **Sport** | `ROGUE AWD 3C` / **SV** | Rogue Sport ≠ Rogue SV |
| 2017 Altima **2.5 S** | `ALTIMA FWD` / **4D SEDAN SR** | S ≠ SR |
| 2017 Civic **LX Hatchback** | `CIVIC` / **4D SEDAN LX** | Hatchback ≠ Sedan |
| 2017 Cherokee **Sport** | `CHEROKEE FWD` / **LATITUDE PLUS** | Sport ≠ Latitude |

Mainstream vehicles — not exotic Cox gaps.

### Other miss buckets (same 24h window)

| Reason | Count | Fix class |
|--------|------:|-----------|
| `cox_rate_limited` | 487 | Infra — retry/queue |
| `model_variant_missing` | 323 | Identity — AWD/FWD, cab/bed |
| `trim_missing` | 265 | Identity — style never resolved |
| Dealer-like description (within `cox_no_data`) | ~626 | Filter — §71 |
| FB parser pollution (`altima 2.5`, `equinox lt` in model field) | ~599 | Parser — split trim from model |

### Intended identity ladder (quality-first — §72 target state)

```
parse listing (title, description, photos when available)
  → optional: dealer/junk filter (§71)
  → VIN path when present (high confidence)
  → alias lookup ONLY if trim evidence matches (strict gate)
  → offline matcher if confident
  → Claude: full (year, make) catalog subtree + listing text (+ vision when ambiguous)
  → validate pick exists in cox_catalog_tree BEFORE calling Manheim
  → Manheim MMR
  → if cox_no_data after alias_hit: BAN alias + retry full ladder (do not accept miss)
  → if still miss: persist suggestions + Scraper review
```

**Principle:** *Quality over alias skip rate.* Token cost is secondary to getting the right Y/M/M/S. Re-run Claude when shortcuts fail — do not treat `cox_no_data` as terminal on first attempt.

### Locked decisions (2026-08-13)

| Decision | Choice |
|----------|--------|
| Priority | **Above §70 token savings** — accuracy regressions from alias skip are the top ingest defect |
| Scope v1 | **`source=facebook`** + **`region=dallas_tx`** (same as §68) |
| **`alias_hit` gate** | Require trim/title token overlap with alias key; reject weak single-token trims (`sport`, `lt`, `ex`) without variant match |
| **`alias_hit` + `cox_no_data`** | **Ban/invalidate alias** + **retry** without alias (Claude + offline); log `ingest.alias_cox_no_data_retry` |
| **Pre-Manheim validation** | Never call intel worker if pick not in `cox_catalog_tree` for `(year, make)` |
| **Photos** | **Not in Phase 1** — Phase 3 vision follow-up (item 57 backlog); text retry first |
| **Metric** | Track **MMR hit % on eligible inventory** (exclude `missing_ymm`, dealer-filtered) — not raw scrape % |
| **Observability** | Populate `llm_ymms_decisions.normalized_listing_id`; pass `lookup_make/model/trim` on miss snapshots |

### Implementation phases

**Phase 0 — Year-floor alignment (shipped 2026-08-13; commit `1b75ab3` — see deploy table above)**

Denominator hygiene, done before the alias work so Phase 1–2 lift is measured against eligible inventory only. Two changes, in opposite directions:

- **Skip valuation below 2011.** `VALUATION_MIN_YEAR` (new `src/valuation/valuationEligibility.ts`) mirrors `SCRAPER_REVIEW_MIN_YEAR`, so we value exactly what Unprocessed Leads shows. No-VIN listings older than that now short-circuit before the catalog cascade and the Manheim call with new miss reason **`year_below_valuation_floor`**; VIN listings are exempt. **113 listings/day** at a **20.4%** hit rate stop consuming a catalog + MMR round-trip each. A drift test asserts the two floors stay equal.
- **Extend the catalog tree down to 2011** (`COX_CATALOG_MIN_YEAR` 2013 → 2011, plus `scripts/sync-cox-catalog.mjs`). **Correction to the original plan:** 2011–2012 listings were *not* dead weight — **534/day** were already reaching MMR at **35.2%** through the live catalog cascade, because alias/offline/Claude all bail out on `catalog_not_synced` without tree rows. Skipping them would have destroyed ~188 real valuations/day. Syncing the tree instead puts them on the same identity ladder as 2013+ (**63.0%**).

Measured Dallas FB, 24h to 2026-08-13: raw hit **60.6%**; eligible-only (2011+ or VIN) **63.0%**. Tests 1,357 green; lint + typecheck clean.

**Still to do for Phase 0:** run the catalog sync for **2011–2012** (cron picks up missing years once deployed; verify row counts), then deploy Worker to staging → production and re-measure per the §68 playbook. Report MMR hit on eligible inventory from here on, excluding `year_below_valuation_floor`.

**Phase 1 — Alias failure recovery (P0, highest ROI) — shipped 2026-08-13; final form in commit `31e1724`, production `e779a844`**

On `cox_no_data` from the Y/M/M path, ingest retires the alias behind the pick (when the resolution was `alias_hit`), re-asks Claude with `skipShortcuts` and the rejected `model / style` named in the prompt, and re-prices once. Recovered picks are marked `confidence: "low"` / `normalizationConfidence: "partial"` and are deliberately **not** fed back into item 65 alias learning.

> ### ⚠ The retry must not run inside the ingest item loop
>
> **First cut ran inline and never fired in production.** It required 10s of remaining batch budget before retrying. But ingest already spends its full `BATCH_TIMEOUT_MS` (23.5s effective) on 7 listings and truncates — the same 5-minute window that produced the evidence below also logged `ingest.batch_deadline_hit` and `ingest.chunked.slice_truncated`. Every candidate was rejected with `reason: batch_deadline`:
>
> ```
> ingest.mmr_no_data_retry_skipped
>   year: 2012, make: dodge
>   model: "CHARGER 2WD V6", style: "4D SEDAN POLICE"
>   reason: "batch_deadline"
> ```
>
> (A civilian Charger priced as a police interceptor — exactly the failure the retry exists to fix.) **Anything added to the per-item path competes with a budget that is already exhausted.** The retry now runs after the loop via `execCtx.waitUntil`, outside the deadline.

| Guard | Behaviour |
|-------|-----------|
| Placement | Runs post-loop via `waitUntil` — no batch-deadline competition |
| Cap | `MAX_RETRIES_PER_SLICE = 10` per ingest slice |
| Claude repeats the pick | No Manheim call (`ingest.mmr_no_data_retry_skipped`, `reason: same_pick`) |
| Claude unavailable | No Manheim call; reason is the fallback kind |
| Retry also has no book | Original `cox_no_data` miss stands |
| Alias learning | Suppressed via `skipAliasLearning` |
| Prompt caching | Rejected pick goes in the per-listing evidence block, never the cached catalog prefix (item 66 still hits) |

Recovered listings **append** a hit snapshot; `buildListingDiagnostics` keeps the newest `fetched_at` per listing, so the hit supersedes the miss with both kept for audit. Max buy is scheduled for recovered listings so they don't reach the queue without a number (item 59 parity).

Logs: `ingest.mmr_no_data_retry` (`recovered`, kpi), `valuation.recovered_after_no_data` (kpi), `ingest.cox_no_data_retry_pass` (candidates/attempted/recovered, kpi), `ingest.mmr_alias_retired_after_no_data` (kpi), `ingest.mmr_no_data_retry_skipped`.

**Also closes a Phase 3 observability gap:** `lookup_make/model/trim` are now persisted on `cox_no_data` miss snapshots, so a miss can be triaged without re-deriving the sent tokens from logs.

Files: `coxNoDataRetryPass.ts` (new), `workerClient.ts` (`retryMmrAfterCoxNoData`, `skipAliasLearning`, lookup tokens on miss), `resolveListingWithLLM.ts` (`skipShortcuts`, `rejectedPicks`), `ymmsPrompt.ts`, `mmrStyleAliases.ts` (`deleteMmrStyleAlias`), `runIngestItemLoop.ts`. Tests: `valuation.mmrNoDataRetry.test.ts` (7) + ingest wiring tests; suite 1,367 green.

**Root-cause correction (2026-08-13):** the failing cohort is **not** mainly wrong *trim* (Corolla Sport → SE). It is Cox models split by **engine or drivetrain** where the listing text does not state either — `CAMRY 4C` vs `CAMRY V6`, `YUKON 2WD FFV` vs `4WD`, `ACADIA AWD` vs `FWD`. Clean 24h window (the earlier 7-day read was skewed by the Aug 11 credit outage): **GMC 44.5%**, **Toyota 57.2%**, while **Ford 78.5%**, **RAM 78.2%**, **Cadillac 80.5%** are healthy. Worst offenders: `gmc sierra 1500` 17/95, `toyota camry` 18/90, `gmc yukon` 17/70, `toyota tacoma double` 6/54, `gmc acadia` 2/34 — against `toyota rav4` 69/74 and `highlander` 19/23, which the listing text disambiguates.

**Rejected alternative:** blind sibling-variant retry (walk the catalog for models sharing a style). Cheaper and needs no Claude call, but siblings sharing a style include genuinely different vehicles (`YUKON` vs `YUKON XL`, `2500HD SIERRA` vs `3500 SIERRA`) and different powertrains, so "first variant Manheim books" can return a **wrong price** — worse than no price under the never-mislead-a-buyer principle. Claude re-ask keeps the pick evidence-based.

**Observability:** `[observability]` was **not** enabled on this Worker — every structured `log()` event was being written to nowhere. Added to top level + both envs in `wrangler.toml` (commit `bea3556`). Note environments do not inherit it, same as `[vars]`. Without this none of the KPI events above are queryable.

**First post-deploy reading (2026-08-13 ~14:50Z, Dallas FB):**

| Window | Attempts | Hit % | `cox_no_data` share of misses |
|--------|---------:|------:|------------------------------:|
| Prior 24h baseline | 8,332 | **60.7%** | 67% |
| Last 30 min | 223 | **75.3%** | 38% |
| Since `e779a844` | 38 | 71.1% | — |

**Do not treat 75.3% as the lift yet.** The same clock window yesterday already ran ~69.5%, so time-of-day explains part of it, and 30 minutes is a small sample. The more interesting signal is the **miss composition**: `cox_no_data` fell from 67% to 38% of all misses. Some of that is the year floor trimming pre-2011 inventory out of the denominator rather than the retry recovering anything — **0 same-slice recoveries observed so far** on only 4–21 candidates.

**Still to do:** 24h cohort per the §68 playbook — `ingest.cox_no_data_retry_pass` (candidates / attempted / recovered), Anthropic spend vs the accepted ~2× Claude calls, `cox_rate_limited` vs ~470/day baseline, and confirm the 06:00 UTC cron synced `cox_catalog_tree` for 2011–2012.

**Phase 2 — Stricter alias acceptance (P0)**

- In `resolveListingWithLLM.ts` `alias_hit` path: require listing trim/title tokens to overlap canonical style tokens; reject alias when body style conflicts (hatchback vs sedan, Sport vs SE/SR).
- Stop learning aliases from picks that later produce `cox_no_data` (extend §65 guardrails).

**Phase 3 — Parser + observability (P1)**

- Facebook adapter: split trim from polluted model strings (`altima 2.5`, `equinox lt`, `tacoma double`, `suburban ltz`, …).
- Wire `lookupMake/lookupModel/lookupTrim` into `writeValuationMissSnapshot` from `runIngestItemLoop.ts`.
- Populate `normalized_listing_id` on `insertLlmYmmsDecision`.

**Phase 4 — Infra + filter (P2)**

- Retry queue for `cox_rate_limited` (~15% of non-`cox_no_data` misses).
- §71 dealer text filter — remove junk from denominator.

**Phase 5 — Vision (P3, item 57 Phase 2)**

- Persist listing photos (R2); on ambiguous text or failed text retry, Claude vision pass for body style / trim.
- See [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) vision tier backlog.

### Expected impact (order-of-magnitude)

| Stage | Approx MMR hit |
|-------|----------------|
| Today | **~59%** |
| Phase 1–2 (alias recovery + strict gate) | **~75–80%** |
| Phase 3–4 (parser + rate limits + dealer filter) | **~85–90%** |
| Phase 5 + VIN + buyer Apply loop | Approach **100% on eligible inventory** |

Literal **100% on all scraped rows** is not the target (motorcycles, parts cars, dealer lots, true Cox gaps).

### Primary files

| Area | Path |
|------|------|
| Identity ladder | `src/valuation/resolveListingWithLLM.ts`, `src/valuation/workerClient.ts` |
| Alias lookup / learn | `src/persistence/mmrStyleAliases.ts`, `src/valuation/learnIngestStyleAlias.ts`, `src/valuation/catalogAliasValidation.ts` |
| Ingest loop | `src/ingest/runIngestItemLoop.ts` |
| FB parser | `src/sources/facebook.ts` |
| Miss audit | `src/persistence/valuationSnapshots.ts`, `src/persistence/llmYmmsDecisions.ts` |
| Claude prompt | `src/llm/ymmsPrompt.ts`, `src/llm/anthropicClient.ts` |

### Exit criteria

- [x] Phase 0 — valuation year floor aligned to `SCRAPER_REVIEW_MIN_YEAR`; catalog floor lowered to 2011 (code + tests, 2026-08-13)
- [ ] Phase 0 — `cox_catalog_tree` synced for 2011–2012; Worker deployed; eligible-inventory hit rate re-measured
- [x] `alias_hit` + `cox_no_data` triggers ban + retry; unit tests for engine/drivetrain variant cases (2026-08-13, code only)
- [ ] Stricter alias acceptance shipped; false alias hits measurably down on staging
- [ ] MMR hit **≥ 75%** Dallas FB eligible inventory (24h window, §68 playbook)
- [ ] `lookup_*` persisted on all miss snapshots; `llm_ymms_decisions` links to `normalized_listing_id`
- [ ] Documented before/after cohort (same §68 methodology as item 55 Phase C)
- [ ] Phase 5 vision scoped separately — not blocking Phase 1–2

### Related

- Item **57** — Claude full-catalog Y/M/M/S path (runs when not skipped)
- Item **65** — alias learning (must not learn from bad picks; extend with §72 ban rules)
- Item **70** — token efficiency (**tradeoff** — alias skip rate vs accuracy; §72 rebalance)
- Item **55** Phase D / **0070** — alias quality fix (necessary but insufficient)
- Item **71** — dealer filter (denominator + token waste)
- Item **68** — fast validation playbook for measuring lift
- Item **64** — catalog floor (2013+); separate from wrong-token failures

---

## 64 — Extend Cox catalog to 2013 + improve MMR hit rate

**Opened:** 2026-07-25 (buyer case: **2015 BMW X3 xDrive28d** — description had full trim/diesel; ingest **`trim_missing`**; MMR only after manual MMR Lab Cox pick)

**Problem:** Live-ingest **MMR hit rate ~68%** (3,530 listings since 2026-07-23 17:00 local). **~32%** land in Scraper review / no MMR. Buyer inventory includes **2013–2015** vehicles; today’s offline path does not cover them well.

### Current catalog floor (2026-07-25)

| Layer | Year range today | Effect on pre-2016 |
|-------|------------------|---------------------|
| **`tav.cox_catalog_tree`** | **2016–2027** (`buildCoxCatalogYearRange`: current−10 … current+1) | No rows for **2013–2015** |
| **Item 57 LLM** | Gated on `hasCoxCatalogTreeForYear` | **`catalog_not_synced`** — Claude **never called** (description unused) |
| **Offline matcher (item 55)** | Same tree gate | Skipped |
| **Live catalog fallback** | Cox API supports older years | Uses **title + trim only** — not **description** |

**Example (production):** Listing `a36595cc…` — title `2015 BMW X3`, description *"2015 BMW X3 AWD 4dr xDrive28d Automatic"* + diesel; Cox style for MMR Lab = `X3 4D SUV 28D XDRIVE` under model `X SERIES`. Ingest: **`trim_missing`**, no `lookup_trim`. **44** listings with **`trim_missing`** on **2015** alone in recent cohort.

### Goal

1. **Extend Cox catalog options through 2013** — sync **`cox_catalog_tree`** for **2013–2027** (buyer request: **down to 2013**).
2. **Raise ingest MMR hit rate** — from ~**68%** toward a higher sustained target (measure on live ingests, same cohort rules as item **55** Phase C).

### Implementation sketch

1. **Catalog sync** — widen `buildCoxCatalogYearRange()` (or set explicit floor **2013**) in `src/catalog/intelCatalogClient.ts`; run admin/cron sync for **2013, 2014, 2015** (and any other missing years). Update item **55** Phase C docs / cron behavior (`missing`-years mode should pick these up once range widens).
2. **LLM (item 57)** — after tree populated, pre-2016 listings get Claude + full Cox subtree; item **60** description already wired in prefetch.
3. **Live matcher gap (follow-up)** — pass **description** (and/or enriched title) into `resolveListingToCatalogForIngest` / `rankCatalogStylesForListing` when title is sparse — item **60** alone does not help when LLM is tree-gated.
4. **Measure** — re-run funnel on live ingests: overall MMR hit %, `trim_missing` / `model_variant_missing` / `catalog_not_synced` shares, pre-2016 sub-cohort.

### Related

- Item **55** / **57** / **60** — catalog tree, LLM, listing text
- Item **59** — Max buy depends on ingest MMR hit + Cox tokens
- [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) — item **61** noted pre-2016 gap

### Exit criteria

- [x] `cox_catalog_tree` populated for **2013–2015** (verify row counts per year/make) — **~2.6k / ~2.9k / ~3.2k rows** per year; **44,675** total tree rows (2026-07-27)
- [x] LLM + offline matcher run for **2013+** listings (no `catalog_not_synced` solely due to year floor) — **0** `catalog_not_synced` in 4-day window
- [ ] **2015 BMW X3**-class re-ingest: Cox style resolved from description → **ingest MMR hit** (not manual MMR Lab) — no matching ingests in soak window
- [ ] Live-ingest **MMR hit rate** measurably above ~**68%** baseline — **not met overall**; **~73%** when excluding `llm_unavailable` (credit outage), flat vs prior 2d; pre-2016 **~58%** (+4 pts)
- [x] Top miss reasons (`model_variant_missing`, `trim_missing`, `cox_no_data`) down vs 2026-07-25 baseline — **`model_variant_missing`** 766→398, **`trim_missing`** 334→229 (clean 2d compare); `cox_no_data` slightly up

### Soak notes (2026-07-27, 4-day window)

Measured on `valuation_snapshots`; exclude `llm_unavailable` for fair LLM-on comparison (Anthropic credits ran out 7/26).

| Metric | Prior 2d (clean) | Last 2d (clean) |
|--------|------------------|-----------------|
| Overall MMR hit | **73.7%** | **72.1%** |
| Pre-2016 (2013–15) | **54.0%** | **58.3%** |
| 2015 only | 47.6% | **55.9%** |

**Verdict:** Catalog extension + description-in-matcher = **modest pre-2016 win**, not a big overall lift. Refill credits and re-soak before closing item.

---

## 65 — LLM → offline matcher learning loop

**Opened:** 2026-07-27 (buyer question: can production `llm_ymms_decisions` improve the pre-LLM CF Worker path?)

**Problem:** Item **57** Claude calls cost money and fail when credits run out (`llm_unavailable` spiked ~45% of misses during the 7/26–27 outage). Item **55** offline matcher (`matchListingToCoxCatalog.ts`) still runs as fallback but did not learn from Claude's successful picks until item **65**. As of 2026-07-28, **`mmr_style_aliases` may still be empty** until enough post-deploy `llm_hit`+MMR ingests accumulate — check Supabase before closing the alias soak.

**Goal:** Use LLM selections as a **teacher** for the deterministic ingest path — reduce repeat Claude calls, improve offline fallback when LLM is down, without trying to replicate full LLM reasoning in heuristics.

**What production data offers (7-day sample, pre-outage):**

| Signal | Count | Use |
|--------|-------|-----|
| `llm_hit` (avg conf **0.81**) | ~5,500 | High-trust `(title/make/model/trim) → Cox style` mappings |
| `llm_needs_review` (avg conf **0.49**) | ~2,100 | Candidate aliases only when MMR also hit or buyer confirmed |
| `llm_invalid_pick` | ~20 | Negative examples — do not learn |

**Implementation sketch (when picked up — read [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) §Phase 3 first):**

1. **Alias learning (highest ROI) — Phase 1 shipped + deployed 2026-07-27; extended 2026-08-11 (§70):** After ingest `llm_hit` or **`offline_hit`** + MMR hit, `maybeLearnIngestStyleAlias` (`src/valuation/learnIngestStyleAlias.ts`) upserts `mmr_style_aliases` (`source: "ingest_learned"`) keyed on raw `(make, model, trim)` → Cox tokens from the LLM/offline pick. Wired in `performMmrCall` (`workerClient.ts`); best-effort, never blocks ingest. Code `834c9ac`; prod `aadd46ef`; §70 alias fix + offline learning on prod `7cbd9844`. **No historical backfill** — aliases populate forward on new ingests only until optional backfill script.
2. **Offline scorer tuning** — Mine `llm_ymms_decisions` for systematic offline-matcher misses: variant parser gaps (`"cherokee latitude"` → `CHEROKEE FWD V6`), hybrid model splits (`SONATA HYBRID`), truck cab/bed tokens. Update `selectCatalogModelVariant.ts`, signal bonuses in `matchListingToCoxCatalog.ts`, and item **64** `listingCatalogEvidence.ts` — not open-ended ML.
3. **Eval harness** — Extend `scripts/eval-llm-ymms.mjs` (or new script) to score offline matcher **before vs after** alias/rules against historical `llm_hit` rows; target ≥X% recall on repeat combos without Claude.
4. **Trust rules** — Do **not** auto-learn from `llm_invalid_pick`, sub-0.5 confidence, or picks with no MMR hit. Buyer detail **Apply** on suggested match remains gold-label override (existing item **46** loop).
5. ~~**Known offline bug** — Fix `parserGarbagePenalty` regex in `matchListingToCoxCatalog.ts`~~ — **fixed 2026-08-11** (§55 Phase D; staging `57cafd1c`, prod `64c6ea94`).

**Related:** item **57** (LLM resolver, alias fast-path already wired in `resolveListingWithLLM.ts`), item **55** (offline matcher), item **46** (manual Apply → alias), item **64** (description evidence).

**Not in scope:** Replacing Claude with offline-only; vision tier; seller classification.

### Exit criteria

- [x] Accepted LLM picks (`llm_hit` + MMR hit) persist to `mmr_style_aliases` (`ingest_learned`) — deployed prod `aadd46ef`; forward soak pending
- [x] No bad aliases from low-confidence or MMR-miss picks — **guardrails shipped 2026-08-13** (catalog validation, no empty-trim learn, migration 0070 purge)
- [~] Repeat listing combos resolve via alias fast-path without Claude call — **9,607 `alias_hit` / 24h** post-credits; forward soak ongoing
- [ ] **§72:** alias fast-path must not produce `cox_no_data` at scale — ban + retry when it does
- [ ] `LLM-YMMS-Normalization.md` §Phase 3 updated when shipped

---

## 66 — Anthropic prompt caching for item 57 Y/M/M/S

**Opened:** 2026-07-27 (buyer feedback: ~**$200** Anthropic spend in ~4 days at current ingest volume)

**Status:** **Shipped 2026-07-27** — `bdf3e20`; staging `150eb51b`, production `aadd46ef`. Cost/funnel soak pending.

**Problem (pre-ship):** Every ingest Y/M/M/S call sent the **full Cox catalog subtree** for `(year, make)` in the user prompt (~**175** rows median, **429** p90; Ford/Chevy **300–450+**). That block is **identical** across thousands of listings for the same year+make, but `callAnthropicForYmms` sent it as uncached input every time — the dominant token cost driver alongside **`claude-sonnet-5`** on **every** listing (item **57**). **Fixed:** catalog prefix + system + tool now use Anthropic prompt caching (item **66**).

**Goal:** Add Anthropic **prompt caching** so the stable prefix (system prompt + catalog subtree for a given year+make) is cached and reused across ingests — **lower cost with no change** to the deterministic Cox gate.

**Spec / API reference:** [`docs/03-api/claude-prompt-caching.md`](03-api/claude-prompt-caching.md) — read first in a fresh chat.

**Shipped implementation (`bdf3e20`):**

1. **`src/llm/ymmsPrompt.ts`** — split into `buildYmmsCatalogCacheText` (stable per year+make) + `buildYmmsListingEvidenceText` (per listing); catalog block precedes evidence in the API payload.
2. **`src/llm/anthropicClient.ts`** — `cache_control: { type: "ephemeral" }` on system, tool, and catalog user block; listing evidence uncached.
3. **Eval script** — `scripts/eval-llm-ymms.mjs` mirrors the same payload shape.
4. **Observability** — structured log `llm_ymms.anthropic_cache_usage` with read/write/uncached token counts; per-row token columns on `llm_ymms_decisions` via migration **`0069`** (§70, 2026-08-11).

**Related:** item **57** (LLM resolver), item **65** (alias skip — complementary cost lever), [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) §cost discipline.

**Not in scope here:** Model downgrade (Haiku tiering) — separate item if needed. **Now shipped elsewhere:** offline-first gating (§70), catalog pre-filter/prune (§70), dealer pre-filter (§69 — blocked on scraper).

### Exit criteria

- [x] `callAnthropicForYmms` uses prompt caching for the `(year, make)` catalog prefix
- [ ] Production ingest: measurable reduction in Anthropic input cost per listing (document baseline + after)
- [ ] No regression in MMR hit rate or valid-Cox-token rate vs pre-cache baseline
- [ ] `LLM-YMMS-Normalization.md` updated with ship date / cache strategy

---

### Known issues (deferred)

- UX backlog §4–7 — resume after **45/47** (or in parallel once flag/dismiss is clear)
- `handoff.md` production deploy dates stale — refresh after queue + detail fixes land in prod smoke
- Item **43** optional: measure p95 tab-switch latency in production after `e55015b`; Worker SQL push only if still slow
- Item **52** optional: global pending style on async buttons; app-wide shell lag only if buyers still report after queue fix

### Recently resolved (reference)

**Item 55 Phase B — Ingest listing→Cox catalog Y/M/M/S (2026-07-13)** · `b2064dd`  
`resolveListingToCatalogForIngest` in Worker runs before MMR lookup: case-match make, fuzzy/strip model (`sportage fe`→Sportage+FE), drivetrain variant selection, title-aware style pick. Deployed `tav-aip-production` `ccde935f`. Post-deploy smoke: ingest + valuation active; funnel re-measure on new scrapes still pending.

**Item 56 — Apify missed-run backfill (2026-07-13)**  
Direct Supabase load of outage-window Dallas/OK scrapes into Scraper review with original Received times (~5k listings). Live webhook path fixed earlier (`347ca3c`). No full Cox/lead replay.

**Apify custom-task ingest (2026-07-13)** · `347ca3c`  
Production no longer skips Dallas/Oklahoma custom scrapes as `unmapped_task`; custom-scraper price/location adapter shipped.

**Item 46 — Cox Y/M/M autofill (2026-07-11)**  
`resolveListingToCatalog` (fuzzy model + style + drivetrain variants); Vehicle **Use listing identity** applies + saves + shows parser→Cox diff; **Open in MMR Lab** with canonical query params. Manual submit uses the same resolver.

**Item 54 complete — no invent miles (2026-07-11)**  
Ingest `workerClient` no longer calls `getMmrMileageData` to invent odometer; YMM/VIN omit mileage when unknown; snapshots store null; badges show Mileage unknown for new rows. Docs: `manheim-cox.md` odometer optional. Historical invented-miles snapshots unchanged.

**Item 44 — Listing posted date / Listed column (2026-07-11)**  
Facebook ingest persists `postedAt` (`listing_date_ms` → `posted_at`). Queue **Listed** shows relative time + absolute tooltip; detail listing block shows Listed + Received; sort `posted_desc`. New ingests only — historical rows stay null until re-scraped or backfilled.

**Item 55 Phase A — Scraper review mode (2026-07-11)**  
`SCRAPER_REVIEW_MODE` (default off) + Opportunities **Scraper review** tab. Recent (48h) no-MMR scrapes and soft near-miss economics fails appear with clear badges; Needs action / All stay clean; lead upsert unchanged. Enable in wrangler `[vars]` for soak.

**Item 54 slices 1–2 — Max buy no invent + detail UX (2026-07-10)**  
Slice 1: `evaluateRun` / `getRecommendation` keep null mileage. Slice 2: detail Max buy gate drops mileage requirement; Vehicle catalog-matches `honda`→`Honda`; Valuation shows saved ingest MMR with provenance when live YMM/series incomplete. Ingest invent still open.

**Item 53 — Salesperson / Appraiser directory (2026-07-10)**  
`tav.staff_directory` seeded with buyer roster (`role = both` so the same names appear in Salesperson and Appraiser); detail dropdowns; Admin CRUD (deactivate/reactivate). Queue rows use real detail links for middle-click / open-in-new-tab.

**Item 45/47 — Flag/dismiss bad lead (2026-07-10)**  
Queue Flag action → reason dialog → `POST /app/opportunities/:id/dismiss` sets `bad_lead` with reason metadata; default views exclude suppressed statuses. Migration `0062_bad_lead_status`.

**Item 48 — VIN → Y/M/M/S + fresh MMR/Max buy (2026-07-10)**  
`decodeVinToVehicleSelection` on Vehicle blur/save; catalog fill via `hydrateVinAutofill`; Valuation remounts on identity key change.

**Items 43 + 52 — Queue tab latency / double-click (2026-07-09)** · `e55015b`  
Optimistic tab selection, 60s list `staleTime`, ok-only `placeholderData`, hover prefetch, tab spinner. Shell no longer unmounts on view change.

**Items 49 + 50 — VIN save wipe + Refresh valuation blank (2026-07-09)** · `fe50370` (+ `c374bf3`, `5ead1cd`)  
Detail client applies PATCH to local state; refresh keeps prior MMR/Max buy and restores on failure. Web-ci: during-render prop sync + `ApiResult` narrowing.

**Items 40–42 — Queue count parity + Received (2026-07-06)** · `6486776`  
Needs action / Mine badge vs table fixed; **Received** column + `received_desc` sort.

**Item 38 — Max buy refresh (2026-06-30)**  
Refresh valuation suppresses saved `maxbuySummary`, re-runs live Max buy, shows "Live evaluation".

**Item 39 — MMR confidence badge (2026-06-30)**  
Removed from detail Valuation card; remains in MMR Lab ResultBand.

---

## Previously active (complete — opportunity detail + MMR Lab)

| # | Item | Priority | Status |
|---|------|----------|--------|
| **34** | Opportunity detail E2E — blur-save + compact valuation assertions | Medium | [x] |
| **35** | MMR Lab URL prefill from opportunity detail (`?vin=` / YMM params) | Medium | [x] |

---

## Previously active (complete — MMR Lab polish)

| # | Item | Priority | Status |
|---|------|----------|--------|
| **21** | Odometer delta badge missing when Cox sends mileage-as-string | High | [x] |
| **22** | Grade not applied — UI CR grade must convert to Cox 10× integer | High | [x] |
| **23** | Grade & color deltas — exact Cox dollar amounts, no marginal / no Math.round | High | [x] |
| **17** | YMM parity vs Manheim â€” item selection + range source | High | [x] |
| **18** | MaxBuy `vehicle_context_missing` -- trust MMR result for VIN identity | High | [x] |
| **19** | Avg Condition 10x display bug -- `averageGrade` integer not normalized | High | [x] |
| **20** | Avg EV Battery Score -- identify correct Cox response field name | Medium | [x] |
| **16** | MMR adjustment accuracy â€” deploy fixes + smoke-test grade/build deltas | High | [x] |
| **15** | Retail value â€” enable Cox retail data (env var + entitlement check) | Medium | [x] |
| **2** | Year dropdown â€” pin recent years at top | Medium | [x] |
| **3** | Per-dropdown loading indicator | Medium | [x] |
| **4** | Auto-scroll to results on mobile after submit | Medium | [x] |
| **5** | Sticky SearchPanel header on desktop scroll | Medium | [x] |
| **6** | Value button â€” tooltip showing what field is missing | Medium | [x] |
| **7** | Style approximation notice â€” closeable banner above result band | Low | [x] |
| **8** | Mileage â†” Adjustments odometer sync | Low | [x] |
| **9** | Keyboard tab flow through disabled dropdowns | Low | [x] |
| **10** | Cleared-field highlight animation | Low | [x] |
| **24** | Opportunity detail — reorder blocks (Workflow ↓, Salesperson/Appraisal ↑) | High | [x] |
| **25** | Opportunity detail — remove Listing block | High | [x] |
| **26** | Opportunity detail — Vehicle “Additional Information” (Location, Source) | Medium | [x] |
| **27** | Opportunity detail — Valuation block: full MMR Lab (not Max buy only) | High | [x] |
| **28** | Opportunity detail — Title Information checkbox ↔ field pairing | Medium | [x] |
| **29** | Opportunity detail — Title block US state dropdowns | Medium | [x] |
| **30** | Opportunity detail — Workflow stepper: Landed → **Appraised** | High | [x] |
| **31** | Opportunity detail — Vehicle block: vAuto-style dropdown fields | High | [x] |
| **32** | Opportunity detail — auto-save on blur (no per-block Save buttons) | High | [x] |
| **33** | Opportunity detail — compact Valuation cards (MMR + Max buy summary, not full ResultBand) | High | [x] |

---

## Opportunity detail page — layout & valuation tweaks

**Route:** `/opportunities/[id]` · **Spec:** [`02-product/opportunity-detail-redesign.md`](02-product/opportunity-detail-redesign.md)  
**Status:** Items 24–33 shipped on `main` (compact Valuation cards, blur-save, MMR Lab prefill). See exit criteria in **§33** below.

First shipped layout (Phases 1–5) is being refined. Hero workflow CTAs stay in the hero; only collapsible block order and block contents change below.

**Save UX (product direction — see item 32):** Do **not** keep explicit **Save / Reset** on every editable block long term. When a closer edits fields and **focuses out of the block** (clicks or tabs elsewhere on the page), that block should **auto-save** if dirty. Replaces the block-level Save pattern from the original redesign doc.

### Target block order (top → bottom)

| # | Block | Change |
|---|--------|--------|
| 1 | Hero | unchanged |
| 2 | **Salesperson / Appraisal Information** | **move up** — replaces Workflow’s current slot (position 2) |
| 3 | Vehicle | add subblock (see **26**) |
| 4 | ~~Listing~~ | **remove** (see **25**) |
| 5 | Valuation | **compact MMR + Max buy summary cards** (see **33**); adjustments on expand; full workbench stays on `/mmr-lab` |
| 6 | Title Information | checkbox pairing (see **28**); full width after Valuation (no longer paired with Salesperson in 2-col grid) |
| 7 | Notes | unchanged |
| 8 | **Workflow** | **move down** — immediately **before** History |
| 9 | History | unchanged (collapsed by default) |

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx`

---

## 24 — Reorder Workflow and Salesperson / Appraisal blocks

**Goal:** Deprioritize workflow metadata on the page; elevate salesperson/appraisal fields for day-to-day closer work.

**Changes:**

- Move the **Workflow** collapsible block (stepper + `OpportunityWorkflowBlock`) from position 2 to **just above History**.
- Move **Salesperson / Appraisal Information** from the lower 2-column grid into **position 2** (where Workflow is today).
- **Title Information** stays as its own block; after this reorder it likely sits full-width between Valuation and Notes (confirm at implementation).

**Exit criteria:**

- [x] Block order matches table above
- [x] Hero primary/secondary workflow actions unchanged
- [x] Workflow stepper + assignment/claim UI still works after move
- [x] No duplicate workflow UI introduced

---

## 25 — Remove Listing block

**Goal:** Drop the Listing collapsible block entirely — provenance/intake fields duplicated elsewhere (hero one-liner, provenance line, Vehicle region) and the block adds clutter without buyer value.

**Changes:**

- Remove `<CollapsibleBlock title="Listing">` and `OpportunityListingBlock` from the detail page.
- Optionally delete or retain `opportunity-listing-block.tsx` for reuse elsewhere (implementer’s call); page must not render it.

**Exit criteria:**

- [x] Listing block not visible on `/opportunities/[id]`
- [x] Hero still shows listing URL, source, provenance as today
- [x] Update E2E/UAT if they assert Listing block presence

---

## 26 — Vehicle block: “Additional Information” subblock

**Goal:** Add a labeled sub-section inside the Vehicle block with two fields buyers expect near identity, without duplicating the removed Listing block.

**Fields (2-column grid inside subblock):**

| Field | Notes |
|-------|--------|
| **Location** | Human-readable location for the vehicle/deal (source TBD: new PATCH field vs map from `region` / contact address — confirm data model at implementation) |
| **Source** | Listing source (facebook, craigslist, etc.); likely read-only from `opportunity.source` with label formatting, or editable if product wants parity with manual submit |

**UI:** Subheading **“Additional Information”** below the main vehicle identity grid (VIN, odometer, YMM, etc.), same Save/Reset behavior as the parent block (or inherit parent save — implementer choice; prefer single block-level Save).

**Exit criteria:**

- [x] Subblock visible inside Vehicle collapsible panel
- [x] Location + Source displayed with consistent labels
- [x] Save persists if editable; read-only fields clearly styled if not PATCH-backed

---

## 27 — Valuation block: full MMR Lab (not Max buy only)

**Goal:** Match redesign §5 — one combined **miniature MMR Lab + Max buy** surface. Today buyers often see **Max buy only** (especially when `maxbuySummary` exists): `SavedVerdictCard` renders while `view` stays `"empty"`, so `ResultBand` / MMR adjustments never appear until “Run fresh lookup.”

**Changes:**

- Always surface MMR Lab UI when identity is sufficient: `ResultBand` (base/adjusted MMR, ranges, retail, adjustment panel, deltas).
- Keep Max buy below or beside MMR summary (`MaxbuyEvaluationSection`).
- Reuse shared MMR Lab pieces — do **not** fork Cox call logic:
  - `mmr-lab/_components/result-band.tsx`
  - `mmr-adjustments.ts`, `build-mmr-recompute-request.ts`, `build-mmr-lab-maxbuy-request.ts`
  - `maxbuy-evaluation-section.tsx`
- Preserve: saved verdict display, auto-run on load when no verdict, loading/error/empty states, vehicle PATCH → re-run MMR/Max buy (`router.refresh()` remount).
- Fix saved-verdict path so MMR is not hidden behind Max buy-only card (show both, or show MMR + saved Max buy summary together).

**Reference:** [`02-product/opportunity-detail-redesign.md`](02-product/opportunity-detail-redesign.md) §5 · [`07-buybox/MMR-LAB-ARCHITECTURE.md`](07-buybox/MMR-LAB-ARCHITECTURE.md)

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx`

**Exit criteria:**

- [x] MMR adjustments + result band visible on detail page when lookup succeeds (not only after manual “Run fresh lookup”)
- [x] Saved Max buy verdict still shown when present, alongside MMR (not instead of it)
- [x] Auto-run MMR + Max buy on load when identity sufficient and no saved verdict
- [x] Existing valuation block tests updated/extended

---

## 28 — Title Information: checkbox ↔ field pairing

**Goal:** Pair each warranty/title flag with its related input on the **same row** (vAuto-style), instead of grouping both checkboxes at the bottom of the block.

**Pairing:**

| Checkbox | Linked field |
|----------|----------------|
| **Certified** | **Owner** (`titleOwner` text input) |
| **Extended Warranty** | **Lien Payoff** (`lienPayoff` text input) |

**Intended UX (confirm at implementation if behavior differs):**

- **Layout:** Checkbox inline with or immediately adjacent to its linked textbox (same grid row).
- **Behavior:** Checking the box **enables** the linked field; unchecking **disables** (and optionally clears) it. Unchecked + empty linked field on save persists `null` / false as today.

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-title-information-block.tsx`

**Exit criteria:**

- [x] Certified + Owner share one row; Extended Warranty + Lien Payoff share one row
- [x] Linked textbox sits on the same row as its checkbox (placement only — fields always editable)
- [x] PATCH payload unchanged semantically (`certified`, `titleOwner`, `extendedWarranty`, `lienPayoff`)
- [x] Save/Reset/dirty state still correct

---

## 29 — Title Information: US state dropdowns

**Goal:** Replace free-text inputs with consistent **US state** pickers for both title and tag location fields in the Title Information block.

**Fields:**

| Label in UI | PATCH field | Control |
|-------------|-------------|---------|
| **State/Region** | `titleStateRegion` | `<select>` — all 50 US states (+ empty “Select state” option) |
| **Tag State/Region** | `tagStateRegion` | Same dropdown list |

**Implementation notes:**

- Add or reuse a shared constant (e.g. `web/lib/us-states.ts`) with state codes and display names (e.g. `TX` / `Texas` — pick one storage format and use consistently; existing DB columns are `text`, max 64 chars).
- Match styling to other selects on the page (e.g. Workflow assignee dropdown).
- Pre-select saved value on load; blank option when null.

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-title-information-block.tsx`

**Exit criteria:**

- [x] Both fields render as dropdowns, not text inputs
- [x] All US states available in each list
- [x] Save persists selected value via PATCH
- [x] Invalid legacy free-text values still display sensibly (fallback or prompt re-select)

---

## 30 — Workflow stepper: Landed → Appraised

**Goal:** Rename the final buyer-facing workflow step from **Landed** to **Appraised**. The detail page is an **appraisal workspace** — the stepper should reflect completing an appraisal, not “landing” a deal.

**Stepper (updated):**

```
Found → Working → Contacted → Appraised
```

**Changes:**

- Update label in `opportunity-workflow-stepper.tsx` (`Landed` → `Appraised`; internal step id may stay `landed` or rename to `appraised` — prefer `appraised` for clarity if no breakage).
- **Backend status mapping unchanged unless product says otherwise:** step still advances to this final step on `purchased` / `bought` (same as today’s Landed = bought). This is a **label/copy** change unless we later add a distinct `appraised` status.
- Audit and update any other user-facing “Landed” copy on the detail page, E2E assertions, and UAT checklist in `opportunity-detail-redesign.md` when that doc is next edited.
- **Out of scope unless requested:** renaming hero CTA “Mark bought” → “Mark appraised” (confirm with product at implementation).

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-workflow-stepper.tsx`

**Exit criteria:**

- [x] Stepper shows Found → Working → Contacted → **Appraised**
- [x] Active step still resolves correctly for `purchased` / `bought` opportunities
- [x] Passed still maps to Contacted (not Appraised), same as today
- [x] Tests/E2E updated if they assert “Landed”

---

## 31 — Vehicle block: vAuto-style dropdown fields

**Goal:** Match vAuto **Vehicle Information** UX — most identity fields are **dependent dropdowns**, not free text. Today `OpportunityVehicleBlock` renders **all 10 editable fields as `<Input>` text boxes**; only Region is read-only text.

**Reference:** vAuto appraisal Vehicle Information panel (2026-06-27 screenshot). Compare to our block in `opportunity-vehicle-block.tsx`.

### Field control types (target)

| Field | vAuto control | Our app today | Target |
|-------|---------------|---------------|--------|
| **VIN** | Text + Go | Text | **Text** (keep; optional VIN-decode action later) |
| **Odometer** | Text (required) | Text | **Text / numeric** (keep) |
| **Year** | Catalog-driven (required) | Text | **Dropdown** — Cox/MMR catalog years |
| **Make** | Dropdown (required) | Text | **Dropdown** — dependent on Year |
| **Model** | Dropdown (required) | Text | **Dropdown** — dependent on Year + Make |
| **Series** | Dropdown | Text (`style`) | **Dropdown** — dependent on Year + Make + Model |
| **Body Type** | Dropdown | Text | **Dropdown** |
| **Engine** | Dropdown | Text | **Dropdown** |
| **Transmission** | Dropdown | Text | **Dropdown** |
| **Color** | Dropdown | Text | **Dropdown** |
| **Region** | — | Read-only text | Unchanged (provenance) |

**Count:** **8 of 10** editable vehicle fields should be dropdowns (Year, Make, Model, Series, Body Type, Engine, Transmission, Color). **2 stay text:** VIN, Odometer.

### Data sources (implementation)

| Dropdown group | Likely source |
|----------------|---------------|
| Year → Make → Model → Series | Reuse **`useVehicleCatalogOptions`** (`web/app/(app)/opportunities/_components/use-vehicle-catalog.ts`) — same `/mmr/catalog/*` APIs as MMR Lab + manual submit |
| Body Type, Engine, Transmission | TBD — VIN/MMR decode payload, Cox style metadata, or catalog extension; confirm at implementation |
| Color | TBD — align with MMR Lab color list (`mmr-adjustments` / Cox color param) where possible |

### UX rules (mirror MMR Lab / manual submit)

- Dependent dropdowns: changing Year clears Make/Model/Series; changing Make clears Model/Series; etc.
- Show loading state per dropdown while catalog fetches (see MMR Lab item **3** pattern).
- Preserve block-level **Save / Reset / dirty** behavior; valuation-affecting changes still trigger MMR/Max buy refresh on save.
- When saved values don’t match catalog options (scraper free-text), show current value and prompt re-select or allow fallback (match manual-submit parse-then-match behavior).

**Primary files:**

- `web/app/(app)/opportunities/_components/opportunity-vehicle-block.tsx`
- `web/app/(app)/opportunities/_components/use-vehicle-catalog.ts` (reuse)
- Reference UI: `web/app/(app)/mmr-lab/_components/search-panel.tsx`, `manual-submit-form.tsx`

**Exit criteria:**

- [x] 8 fields render as `<select>` (or shared Select component), not text inputs
- [x] VIN + Odometer remain text inputs
- [x] Y/M/M/S cascade works with MMR catalog
- [x] Body Type / Engine / Transmission / Color dropdowns populated (source documented in PR)
- [x] Save/Reset/PATCH unchanged semantically
- [x] Tests updated for dropdown interaction + catalog mocks

---

## 32 — Auto-save on blur (remove per-block Save buttons)

**Goal:** Stop requiring a **Save** click on every editable block. When the user edits a block and **leaves that block** (focus moves to another part of the page — another block, hero, nav, etc.), **persist automatically** if there are unsaved changes.

**Product intent (2026-06-27):** Closers should work fluidly across the appraisal workspace; saving should feel invisible, like vAuto-style forms that commit when you move on.

**Applies to editable blocks on `/opportunities/[id]`:**

- Hero — Contact Information  
- Salesperson / Appraisal Information  
- Vehicle (+ future Additional Information subblock)  
- Title Information  
- Notes — **exception TBD:** may keep explicit “Save note” or also blur-save; confirm at implementation  

**Does not apply:**

- Read-only blocks (Workflow metadata, History, Valuation MMR adjustments — those have their own recompute/save rules)  
- Hero workflow action buttons (claim, mark contacted, etc.)

**Behavior:**

1. User edits fields inside a block → block is **dirty**.  
2. User clicks/tabs **outside** that block’s container (blur / focus-out of the block root) → if dirty and `canMutate`, **PATCH** once (debounce ~300ms optional to avoid double-fire).  
3. Remove **Save** and **Reset** buttons from blocks once blur-save is wired (or hide Save and keep Reset only if product wants revert — confirm).  
4. **Valuation-affecting** vehicle/contact fields: same PATCH as today; parent still `router.refresh()` + MMR/Max buy re-run after successful save.  
5. **Errors:** inline banner in the block; do not lose edits on failure.  
6. **Pending:** disable duplicate saves while PATCH in flight.  
7. **Navigate away** with dirty block: optional `beforeunload` / unsaved warning — align with original redesign §3 “warn on navigate away”.

**Implementation sketch:**

- Wrap each editable block in a container with `onBlur` using `relatedTarget` / `contains()` check so focus moving **within** the same block does not save.  
- Or shared hook `useBlockAutoSave({ blockRef, isDirty, onSave })` used by Contact, Vehicle, Salesperson, Title blocks.  
- Centralize PATCH in `OpportunityDetailClientNew` (already has `patchMutation`).

**Supersedes:** Block-level Save in [`02-product/opportunity-detail-redesign.md`](02-product/opportunity-detail-redesign.md) §3 Vehicle / §6 notes — update that doc when this ships.

**Primary files:**

- `opportunity-detail-client-new.tsx`  
- `opportunity-contact-info-block.tsx`  
- `opportunity-vehicle-block.tsx`  
- `opportunity-salesperson-appraisal-block.tsx`  
- `opportunity-title-information-block.tsx`  

**Exit criteria:**

- [x] No Save button on Contact, Vehicle, Salesperson/Appraisal, Title blocks (unless product keeps Reset)  
- [x] Editing then clicking outside the block persists via PATCH without manual Save  
- [x] Focus moving between fields **inside** the same block does not trigger save  
- [x] Valuation refresh still runs after vehicle identity saves  
- [x] E2E updated: blur-to-save instead of Save button click  

---

## 33 — Compact Valuation cards (MMR + Max buy summary)

**Goal:** Replace the embedded full MMR Lab `ResultBand` + live `MaxbuyEvaluationSection` stack on `/opportunities/[id]` with **two compact summary cards** — same visual density as the existing **Max buy (saved)** card. Closers get “what’s it worth?” and “what’s our max?” in two glances; heavy UI stays on `/mmr-lab`.

**Product direction (2026-06-27):** Item **27** shipped Cox lookup + adjustments on the detail page, but dropping the full 3-column `/mmr-lab` layout into a collapsible block reads as three stacked products (saved Max buy + full ResultBand + full Max buy evaluation). vAuto/Manheim MMR inspiration: **summary first, adjustments on demand** (“Close Details”), inline delta badges next to adjustment fields.

### Problem with current embedded UI

- **Saved Max buy card** — compact; works well.
- **Full `ResultBand`** — 3-column grid (Base MMR | adjustments form | blue summary panel); built for `/mmr-lab`, too tall for an appraisal block.
- **Full `MaxbuyEvaluationSection`** — duplicates Max buy when a saved verdict exists; economics/history/math always visible.

### Target UX (default / collapsed)

**MMR summary card** (mirror `SavedVerdictCard` pattern):

| Row | Content |
|-----|---------|
| Header | `MMR` + confidence badge (optional) |
| Hero | **Adjusted MMR** + wholesale range (e.g. `$23,000` · `$21,900 – $24,100`) |
| Secondary | Base MMR · Est. retail · Avg odometer · Avg condition (single line or small grid) |
| Action | **Adjust** or **Expand** — not six adjustment fields visible by default |

**Max buy summary card** (keep/enhance existing `SavedVerdictCard`):

- One card only — live evaluate **updates this card**; do not render a second full `MaxbuyEvaluationSection` below when summary suffices.
- **A–F deal grade** circle (Provisioning-style) derived from verdict + data strength.
- Recommended max buy hero, evaluated-at.
- Economics, segment history, explanation math, and action buttons → **expand / details** only.

**Block-level action:** Single **Refresh valuation** refreshes MMR + Max buy together (avoid duplicate refresh buttons). _Known gap: Max buy card may not update reliably — see item 38._

**Power users:** Full workbench on `/mmr-lab` (URL prefill from opportunity query params when linked externally).

### Progressive disclosure (expanded)

- **MMR adjustments** — vAuto-style inline panel: odometer / region / grade / color / build with delta chips (`+$710`, `−$480`); reuse Cox call path from `result-band.tsx` / `mmr-adjustments.ts` — **do not fork** lookup logic.
- **Max buy details** — `<details>` or second expand: economics grid, TAV segment history, explanation, Pass/Bid lower actions.

### What stays on `/mmr-lab` only

- Full 3-column `ResultBand` layout (unchanged on canonical page).
- Transactions table, historical/projected panels, sticky search panel.

### Bug fix bundled with this item

**MMR auto-run gate** in `opportunity-valuation-block.tsx` — `identitySufficientForAutoRun` currently requires **mileage + price** for YMM, which blocks MMR even though Cox and `/mmr-lab` do not require odometer for base/adjusted MMR at segment average.

Split gates:

| Surface | Sufficient identity |
|---------|---------------------|
| **MMR auto-run** | VIN **or** saved Y/M/M/S (series) |
| **Max buy auto-run** | Stricter — mileage + asking price (or existing MaxBuy rules); OK to skip live Max buy when only MMR identity is present |

Ref: `resolveLookupMileage` omits `?odometer=` when mileage undefined; MMR Lab `onYmmSubmit` sends Y/M/M/S only.

### Refines item 27

Item **27** exit criteria for “ResultBand visible on detail” remain met functionally; this item **replaces the embedded presentation** — summary cards + expand, not the full ResultBand grid. Update [`02-product/opportunity-detail-redesign.md`](02-product/opportunity-detail-redesign.md) §5 when this ships.

**Primary files:**

- `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx`
- New: `mmr-summary-card.tsx` (or inline in valuation block)
- Reuse: `SavedVerdictCard` pattern, adjustment sub-panel extracted from `result-band.tsx`
- **Do not remove** full `ResultBand` from `web/app/(app)/mmr-lab/`

**Exit criteria:**

- [x] Default Valuation view shows compact **MMR summary card** + compact **Max buy summary card** (no 3-column ResultBand)
- [x] MMR adjustments available via expand only; Cox recompute behavior unchanged
- [x] No duplicate Max buy UI (saved card + full evaluation section) in collapsed state
- [x] One **Refresh valuation** at block level (MMR + Max buy together)
- [x] MMR auto-runs on saved VIN or saved Y/M/M/S **without** requiring odometer
- [x] Max buy live auto-run still respects mileage/price rules (placeholder card when MMR-only identity)
- [x] `/mmr-lab` ResultBand unchanged
- [x] Tests + E2E updated for compact layout and split auto-run gates

---

## 17 â€” YMM Parity vs Manheim Native

**Goal:** YMM (Year/Make/Model/Style) lookups in our MMR Lab must return the same Base MMR, MMR Range, Estimated Retail Value, and Typical Range as Manheimâ€™s native MMR tool for identical inputs.

**Last updated:** 2026-06-19 (test completed â€” fix approach confirmed)

### What was observed (2026-06-19)

Side-by-side testing of 3 YMMs + 2 VINs confirmed two distinct problems. Full results: [07-buybox/MMR-PARITY-TEST-RESULTS.md](07-buybox/MMR-PARITY-TEST-RESULTS.md)

#### Problem A -- Base MMR differs when wrong item selected (confirmed: 2022 Toyota Camry SE)

| Field | Our app | Manheim |
|---|---|---|
| Base MMR | $19,950 | $15,850 |
| Avg Condition | 3.8 | 2.3 |

- Score each item by closeness to the selected style string (exact match -> subSeries match -> token overlap)
- Pick the highest-scoring item; fall back to `items[0]` if nothing scores above threshold
- Style string comes from Cox's own catalog so the format is compatible


**Fix (decided 2026-06-19):** Pass the user's selected style name into item selection and score each item in `items[]` against `description.trim` / `description.subSeries` instead of always taking `items[0]`.

| Field | Our app | Manheim |
|---|---|---|
| Base MMR | ,700 | ,700 âœ“ |
| MMR Range | ,500 â€“ ,850 | ,000 â€“ ,400 |
| Retail Value | ,100 | ,100 âœ“ |
| Typical Range | ,400 â€“ ,700 | ,400 â€“ ,700 âœ“ |

**Root cause (suspected):** Our range fix (2026-06-19, commit 16d716a) changed 
angeLow/
angeHigh to use the base wholesale.below/above tier with fallback to the adjusted tier. Coxâ€™s search responses include both tiers on each item, but neither produces Manheimâ€™s tighter range. Manheimâ€™s range is likely sourced from the ci (confidence interval) block. The Cox API explicitly documents include=ci as unsupported on /search/... endpoints, which is why uildCoxIncludeTokens strips it for YMM calls (isSearch: true). Manheimâ€™s own native tool may use an internal API version where ci is available on search, or it converts YMM to an internal VIN match and uses VINâ€™s ci.

### Structured test in progress (2026-06-19)

Running a controlled comparison across 5 YMMs + 3 VINs to confirm which problems are consistent and which are vehicle-specific.

**YMMs (user running through Manheim native, results pending):**

| # | Year | Make | Model | Style |
|---|------|------|-------|-------|
| 1 | 2022 | Toyota | Camry | SE 4D Sedan |
| 2 | 2021 | Ford | F-150 | XLT 4D SuperCrew |
| 3 | 2023 | Honda | CR-V | EX 4D Sport Utility |
| 4 | 2020 | Chevrolet | Equinox | LT 4D Sport Utility |
| 5 | 2019 | BMW | 5 Series | 530I 4D Sedan |

**VINs (user running through Manheim native, results pending):**

| # | VIN | Vehicle |
|---|-----|---------|
| 1 | 1FT7W2BT4KED81759 | 2019 Ford F-150 |
| 2 | 1GYTEEKL1SU107843 | 2025 Cadillac Escalade IQ |
| 3 | TBD â€” any 2022 Toyota Camry from recent inventory | 2022 Toyota Camry |

**Fields to record for each lookup in Manheim:**
Base MMR, MMR Range (low â€“ high), Avg Odometer, Avg Condition, Adjusted MMR (no adjustments applied), Estimated Retail Value, Typical Range (low â€“ high)

### What to investigate before fixing

1. **Inspect raw Cox items[] array** for a YMM with a Base MMR mismatch: query mmr_cache or mmr_queries in Supabase for the 2018 BMW 3 Series 320I lookup. Find which item has avg condition 3.7 â€” is it items[0] or a later index?
2. **Test include=ci on a YMM/search call**: Cox docs say unsupported, but test whether Cox silently accepts it. If it works, enabling MANHEIM_INCLUDE_CI on search calls would fix the range problem without code changes beyond removing the isSearch guard.
3. **Compare item counts**: do different vehicles return different numbers of items? If items[0] is sometimes correct and sometimes not, the selection logic needs a smarter heuristic.

### Exit criteria

- [x] Test results from 5 YMMs + 3 VINs collected and compared
- [x] Root cause of Base MMR mismatch confirmed (wrong item index vs. trim name mismatch vs. other)
- [x] Decision made: fix item selection heuristic, enable ci on search, or both
- [x] YMM lookups produce Base MMR within  of Manheim for at least 4 of 5 test vehicles
- [x] MMR Range within  of Manheim on both ends for at least 4 of 5 test vehicles
- [x] No regression on VIN path

---

## 16 â€” MMR Adjustment Accuracy

**Goal:** Grade, build-options, and odometer deltas in the MMR Adjustments panel must match the values shown in Manheim's native MMR tool for the same inputs.

### Background â€” what was found (2026-06-17)

Side-by-side comparison of our MMR Lab vs the native Manheim MMR tool on VIN `1GYTEEKL1SU107843` (2025 Cadillac Escalade IQ) revealed three linked bugs:

#### Bug 1 â€” Build delta inflated when grade is also active

**Root cause:** `buildOptionsFromBooleanTrue()` in `src/valuation/manheimResponseParser.ts` assigned the **entire** `adjustedPricing.wholesale.average âˆ’ wholesale.average` delta to build options whenever Cox sends `adjustedBy.buildOptions: true` (boolean, not dollars). It only guarded against odometer mismatch â€” it did **not** bail when grade, color, or region were also present in `adjustedBy`.

When grade=5.0 is active:
- Cox returns total delta = grade ($420) + build ($890) = combined in `adjustedPricing.wholesale.average`
- Our parser assigned $1,310 (or similar combined total) as build-only
- Manheim correctly showed build = $890 and grade = $420 separately

**Fix applied (commit `9d7783e`):** `buildOptionsFromBooleanTrue` now returns `{ included: true, adjustment: null }` when `adjustedByHasGrade`, `adjustedByHasColor`, or `adjustedByHasRegion` is true in `adjustedBy`. When adjustment is null, the breakdown function's residual logic can properly attribute the remaining delta to grade/color/region via single-field residual attribution.

#### Bug 2 â€” Grade delta never shown in the adjustments panel

**Root cause:** Two compounding issues:

1. Cox returns `adjustedBy.Grade: "40"` (a string grade code on a 10-point scale, e.g. "40" = grade 4.0, "50" = grade 5.0). `readAdjustedByFieldDollars()` only reads **numeric** values â€” strings are ignored â€” so `gradeAdjustment` from the parser always comes back `null`.

2. The fallback is **marginal tracking**: when the user changes grade from empty â†’ 5.0, a recompute fires, and `applyAttributeMarginalDelta` captures the delta between the prior and new `adjustedMmr`. But `pendingMarginalChangesRef.current` was **overwritten** (not accumulated) on each `handleAdjustmentsChange` call. If the user entered an odometer value after selecting grade (both within the same 400ms debounce window), the odometer change would overwrite `pendingMarginalChangesRef = []`, losing the grade change, so the marginal was never stored.

**Fix applied (commit `9d7783e`):** `pendingMarginalChangesRef.current` is now accumulated with `Array.from(new Set([...existing, ...newChanges]))` instead of overwritten. Grade/color/region changes are preserved even when odometer or other fields change before the debounce fires.

#### Bug 3 â€” Odometer field fired Cox API on every keystroke

**Root cause:** The odometer `<input>` called parent `onChange` on every keystroke. The parent debounced at 400ms, but slow typing (any pause >400ms between digits) fired one Cox API call per intermediate value (`4`, `40`, `400`, `4000`, `40000`). Each call set a new `adjustmentBaseline`, and out-of-order responses could corrupt the displayed build delta and grade marginals.

The Express Grade input had the same problem.

**Fix applied (commit `9d7783e`):** Both text inputs now hold local React state and only call the parent `onChange` (triggering the recompute) on `onBlur`. A `useEffect` syncs the local value back down when the parent resets it (e.g. Clear button).

### What the numbers look like now vs target

With odometer=20,000 entered, no grade selected (our app) vs grade=5.0 selected (Manheim):

| Field | Our app (no grade) | Manheim (grade=5.0) | Expected when grade=5.0 added in our app |
|---|---|---|---|
| Adjusted MMR | $98,200 | $98,600 | $98,600 |
| Odometer delta | âˆ’$3,800 | âˆ’$4,050 | ~âˆ’$4,050 |
| Grade delta | â€” | +$400 | ~+$400 (via marginal) |
| Build delta | +$1,000 | +$890 | ~+$890 (parser fix) |

The $400 gap in adjusted MMR and the $110 build difference are both expected when grade is not applied â€” they disappear once grade=5.0 is selected in our app and the recompute runs. The numbers are **different inputs producing different outputs**, not a calculation error once the fixes are deployed.

### What still needs to happen

| Step | Action | Owner |
|---|---|---|
| **Deploy app worker** | Deploy `src/` (Cloudflare Worker) to production â€” contains the `buildOptionsFromBooleanTrue` parser fix | Engineering |
| **Deploy web app** | Deploy `web/` (Next.js) to production â€” contains the blur-only inputs and marginal accumulation fix | Engineering |
| **Smoke test** | On VIN `1GYTEEKL1SU107843`: enter odometer=12,181 (avg), select grade=5.0, confirm build delta shows ~$890 and grade delta shows ~$420 | QA |
| **Smoke test** | Confirm build+grade+odometer all show when all three are active simultaneously | QA |
| **Avg LV Battery Score** | `result-band.tsx` has `<Stat label="Avg EV Battery Score" />` hardcoded with no value. Parse `averageEvBatteryScore` (or equivalent key) from Cox payload in `manheimResponseParser.ts`, forward through `routes.ts`, and pass as a prop to `ResultBand`. Manheim shows 100% for this VIN. | Engineering |

### Files changed in `9d7783e`

| File | Change |
|---|---|
| `src/valuation/manheimResponseParser.ts` | `buildOptionsFromBooleanTrue` bails when grade/color/region present in `adjustedBy` |
| `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` | Accumulate `pendingMarginalChangesRef` instead of overwriting |
| `web/app/(app)/mmr-lab/_components/result-band.tsx` | Odometer + Express Grade inputs fire recompute on blur only; local state for display |

### Exit criteria

- [ ] App worker and web app deployed to Cloudflare production
- [ ] Selecting grade=5.0 on VIN `1GYTEEKL1SU107843` shows a grade delta ~+$420 next to the grade dropdown
- [ ] Build delta shows ~+$890 (not $1,000) when grade=5.0 is active
- [ ] Odometer input does not fire multiple Cox requests while typing
- [ ] Avg LV Battery Score shows 100% for the Escalade IQ (or any EV with battery data)
- [ ] No regression on build-only (no grade) scenario â€” build delta still shows when grade is not selected

---

## 15 â€” Retail value: enable Cox retail data

**Goal:** The result band has wired-up `retailValue`, `retailRangeLow`, `retailRangeHigh` columns that always show `--` because Cox is never asked for retail data.

### Root cause

`buildCoxIncludeTokens` in `workers/tav-intelligence-worker/src/clients/manheimHttp.ts` only appends `"retail"` to the Cox `include=` query param when `env.MANHEIM_INCLUDE_RETAIL === "true"`. That env var has never been set on the intel worker, so the retail block is never requested.

### What to check first

Before setting the env var, confirm with Cox/Manheim account rep whether the TAV API key is entitled for the `retail` include token. The `MANHEIM_INCLUDE_RETAIL` flag exists precisely because retail is a separate entitlement â€” enabling it on an un-entitled key will produce 4xx errors or empty retail blocks on every lookup.

### What to change

| Step | Action |
|---|---|
| 1 | Confirm Cox account has retail entitlement |
| 2 | Set `MANHEIM_INCLUDE_RETAIL=true` in the intel worker's Cloudflare environment (wrangler secret or `[vars]` in `wrangler.toml`) |
| 3 | Smoke-test a known VIN â€” confirm `retailValue` appears in the response envelope |
| 4 | Verify `result-band.tsx` renders the retail card correctly once the value is non-null |

If Cox confirms the account is **not** entitled for retail: hide the retail card in the result band UI rather than showing permanent `--` dashes.

### Exit criteria

- [ ] Either: retail value and range are populated in the result band for a live VIN lookup
- [ ] Or: retail card is hidden in the UI with a doc note confirming the account lacks entitlement
- [ ] No new 4xx errors appear in intel worker logs after enabling

---

## 2 â€” Year dropdown: pin recent years at top

**Goal:** Buyers almost always look up 2022â€“2026 vehicles. The year dropdown currently shows a flat list from 2003 onward â€” requires scrolling past many years to reach common ones.

**Approach:** Split the year options into two groups: the most recent N years (e.g. current year âˆ’ 4 through current year) pinned at the top, then a `<optgroup>` or `<hr>`-style divider, then all remaining years below. No functional change â€” just reorders the `<option>` elements in `search-panel.tsx` using the `catalog.years` array.

**Exit criteria:**
- [ ] Most recent 5 years appear at the top of the Year dropdown before older years
- [ ] Year list is still complete (all years remain selectable)
- [ ] No change to catalog API calls or selection behavior

---

## 3 â€” Per-dropdown loading indicator

**Goal:** When catalog data is loading (e.g. after a year change triggers a makes refetch), the Make dropdown is silently disabled. Buyers have no feedback that something is happening.

**Approach:** In `search-panel.tsx`, render a `"Loadingâ€¦"` placeholder `<option>` as the first option (after the blank prompt) when `catalog.loading === "makes"` / `"models"` / `"styles"` for that field. Alternatively, show a small spinner icon inside the select wrapper using a `relative`/`absolute` overlay.

**Exit criteria:**
- [ ] Make shows loading feedback when `catalog.loading === "makes"`
- [ ] Model shows loading feedback when `catalog.loading === "models"`
- [ ] Style shows loading feedback when `catalog.loading === "styles"`
- [ ] No additional API calls introduced

---

## 4 â€” Auto-scroll to results on mobile after submit

**Goal:** After clicking Search (VIN) or Value (YMM) on a phone, the result band is below the fold. Buyers don't notice results have loaded.

**Approach:** In `mmr-lab-client.tsx`, after `setView({ kind: "ok", ... })` fires, call `document.getElementById("mmr-result-band")?.scrollIntoView({ behavior: "smooth" })`. Add `id="mmr-result-band"` to the `<ResultBand>` wrapper. Only scroll on mobile (use a `window.innerWidth < 768` guard or a media-query-aware hook).

**Exit criteria:**
- [ ] After submit on mobile viewport, page scrolls smoothly to the result band
- [ ] Desktop scroll behavior unchanged (no auto-scroll on desktop)

---

## 5 â€” Sticky SearchPanel header on desktop scroll

**Goal:** On desktop, buyers scroll down through adjustments and transactions but lose sight of the VIN / YMM inputs. The native Manheim MMR tool keeps its lookup form visible.

**Approach:** Wrap `<SearchPanel>` in a `sticky top-0 z-10` container (Tailwind). Add a collapsed/expanded toggle so the panel can be minimized once a lookup is active to free vertical space.

**Exit criteria:**
- [ ] SearchPanel sticks to the top of the viewport when scrolling on desktop (â‰¥ 1024px)
- [ ] Panel can be collapsed/expanded while sticky to free vertical space
- [ ] Mobile behavior unchanged (no sticky on small viewports)

---

## 6 â€” Value button: tooltip for missing fields

**Goal:** The Value button is disabled whenever Year/Make/Model/Style is incomplete, but clicking it does nothing and shows no explanation. Buyers don't know which field to fill.

**Approach:** In `search-panel.tsx`, compute the first missing required field from `selection` and show a Tooltip (from `@/components/ui/tooltip`) on the disabled Button listing what is missing (e.g. "Select a Style to enable valuation"). Use the `title` attribute as a fallback for non-JS contexts.

**Exit criteria:**
- [ ] Hovering or focusing the disabled Value button shows which field is missing
- [ ] Tooltip text is accurate for every combination of missing fields
- [ ] When all fields are filled the tooltip is removed (button is enabled)

---

## 7 â€” Style approximation notice: closeable banner

**Goal:** When Cox trim doesn't exactly match a catalog style (DEC-MLB-6), a small amber text line appears below the dropdowns. This is easy to miss, especially after the result band loads.

**Approach:** Replace the `<p role="status">` in `search-panel.tsx` with a dismissible banner component (`Alert` from `@/components/ui/alert`) positioned above the result band (below the SearchPanel). Include an Ã— close button that calls `setStyleNotice(null)` via a lifted callback.

**Exit criteria:**
- [ ] Approximate style match shows a dismissible amber Alert above the result band
- [ ] User can close the notice; it does not reappear until the next VIN lookup
- [ ] Exact match (or no VIN lookup) shows no banner

---

## 8 â€” Mileage â†” Adjustments odometer sync

**Goal:** Odometer for MMR recompute and MaxBuy lives in MMR Adjustments only (Miles was removed from the search panel). Ensure a single source of truth â€” edits in adjustments odometer must flow correctly to MMR recompute and MaxBuy evaluate without diverged state.

**Approach:** Confirm `adjustments.odometer` in `mmr-lab-client.tsx` is the only mileage input. Verify `buildMmrRecomputeRequest` and `buildMmrLabMaxbuyRequest` both read from the same adjustments state after edits and after VIN lookup seeding (`mileageUsed: null` â†’ empty odometer).

**Exit criteria:**
- [ ] Adjustments odometer is the sole mileage input on `/mmr-lab`
- [ ] MMR recompute and MaxBuy evaluate use the same odometer value from adjustments
- [ ] No stale or diverged mileage silently used after the buyer edits odometer

---

## 9 â€” Keyboard tab flow through disabled dropdowns

**Goal:** Tabbing through the form skips disabled dropdowns entirely. Buyers using keyboard-only navigation cannot reach the Year dropdown when the catalog is not connected, or Make when no year is selected.

**Approach:** Disabled `<select>` elements are excluded from the tab order by default. Add `tabIndex={0}` to disabled selects and intercept `onKeyDown` to show a tooltip ("Select a Year first") rather than just blocking input.

**Exit criteria:**
- [ ] Tab key moves focus through all four YMM dropdowns regardless of disabled state
- [ ] Pressing Space or Enter on a disabled dropdown shows a tooltip explaining the required prerequisite
- [ ] No regression on enabled dropdown behavior

---

## 10 â€” Cleared-field highlight animation

**Goal:** When a year change causes a make/model/style to be invalidated and cleared by the catalog re-validation logic (DEC-MLB-7), the field blanks out silently. Buyers don't understand why it changed.

**Approach:** In `search-panel.tsx`, track which fields were just cleared (via a short-lived state flag or CSS class toggled in `onSelectionChange`). Apply a brief flash animation (e.g. `animate-pulse` or a red border fade) to the cleared field for ~1.5 s, then revert to normal styling.

**Exit criteria:**
- [ ] When a field is cleared due to catalog re-validation, it briefly flashes/highlights
- [ ] The animation does not fire on initial page load or manual user clears
- [ ] Animation respects `prefers-reduced-motion` (no animation if user has reduced motion set)

- Score each item by closeness to the selected style string (exact match -> subSeries match -> token overlap)
- Pick the highest-scoring item; fall back to `items[0]` if nothing scores above threshold
- Style string comes from Cox's own catalog so the format is compatible

**Files to change:**
- `src/valuation/manheimPayloadItem.ts` -- add optional `styleName` param to `selectMmrPayloadItem`, apply scoring heuristic for YMM calls
- `workers/tav-intelligence-worker/src/handlers/mmrYearMakeModel.ts` -- pass `style` query param into item selection
- `src/app/routes.ts` -- ensure `style` is forwarded through the YMM lookup path

---

## 18 -- MaxBuy `vehicle_context_missing` for External VINs

**Goal:** MaxBuy evaluation must never show "Could not resolve vehicle details for this VIN." for any VIN that produced a valid MMR result. If Cox returned year/make/model, MaxBuy must be able to run.

**Last updated:** 2026-06-19

### What was observed (2026-06-19)

VIN `1FT7W2BT4KED81759` (2019 Ford F-250 PLATINUM) returned a correct MMR result (Base MMR `,500`, high confidence) but the MaxBuy section showed:

> Could not resolve vehicle details for this VIN.

The Escalade IQ (`1GYTEEKL1SU107843`) worked fine because it exists in TAV's normalized_listings/purchase_outcomes tables as an ingested vehicle. The F-250 does not -- it is an external/test VIN never processed through TAV's ingest pipeline.

### Root cause

`resolveVehicleContext` (`src/maxbuy/persistence/vehicleContext.ts`) resolves vehicle identity in this order:

1. Query `normalized_listings` by VIN -- not found (VIN not in TAV inventory)
2. Query `purchase_outcomes` by VIN -- not found (TAV never bought/sold this vehicle)
3. VIN year-decode fallback -- decodes model year from VIN but requires `region` in the request; MMR Lab does not send region, so this also fails
4. Returns null

Then `vehicleContextFromRequestFields` is the last fallback -- it reads year/make/model from the request body. These come from the MMR session (`mmrVinSessionFromResult` attaches them from the Cox response). However this is unreliable -- if the session doesn't have those fields, the fallback returns null and the error is thrown.

### Why this is wrong by design

MaxBuy's purpose is:
1. Take a VIN, decode year/make/model
2. Look up TAV's purchase history for that year/make/model segment
3. Score and produce a max buy recommendation

Step 2 (`fetchHistoricalSummary`) already queries by year/make/model, not by VIN. The VIN lookup in step 1 is only used to GET the year/make/model -- but the MMR result already returned that from Cox. The system should trust the MMR result instead of requiring the VIN to exist in the database.

### Fix

**Option 1 -- Reliably pass year/make/model from MMR result into the MaxBuy request (primary fix)**

`buildMmrLabMaxbuyRequest` already tries to attach year/make/model from the session to the request body. Audit and harden this so it is guaranteed when a VIN MMR lookup succeeds:

- Confirm `mmrVinSessionFromResult` is always called after a successful VIN MMR lookup and the session is updated before any MaxBuy evaluate fires
- Confirm `body.year`, `body.make`, `body.model` are present in the serialized request body sent to the Worker (check the `MaxbuyEvaluateRequest` type allows these fields on VIN requests)
- In the backend, treat year/make/model from the request body as equivalent to DB-resolved identity -- no DB lookup should be required when these are present

**If no TAV historical data exists for the segment:**

Do not error. Show the MaxBuy result with `data strength: low` and the existing "Limited segment data" warning. This already works for rare vehicles -- the `fetchHistoricalSummary` returns empty and scoring degrades gracefully. The user gets a rough guide rather than a crash.

**Files to change:**
- `web/app/(app)/mmr-lab/_components/build-mmr-lab-maxbuy-request.ts` -- ensure year/make/model always in body when session has them
- `src/maxbuy/persistence/vehicleContext.ts` -- if year/make/model are in the request, return a VehicleContext from them directly without requiring DB lookup
- `web/lib/app-api/missing-reason.ts` -- never surface `vehicle_context_missing` as "Could not resolve vehicle details" to buyers; if it somehow still fires, show a softer message

### Exit criteria

- [ ] VIN `1FT7W2BT4KED81759` produces a MaxBuy result (even low-confidence) instead of the error
- [ ] Any VIN that returns a valid MMR result also gets a MaxBuy evaluation
- [ ] "Could not resolve vehicle details for this VIN." never appears on screen for a VIN with a valid MMR result
- [ ] If segment has no TAV history, shows low data-strength warning instead of error
- [ ] No regression for VINs that ARE in normalized_listings (they still resolve via DB, same behavior)

---

## 22 — Grade: convert UI CR grade to Cox query param

**Goal:** Selecting grade **4.5** in MMR Adjustments must send `grade=45` to Cox (not `grade=4.5`, which Cox silently ignores).

**Last updated:** 2026-06-22 (fix applied — **pending production smoke confirmation**)

### Fix applied

- **Web** (`mmr-adjustments.ts`): `toCoxGradeParam()` converts `"4.5"` → `"45"` inside `mapMmrAdjustmentsToApi`; UI dropdown unchanged.
- **Main worker** (`coxGradeParam.ts` + `routes.ts`): `normalizeMmrLookupAdjustments()` applies the same conversion before forwarding to the intel worker.

### Exit criteria (confirm before marking [x])

- [x] F450 VIN at odometer 200 + grade 4.5 + Black: Adjusted MMR ≈ **$66,300** (matches Manheim)
- [x] Grade delta badge shows ≈ **+$710** (display fix may still be separate if Cox returns grade as string code)
- [x] Vercel deploy includes web `mapMmrAdjustmentsToApi` change

---

## 23 — Grade & color adjustment deltas: exact Cox dollar amounts

**Goal:** Grade and color badges must show the **exact per-field dollar adjustment Cox returns** — matching Manheim native (e.g. grade **+$710**, color **−$480** on F450 VIN `1FT8W4DT8JEB57132`), not derived approximations.

**Last updated:** 2026-06-22 (analysis — fix not started)

### Grade (+$700 in our app vs +$710 Manheim)

Cox does **not** send a grade dollar amount in the field we currently read. It sends a grade **code** (e.g. `"45"` for CR 4.5). Our parser uses `readAdjustedByFieldDollars()`, which **only accepts numeric values**, so the grade code is ignored for dollar display.

The **+$700** shown in our app is **not** from Cox's grade adjustment field. It is almost certainly from **marginal tracking**: the change in Adjusted MMR when the user selected grade (e.g. $66,300 − $65,600 = $700). That is close to Manheim's **+$710** but not the same — it is a recomputed total delta, not Cox's labeled grade split.

**Requirement:** We must **not** rely on marginal tracking or residual math for grade. We need the **exact grade dollar amount from Cox** — the same value Manheim shows next to the grade dropdown. Investigate the raw Cox payload (`adjustedBy` and related fields) for VIN `1FT8W4DT8JEB57132` with grade=45 to find where Cox exposes the grade adjustment in dollars (may be a separate key from `Grade` the code string).

**Files likely involved:**
- `src/valuation/manheimResponseParser.ts` — `readAdjustedByFieldDollars`, `extractManheimAdjustmentBreakdown`
- `web/app/(app)/mmr-lab/_components/mmr-adjustment-display.ts` — stop preferring `attributeMarginals.grade` when Cox provides a dollar field

### Color (−$500 in our app vs −$480 Manheim)

Color **may** already be a numeric Cox value (`adjustedBy.Color` = −500), which we forward with only nearest-dollar `Math.round` in `nonZeroDelta` — that does not change whole integers, so **−$500 may be exactly what Cox returned** on that lookup. Manheim's **−$480** suggests either Cox returns a different value than we parse, or our decomposition diverges when odometer + grade + color are all active.

**Requirement:** **Remove `Math.round`** from the grade/color adjustment display path (align with the no-rounding rule in the CRITICAL block at top of this doc for adjustment dollars). **Parse and forward the exact dollar amount Cox returns** for color (and grade once the correct field is identified) — no rounding, no marginal fallback when Cox provides the value.

**Files likely involved:**
- `src/valuation/manheimResponseParser.ts` — color/grade dollar extraction
- `web/app/(app)/mmr-lab/_components/mmr-adjustment-display.ts` — `nonZeroDelta` / `deriveMmrAdjustmentDeltas`

### Exit criteria

- [x] F450 VIN (odometer 200, grade 4.5, Black): grade badge **+$710**, color badge **−$480** (match Manheim)
- [x] Values sourced from Cox payload fields, not marginal tracking, when Cox provides them
- [x] No `Math.round` on grade/color adjustment dollars in the display pipeline
- [x] Adjusted MMR remains **$66,300** — no regression on hero price

---

## 21 — Odometer delta badge missing (mileage-as-string)

**Goal:** When a buyer enters a non-average odometer, the green/red **+$X** badge next to the odometer field must match Manheim's native MMR tool. Adjusted MMR was already correct; only the per-field delta label was missing.

**Last updated:** 2026-06-22 (fix applied — **pending production smoke confirmation**)

### What was observed (2026-06-22)

VIN `1FT8W4DT8JEB57132` (2018 Ford F450): odometer **200** mi (avg 99,606). Manheim shows **+$15,430** next to odometer; our app showed Adjusted MMR **$66,100** (correct) but **no odometer delta badge**.

### Root cause

1. Cox sends `adjustedBy.Odometer` as mileage string `"200"`, not a dollar amount — parser could not read a dollar delta.
2. `buildOptions: true` with odometer ≠ average left `buildAdj` null, blocking the `total − buildAdj` derivation path.
3. Client fallback required build dollars or an average-odometer baseline; neither existed after recompute at 200 mi.

### Fix applied (2026-06-22)

- **Parser** (`manheimResponseParser.ts`): when build flag is on, build dollars unknown, no grade/color/region, and odometer ≠ average → assign wholesale delta to `odometerAdjustment`.
- **Client** (`mmr-adjustment-display.ts`): when build on, build dollars null, no baseline → derive odometer from `adjustedMmr − baseMmr`.

### Exit criteria (confirm before marking [x])

- [x] VIN `1FT8W4DT8JEB57132` at odometer 200 shows odometer delta ≈ **+$15,400** (within ~$50 of Manheim +$15,430)
- [x] Adjusted MMR still **$66,100** — no regression on hero price
- [x] Grade + odometer + build combined case still does **not** show a bogus grade/odo split (regression test passes)
- [x] Deploy main worker + verify on https://tav-enterprise.vercel.app/mmr-lab

---

## 19 -- Avg Condition 10x display bug

**Goal:** verageGrade returned by Cox is a 10x integer (e.g. 38 = grade 3.8). The result band was displaying the raw integer instead of the decimal.

**Last updated:** 2026-06-20

**Root cause:** 
eadNumericField(payloadItem, "averageGrade") in src/app/routes.ts forwarded the raw Cox integer directly to the frontend. The frontend ormatNumber renders it as-is (38 instead of 3.8).

**Fix applied (2026-06-20):** Added 
ormalizeAverageGrade() helper to 
outes.ts that divides by 10 when the raw value exceeds 10. Called at the single assignment site for vgCondition. Logic matches ormatGrade() already used by manheimMarketContextParser.ts for transaction-row conditions.

**Files changed:**
- src/app/routes.ts -- 
ormalizeAverageGrade helper; vgCondition now normalized before response
- web/app/(app)/mmr-lab/_components/result-band.test.tsx -- test that vgCondition={3.9} renders 3.9 not 39

### Exit criteria

- [x] Avg Condition displays 3.9 (not 39) for a VIN/YMM lookup
- [x] Unit test asserts decimal rendering
- [x] No regressions (1137 src tests + 12 result-band tests pass)

---

## 20 -- Avg EV Battery Score: identify correct Cox field name

**Goal:** Manheim native shows 100% EV Battery Score for VIN 1GYTEEKL1SU107843 (2025 Cadillac Escalade IQ). Our result band shows --.

**Last updated:** 2026-06-20

**What is already wired:** The pipeline is complete end-to-end:
- manheimResponseParser.ts -- parseEvBatteryScore tries keys: verageEvBatteryScore, verageEVBatteryScore, vgEvBatteryScore, vgEVBatteryScore, verageEVBH
- 
outes.ts -- conditionally includes vgEvBatteryScore in the response envelope
- mmr-lab-client.tsx -- passes vgEvBatteryScore to ResultBand
- 
esult-band.tsx -- renders the stat when non-null

**Blocker:** Cox returns the field under a key name that does not match any of the 5 tried names. The correct key cannot be determined from the codebase alone -- it requires inspecting a raw Cox payload for an EV VIN.

### How to find the correct key name

1. Run a VIN lookup for 1GYTEEKL1SU107843 in the app (with the intel worker deployed)
2. Temporarily log or store the raw mmr_payload from the Cox response
3. Search the payload JSON for any key containing "battery", "evbh", "ev", or "health"
4. Add the discovered key to the tried-keys list in parseEvBatteryScore in manheimResponseParser.ts

### Exit criteria

- [x] Correct Cox field name identified by inspecting raw payload
- [x] Key added to parseEvBatteryScore fallback list
- [x] Escalade IQ VIN lookup shows Avg EV Battery Score = 100% (or whatever Cox returns)

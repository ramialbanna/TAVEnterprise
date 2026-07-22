# LLM Y/M/M/S — Rich listing context for Claude (item 60)

**Created:** 2026-07-22  
**Tracker:** [`NEXT_STEPS.md`](NEXT_STEPS.md) §60  
**Parent design:** [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) (item 57 — flag **on** staging + production since 2026-07-22)

---

## Why this doc exists

Item **57** is live: ingest calls Claude with the **full Cox `(year, make)` catalog subtree** and a deterministic exact-match gate. Production proof the same day (post-deploy ~14:06 UTC):

- **`llm_ymms_decisions`:** 10× `llm_hit`, 30× `llm_needs_review` on first ~57 processed listings.
- **Bronco `Black Diamond`:** `llm_hit` → `BRONCO 4C` / `2D SUV BLACK DIAMOND`; MMR moved off wrong Badlands pricing; parser fix (`13e9d84`) updated stored `model`/`trim` on re-ingest.
- **Counterexample — `2016 Ford F-150 · Short Bed`** (`501249d8-e0c4-4271-b346-59fbd3828c91`): Claude ran, **`llm_needs_review` (0.2)**, reasoning correctly that “Short Bed” alone cannot disambiguate **392** Cox F-150 styles → falls back to offline matcher → **`cox_no_data`**, **No MMR** in UI.

Claude cannot disambiguate sparse titles if we only send **title + price + parser Y/M/M/T**. The prompt already has **Listing description:** but ingest **never populates it** (always `(none)`).

---

## What we send Claude today (production)

| Field | In prompt? | Source on ingest |
|--------|------------|------------------|
| Title | Yes | `normalized_listings.title` / parser |
| Description | Slot exists, **always empty** | Not wired |
| Parser year, make, model, trim | Yes (as hypothesis) | `parseFacebookItem` |
| Price | Yes | Adapter |
| Full Cox model+style list | Yes | `cox_catalog_tree` via `loadCoxCatalogTreeForMake` |
| Prior miss reason | Sometimes | Optional on resolver input |
| Mileage, VIN, city/state, seller | **No** | Not passed to LLM |
| Facebook / Apify detail text | **No** | Often present on raw item, not on `NormalizedListingInput` |

**Code paths (read these first in a fresh chat):**

- Ingest prefetch map: `buildLlmYmmsPrefetchInputs()` in `src/ingest/handleIngest.ts` — only sets `year`, `make`, `model`, `trim`, `title`, `price`.
- Resolver input type: `LlmYmmsResolutionInput` in `src/valuation/resolveListingWithLLM.ts`.
- Prompt builder: `buildYmmsUserPrompt()` in `src/llm/ymmsPrompt.ts` — already includes description + parser lines; extend here when new fields exist.
- Apify → flat item: `mapRaidrApiItem()` in `src/apify/payloadAdapter.ts` — can set `description` from `extraListingData.description` when detail fetch is on; also maps mileage, condition, location, etc. onto the **raw ingest item**, not necessarily persisted on `normalized_listings`.
- Domain gap: `NormalizedListingInput` in `src/types/domain.ts` has **no `description` column** — anything we want in Supabase + LLM must be added deliberately (migration + adapter + persistence).

**Eval script:** `scripts/eval-llm-ymms.mjs` supports `--description` for `--one` runs; production ingest does not mirror that yet.

---

## What Apify / Facebook often has (but we under-use)

From `payloadAdapter.ts` and raidr-api/custom-vehicle-scraper shape:

- **`extraListingData.description`** — seller text (trim, engine, cab, options, VIN mentions).
- **`extraListingData.condition`**, structured **odometer** (detail mode).
- **Location** (`location.city` / `state` / reverse geocode) — already partially mapped for listings.
- **Subtitle / title variants** on basic-mode items (mileage in subtitle path in adapter).

Detail-fetch is **optional** in Apify task config; when off, only title + price + sparse fields reach ingest. Item 60 should define **minimum fields for LLM** with and without detail mode.

**Out of scope for item 60 (item 57 Phase 2 / vision):** listing **photos** → Claude vision. Requires durable image storage (Facebook URLs expire). Track separately in `LLM-YMMS-Normalization.md` §8.

---

## Goal

Give Claude **the same evidence a closer would skim** on the Facebook listing — at minimum **description** and any other **stable text fields** we already receive from Apify — so ambiguous titles (F-150 “Short Bed”, base “Accord”, etc.) can become confident **`llm_hit`** picks when the text supports one Cox row.

**Non-negotiables (unchanged from item 57):**

- Claude **proposes**; **`isValidCoxPick`** against `cox_catalog_tree` **disposes**.
- Only **`llm_hit`** (not `needs_review`) drives MMR catalog resolution in `workerClient.ts`.
- **Never invent mileage** (item 54) — pass **actual** listing mileage when known; omit when unknown.
- Do not let Claude call Cox/Manheim directly.

---

## Suggested implementation phases

### Phase A — Wire text context without schema churn (fastest)

**Shipped in code (pending deploy):** `extractLlmListingTextFromIngestItem()` + `buildLlmYmmsPrefetchInputs()` pass **description**, **condition**, **stated mileage**, and **location** from the raw/mapped Apify item into `LlmYmmsResolutionInput` / `buildYmmsUserPrompt`. Parser lines are labeled **hypothesis**; title/description are **evidence**.

Pass LLM context from the **raw Apify item** at prefetch time (same batch as today):

- After `parseFacebookItem`, also read known flat keys from the mapped item: `description`, `condition`, optional capped **raw evidence block** (e.g. first 2k chars of seller text fields only — no secrets).
- Extend `LlmYmmsResolutionInput` + `buildLlmYmmsPrefetchInputs` + `buildYmmsUserPrompt` to render these sections.
- Unit tests: F-150 fixture with description containing “SuperCrew XLT 4x4” → prompt contains description; eval `--one` with description changes outcome vs title-only.

### Phase B — Persist for detail UI + re-evaluation

- Add `description` (and optionally `condition`) to `normalized_listings` if product wants it on opportunity detail — migration + `upsertNormalizedListing` + Facebook adapter or post-adapter copy from raw.
- Ensure `mapRaidrApiItem` + ingest path preserve description on **normalized** row when present.

### Phase C — Apify product config

- Document which tasks should enable **detail fetch** for description/odometer vs cost/latency tradeoff (`docs/04-operations/apify.md`).
- Align custom-vehicle-scraper vs Craigslist (future) field mapping.

### Phase D — Measure

- Re-run `npm run eval:llm-ymms` on **`model_variant_missing`** cohort **with description joined** from raw listings or new column — compare **`llm_hit` rate** vs 2026-07-21 baseline (16/82).
- Production funnel: share of `llm_needs_review` vs `llm_hit` on ingest; MMR hit rate on listings that previously got `cox_no_data` with title-only.

---

## Primary files

| Area | Path |
|------|------|
| Ingest LLM inputs | `src/ingest/handleIngest.ts` (`buildLlmYmmsPrefetchInputs`) |
| Resolver | `src/valuation/resolveListingWithLLM.ts`, `src/valuation/workerClient.ts` |
| Prompt | `src/llm/ymmsPrompt.ts`, `src/llm/anthropicClient.ts` |
| Apify mapping | `src/apify/payloadAdapter.ts`, `src/apify/webhookHandler.ts` |
| Facebook adapter | `src/sources/facebook.ts` |
| Types / DB | `src/types/domain.ts`, `supabase/migrations/` (if persisting description) |
| Eval | `scripts/eval-llm-ymms.mjs`, `test/` for prompt + prefetch |
| Ops | `docs/04-operations/apify.md` |

---

## Exit criteria (item 60 done)

- [ ] Ingest passes **description** into Claude whenever Apify/raw item provides it (non-empty, length-capped).
- [ ] Prompt documents parser Y/M/M/T as **hypothesis** and seller text as **evidence** (wording in `ymmsPrompt.ts`).
- [ ] At least one **regression test** using real-shaped Apify JSON (title sparse + rich description) proving prompt content.
- [ ] Eval or production sample shows **measurable lift** in `llm_hit` or reduced `needs_review` on ambiguous-truck cohort (document before/after counts).
- [ ] No regression: item 57 gate still rejects invalid picks; `needs_review` still does not drive MMR without product change.
- [ ] Docs: this file + §60 in `NEXT_STEPS.md` updated with ship date and deploy version when merged.

---

## Fresh chat pickup checklist

1. Read **`LLM-YMMS-Normalization.md`** (item 57 rules) and **this file**.
2. Confirm **`LLM_YMMS_ENABLED=true`** on target env in `wrangler.toml` (flipped 2026-07-22, commit `47844d7`).
3. Inspect **`buildLlmYmmsPrefetchInputs`** — that’s the gap.
4. Pull one failing listing: `501249d8-e0c4-4271-b346-59fbd3828c91` + latest `llm_ymms_decisions` row for title `2016 Ford F-150 · Short Bed`.
5. Implement Phase A first; persist (Phase B) only if detail page should show description too.

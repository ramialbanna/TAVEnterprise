# TAV API — LLM ingest normalization (conversation handoff)

**Created:** 2026-07-16  
**Purpose:** Continue this work in a fresh Cursor chat. Captures decisions and direction from the RFP + ingest-quality discussion — not a full RFP rewrite.

---

## What we're trying to solve

Apify scrapers stay. **AI does not scrape.** Scraper output (title, description, parsed fields, photos) gets fed into an LLM layer that must:

1. **Extract Cox-valid Y/M/M/S** from listing text (primary near-term concern).
2. Eventually **classify private party vs dealer/curbstoner** (text + photos) — longer-term, aligned with RFP FR-3.

Goal: improve MMR hit rate at ingest. Current rule/parser + offline catalog matcher (~50% MMR hit post Phase C) still loses on messy Facebook titles, variant splits, trim-in-model strings.

---

## What we are NOT doing

- Replacing Cloudflare Workers with a standalone “trained AI” ingest service.
- Using AI to scrape marketplaces.
- Letting the model call Manheim/Cox directly or invent trim/mileage.
- Big-bang overnight rewrite.

**Keep:** Workers for webhooks, idempotency, Supabase persistence, MMR via intel worker, grading, audit.

**Add:** an LLM tier **before** MMR that proposes identity; a **deterministic catalog gate** disposes.

---

## Architecture (agreed direction)

```
Apify scraper → existing Worker ingest
  → fetch listing text (+ optional photos)
  → query Supabase for context (see below)
  → Anthropic API: propose Y/M/M/S (+ later: seller class)
  → validate pick against cox_catalog_tree / live catalog
  → if valid → existing MMR path
  → if ambiguous → suggestions / unprocessed queue (existing Phase C pattern)
```

**Principle:** *AI proposes, deterministic layer disposes.* Same as detail-page “Suggested Cox match” + Apply + `mmr_style_aliases` learning.

RFP alignment: Tier 1 text LLM for normalization (FR-4.2); seller vision is Tier 3 later (FR-3.5). Staged pipeline, not agent swarm.

---

## Anthropic API — is it enough to start?

**Yes**, for prototyping:

| Need | Status |
|------|--------|
| Anthropic API key (dev budget) | **Request from leadership** — primary blocker |
| Server-side caller (Worker or local script) | Use existing Worker secrets pattern; never expose key in web |
| Supabase access | Already have (`SUPABASE_URL`, service role on Worker) |
| Labeled eval set | Small batch of known dealer vs private + listings with known good/bad YMMS |

**Not needed yet:** fine-tuning, custom “company AI”, Queues, R2 (unless testing expired image URLs), replacing ingest.

---

## Database context for the model

Anthropic has **no direct Supabase connection**. Pattern:

1. Worker/script queries DB **before** the API call.
2. Inject results into the prompt (or tool results if using tools later).
3. Model returns structured JSON; Worker validates and persists.

**Context to pass for Y/M/M/S:**

- Listing: `title`, `description`, parser output (`year`, `make`, `model`, `trim` from `facebook.ts`)
- **Top-N Cox candidates** from `matchListingToCoxCatalog` / `cox_catalog_tree` for that year (forces pick-from-list, reduces hallucination)
- **`mmr_style_aliases`** — closer-learned mappings
- Optional: prior miss reason (`model_variant_missing`, etc.)

**Context for dealer vs private (later v0):**

- Title + description
- 3–5 photos (must be saved — FB URLs expire; R2 capture is RFP requirement for prod)
- Output: `private_party | dealer | curbstoner_suspected | needs_review` + machine-readable reasons

---

## Relationship to current codebase (TAV-AIP)

Already shipped / in progress (see `docs/NEXT_STEPS.md`, item **55**):

- Apify webhook ingest, Facebook adapter
- `resolveListingToCatalog`, `matchListingToCoxCatalog`, offline `cox_catalog_tree` (2016–2027, ~36k rows)
- `catalog_match_suggestions`, `mmr_style_aliases`, detail Apply UI
- MMR via intel worker; no invented mileage (item **54**)
- Unprocessed Leads queue (`SCRAPER_REVIEW_MODE` permanent)

**Gap the LLM tier fills:** parser/variant scoring still misses ~55% of MMR failures (`model_variant_missing`). LLM + catalog-constrained pick should beat rules on title-only identity.

**Worker deploy (2026-07-16):** `ece57e1c` — daily cron syncs **missing catalog years only**.

---

## RFP file (reference only)

`TAV_Acquisition_Pipeline_RFP.md` (Downloads) — full acquisition pipeline spec. Relevant to us:

- Mandatory stack matches current project (Workers, Supabase, Apify, Manheim).
- Seller classification + tiered pipeline = large net-new vs today.
- Y/M/M/S validation against Manheim dictionary before any valuation call (FR-4.2).
- LLM via commercial API preferred; no foundation model pre-training unless justified.

**Opinion (recorded):** Extend current TAV-AIP; don’t propose parallel greenfield. Real lift = seller classification + LLM normalization + configurable grading — ingest/MMR foundation already exists.

---

## Suggested first experiment (when API key arrives)

1. Script or Worker dev path: pull **100–500 historical listings** that missed MMR from Supabase.
2. For each: load text + top-3 catalog candidates from `cox_catalog_tree`.
3. Call Claude with structured output schema → pick `{ make, model, style }`.
4. Compare to current ingest result + human/joined truth if available.
5. Measure: MMR would-have-hit rate, invalid Cox token rate (target RFP ≥99% valid queries).

**Do not** wire to production ingest until eval shows lift.

---

## Seller classification (phase 2, after YMMS experiment)

- v0: text + photos → dealer vs private, reasons attached.
- Needs labeled set (even 50–100) from buyers.
- Feeds RFP blocked-seller registry later; not blocking YMMS prototype.

---

## Long-term vision (user stated)

Company AI with access to company info, replacing parts of manual pipeline work. **Start narrow:** good vs bad leads / seller type, then YMMS normalization at ingest. Expand context (historical outcomes, registry, policies) via same pattern — DB fetch → prompt context, not model-native DB access.

---

## Open items / ask leadership

- [ ] Anthropic API key + dev spend cap
- [ ] Optional: buyer-labeled sample set (dealer vs private, known-good YMMS)

---

## Cursor rule added this session

`.cursor/rules/no-unrequested-summaries.mdc` — don’t recap/summarize unless explicitly asked.

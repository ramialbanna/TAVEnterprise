# LLM Token Efficiency — Research (§70)

**Created:** 2026-08-11  
**Status:** Research complete — **awaiting buyer sign-off before any code**  
**Scope:** Ingest-time Claude Y/M/M/S path only (`src/llm/*`, `resolveListingWithLLM.ts`, `workerClient.ts`)  
**Related:** [`LLM-YMMS-Normalization.md`](LLM-YMMS-Normalization.md) · [`03-api/claude-prompt-caching.md`](03-api/claude-prompt-caching.md) · NEXT_STEPS §68, §69, items **57**, **60**, **61**, **65**, **66**

---

## Executive summary

Dallas Facebook ingest calls Claude on **every** listing that reaches the Y/M/M worker path (~95% process rate, ~300–500 runs/day). Token cost is dominated by the **full `(year, make)` Cox catalog subtree** (median **175** rows/call; Ford **458**, Chevrolet **334**) plus up to **2,000 chars** of listing description. Item **66** prompt caching is shipped but **cache hit rate is not persisted** — only Worker logs (`llm_ymms.anthropic_cache_usage`).

The largest **actionable wastes** today:

1. **~28% of Claude calls (`llm_needs_review`) are paid in full but the pick is discarded** — ingest falls back to the offline matcher anyway.
2. **LLM always runs before offline matcher** — listings the offline scorer would resolve confidently still pay for Claude.
3. **Prefetch window (concurrency 8) starts calls in ingest order**, interleaving makes and increasing `cache_creation_input_tokens` vs grouping by `(year, make)`.
4. **Alias fast-path (item 65) has 0 rows** — no repeat-listing savings yet.

**Recommended first implementation batch (after sign-off):** #2 offline-first gate, #4 prefetch reorder, #6 trim listing evidence, #9 persist token columns — all low–medium risk, measurable in one §68 Dallas run.

---

## 1. Current baseline

### 1.1 Production decision funnel (`tav.llm_ymms_decisions`, all time)

| Outcome | Count | Share | Notes |
|---------|------:|------:|-------|
| `llm_hit` | 5,520 | 71.9% | Trusted for MMR (`confidence > 0.5`, valid Cox pick) |
| `llm_needs_review` | 2,140 | 27.9% | **Full Claude cost; result unused for MMR** |
| `llm_invalid_pick` | 20 | 0.3% | Valid gate rejection |
| `alias_hit` | 0 | — | Never logged (table `mmr_style_aliases` also **0 rows**) |

**Latency** (only recorded on `llm_hit`): avg **3.7s**, p50 **3.3s**, p90 **5.5s**.

### 1.2 Catalog subtree size (proxy for cached prefix tokens)

| `input_make` | Avg catalog rows | Max rows | Calls |
|--------------|-----------------:|---------:|------:|
| Ford | 458 | 595 | 1,208 |
| Chevrolet | 334 | 389 | 1,318 |
| Ram | 246 | 347 | 381 |
| GMC | 232 | 269 | 478 |
| Toyota | 180 | 201 | 526 |
| Kia | 82 | 96 | 562 |
| Honda | 76 | 92 | 357 |

**Overall:** median **175** rows/call, avg **209**.

Ford + Chevrolet alone account for **~33%** of all Claude calls and **~50%+** of catalog tokens.

### 1.3 Prompt structure inventory

| Block | Source | Cached (item 66)? | Typical size |
|-------|--------|-------------------|--------------|
| System prompt | `YMMS_SYSTEM_PROMPT` | Yes | ~180 tokens |
| Tool schema | `YMMS_TOOL` | Yes | ~450 tokens |
| Catalog subtree | `buildYmmsCatalogCacheText()` | Yes (per year+make) | **~25–35 tokens × row count** → **4k–16k** |
| Listing evidence | `buildYmmsListingEvidenceText()` | No (per listing) | **~300–2,500** (description cap 2,000 chars) |
| Output | forced `propose_cox_ymms` tool | — | ~100–200 tokens (`max_tokens=1024`) |

**Files:** `src/llm/ymmsPrompt.ts`, `src/llm/anthropicClient.ts`, `src/llm/listingTextContext.ts`

### 1.4 Estimated tokens per listing (model-dependent; not logged to DB)

Anthropic bills: `total_input = cache_read + cache_creation + input_tokens` ([docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)).

| Scenario | Cached prefix (est.) | Uncached tail (est.) | Effective input cost (est.) |
|----------|---------------------:|---------------------:|----------------------------|
| **Cache hit** — median make (175 rows) | ~6,000 read @ 10% | ~600 full | **~1,200 token-equiv** |
| **Cache hit** — Ford (458 rows) | ~14,000 read @ 10% | ~600 full | **~2,000 token-equiv** |
| **Cache miss** — first Ford in window | ~14,000 write @ 125% | ~600 full | **~18,000 token-equiv** |

Output adds ~150 tokens at output pricing (~5× input on Sonnet).

**Gap:** `llm_ymms_decisions` has no token columns; `model` column is empty on all rows. Baseline token **measurement** requires Cloudflare log pull on `llm_ymms.anthropic_cache_usage` for one Dallas FB run (§68 playbook row).

### 1.5 Dallas FB ingest context (§68 baseline, 2026-08-11)

| Metric | Value |
|--------|-------|
| Runs / 24h | 231 |
| Truncation rate | 1.7% |
| Process rate | 95.4% |
| MMR hit (200-listing sample) | 61.5% |
| Top MMR miss | `llm_unavailable` |

Truncation is improved vs earlier ~59% (chunked ingest §67) but **per-listing Claude+MMR latency** still drives batch budget pressure on large runs.

### 1.6 Pipeline order today

```
alias lookup → load full catalog → Claude → gate
  → llm_hit / alias_hit → MMR
  → llm_needs_review / invalid / fallback → offline matcher → MMR or miss
```

Offline matcher (`matchListingToCoxCatalog`) runs **only after** Claude returns a non-trusted result — never as a pre-filter.

---

## 2. Already shipped (do not redo)

| Item | What | Token effect |
|------|------|--------------|
| **66** | `cache_control` on system + tool + catalog prefix | Large savings **when cache hits** |
| **57 §6 Phase 1** | `createLlmYmmsPrefetch` concurrency 8 | Throughput / less truncation; may **hurt** cache locality |
| **60** | Description + condition in prompt; 2,000-char cap | Accuracy win; adds uncached tokens |
| **61** | Auto-accept valid picks with `confidence > 0.5` | Quality gate; `needsReview` flag ignored |
| **65 Phase 1** | `maybeLearnIngestStyleAlias` after `llm_hit`+MMR | **Code shipped; 0 aliases learned** — investigate why |
| **69** | Dealer blacklist before LLM | Skips Claude entirely when seller ID present (**blocked on scraper data**) |

---

## 3. Anthropic official levers

Sources: [Prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching), [Batch processing](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing), local mirror [`03-api/claude-prompt-caching.md`](03-api/claude-prompt-caching.md).

| Lever | Fit for TAV ingest | Notes |
|-------|-------------------|-------|
| **Prompt caching (5 min TTL)** | ✅ Shipped (item 66) | Cache reads billed at **10%** of input; writes at **125%**. Min cacheable length ~1024 tokens (Sonnet) — our catalog prefix exceeds this. |
| **1-hour cache TTL** | ⚠️ Maybe | Useful if same `(year, make)` spans >5 min within a batch or across sequential chunks. Writes cost **2×** base input for that block. |
| **Batch API (50% discount)** | ❌ Real-time ingest | Async (≤24h); good for **eval/backfill**, not webhook ingest. |
| **`max_tokens` reduction** | ✅ Easy | Output is small structured JSON; **1024 → 256** is safe margin. |
| **Model choice** | ⚠️ Tiered | `LLM_YMMS_MODEL` defaults to `claude-sonnet-5`. Haiku on “easy” listings could cut cost ~3–5× if accuracy holds. |
| **Tool vs JSON mode** | — | Forced tool call is correct for schema enforcement; shortening tool **descriptions** saves cached tokens. |
| **Automatic caching** | — | We use explicit breakpoints; no change needed. |

---

## 4. Community / practitioner patterns

| Pattern | Source | TAV applicability |
|---------|--------|-------------------|
| Cache the **stable prefix**, vary the **tail** | Anthropic caching guide | ✅ Already item 66 |
| **Group requests** sharing the same prefix | Caching FAQ | ⚠️ Prefetch should sort by `(year, make)` |
| **Pre-filter** before LLM when rules suffice | Common in classification pipelines | ✅ Offline matcher exists but runs **after** LLM |
| **Learning loop** from accepted outputs | RAG / alias tables | ✅ Item 65 — not populating yet |
| **Smaller candidate sets** when hypothesis is strong | Retrieval-style prompting | ⚠️ Conflicts with locked “full subtree” design — see rec #3 |
| **Log cache_read/create/uncached** per request | Anthropic observability | ❌ Not in DB yet |

---

## 5. Ranked recommendations

Scoring: **Impact** (tokens saved or calls avoided) × **Effort** × **Risk**. Each includes a **§68 fast-validation** check.

### #1 — Offline-first gate: skip Claude when offline matcher is confident

| | |
|---|---|
| **Impact** | **High** — eliminates entire API calls (not just cached savings). If offline auto-lookup would succeed on ~30–40% of listings today, that's **~30–40% fewer Claude calls**. |
| **Effort** | Medium — reorder in `performMmrCall` / `resolveListingWithLLM`: run `matchListingToCoxCatalog` first; call Claude only when score `< AUTO_LOOKUP_MIN` (80) or tied top-2. |
| **Risk** | Medium — may miss cases where LLM disambiguates better than offline. Mitigate: log `ingest.llm_skipped_offline_confident` + A/B on 200-listing sample. |
| **§68 check** | One manual Dallas run: compare MMR hit % and `llm_ymms_decisions` count vs prior 24h; expect **fewer decisions rows**, MMR hit **≥ baseline 61.5%**. |

**Why #1:** Only recommendation that removes whole calls. Everything else optimizes calls we still make.

---

### #2 — Stop paying Claude for outcomes we discard (`llm_needs_review`)

| | |
|---|---|
| **Impact** | **High** — **27.9%** of calls (2,140) are `llm_needs_review`. Full input+output cost, then offline matcher used anyway. |
| **Effort** | Medium — options (pick one for v1): **(A)** Pre-call heuristic: skip Claude when title+description lack variant signals (cab, AWD, trim tokens). **(B)** Post-call: if offline matcher **also** hits auto-lookup, treat as success without needing high LLM confidence (merge paths). **(C)** Narrow band: accept `confidence ∈ (0.45, 0.50]` when offline agrees on model+style. |
| **Risk** | Medium — (C) touches item 61 threshold. Prefer (A) or (B) first. |
| **§68 check** | `needs_review` rate drops; MMR hit stable; spot-check 10 listings that would have been `needs_review`. |

**Note:** Avg confidence on `needs_review` is **0.49** — many are borderline rejections.

---

### #3 — Catalog subtree pruning using parser model hint

| | |
|---|---|
| **Impact** | **High** on token volume — Ford/Chevy calls drop from **~14k → ~2–4k** cached tokens if pruned to parser model ± fuzzy neighbors. |
| **Effort** | Medium–High — new `pruneCatalogSubtree(rows, parserModel, titleTokens)` before prompt build. |
| **Risk** | **High** — contradicts locked design (“full subtree” in `LLM-YMMS-Normalization.md` §2). Wrong prune = wrong pick. Requires eval harness regression. |
| **§68 check** | Run `scripts/eval-llm-ymms.mjs` on held-out set **before** prod; prod: cache_read tokens drop on Ford/Chevy without `llm_invalid_pick` spike. |

**Defer until #1–#2, #4–#6 measured** — highest accuracy risk.

---

### #4 — Sort prefetch batch by `(year, make)` before starting Claude window

| | |
|---|---|
| **Impact** | **Medium** — reduces `cache_creation_input_tokens` when concurrency 8 interleaves 8 different makes. Same total calls; cheaper calls. |
| **Effort** | **Low** — sort `inputsByIndex` keys in `createLlmYmmsPrefetch` or reorder map in `buildLlmYmmsPrefetchInputs`. |
| **Risk** | **Low** — ordering doesn't change correctness; may slightly change truncation boundary (same items, different order). |
| **§68 check** | One Dallas run: log ratio `cache_read / (cache_read + cache_creation)` ↑ vs prior run (Cloudflare logs). |

---

### #5 — Trim uncached listing evidence

| | |
|---|---|
| **Impact** | **Medium** — uncached tail is **100% billed**. Drops: `location` (not needed for Y/M/M/S), `condition` when redundant, description cap **2000 → 1000** chars, optional title-only mode when description empty. Est. **~200–800 tokens/call** saved. |
| **Effort** | **Low** — `listingTextContext.ts` + `buildYmmsListingEvidenceText`. |
| **Risk** | Low–Medium — description carries trim signals (item 60 rationale). A/B on listings with long descriptions. |
| **§68 check** | `input_tokens` (uncached) down in logs; MMR hit on description-heavy cohort unchanged. |

---

### #6 — Reduce `MAX_TOKENS` (1024 → 256) and shorten tool/system copy

| | |
|---|---|
| **Impact** | **Low–Medium** — output is ~100–200 tokens; prevents runaway completion billing. Shorter tool descriptions save **~100–200 cached tokens** (small vs catalog). |
| **Effort** | **Low** — `anthropicClient.ts`, `ymmsPrompt.ts`. |
| **Risk** | **Low** — monitor for truncated tool JSON (shouldn't happen at 256). |
| **§68 check** | Zero `anthropic_schema_invalid` / `anthropic_no_tool_use` log lines on one run. |

---

### #7 — Fix alias learning loop (item 65)

| | |
|---|---|
| **Impact** | **Medium long-term** — repeat `(make, model, trim)` combos skip Claude entirely. **0 rows today** despite 5,520 `llm_hit`. |
| **Effort** | Low–Medium — verify `maybeLearnIngestStyleAlias` preconditions (MMR success path? trim empty on most listings?). May need key on `(make, model, title_normalized)` instead of trim. |
| **Risk** | Low — wrong alias is worse than no alias; keep upsert conservative. |
| **§68 check** | `mmr_style_aliases` row count > 0 after one run; subsequent identical listing logs `alias_hit`. |

---

### #8 — Persist token usage on `llm_ymms_decisions`

| | |
|---|---|
| **Impact** | **Observability** (enables tuning, not direct savings) |
| **Effort** | Low — migration + wire `cacheUsage` from `anthropicClient` into `insertLlmYmmsDecision`. |
| **Risk** | None |
| **§68 check** | New columns populated on every Claude call; SQL dashboard for tokens/listing by make. |

---

### #9 — 1-hour cache TTL for catalog prefix (optional)

| | |
|---|---|
| **Impact** | **Medium** if batches exceed 5 minutes or chunks reuse same makes sequentially. |
| **Effort** | Low — `cache_control: { type: "ephemeral", ttl: "1h" }` on catalog block only. |
| **Risk** | Low cost (2× write price on that block); test on staging first. |
| **§68 check** | Fewer cache_creation events on second chunk of same make within 1h. |

---

### #10 — Model tiering (Haiku for easy / Sonnet for hard)

| | |
|---|---|
| **Impact** | **High** potential cost reduction (~3–5× on input for Haiku listings). |
| **Effort** | Medium — routing rule: offline score ≥ 60 but < 80 → Haiku; else Sonnet. Or Haiku when catalog rows < 100. |
| **Risk** | **Medium** — accuracy on variant-heavy trucks. |
| **§68 check** | Eval script pass rate ≥ baseline; prod MMR hit by make tier. |

---

## 6. Explicit non-goals

| Non-goal | Why |
|----------|-----|
| **Batch API for live ingest** | Async; breaks webhook latency and §68 same-day validation |
| **Multi-turn agent / tool loop** | Locked out in item 57; adds tokens and latency |
| **Remove deterministic Cox gate** | Safety / compliance |
| **Lower confidence threshold below 0.5 without eval** | Item 61 locked; risks bad MMR |
| **Vision / photos in v1** | Item 57 §8 — separate token budget |
| **Multi-day soak as ship gate** | §68 replaces with single-run metrics |

---

## 7. Suggested implementation order (post sign-off)

| Phase | Items | Expected win | Validation |
|-------|-------|--------------|------------|
| **A** (same day) | #4 prefetch sort, #6 max_tokens + copy trim, #8 token columns | Cache hit ↑; observability | One Dallas manual run + log SQL |
| **B** (1–2 days) | #1 offline-first gate | **−30–40% Claude calls** (est.) | MMR hit ≥ 61.5% |
| **C** | #2 needs_review waste, #7 alias loop | **−28% wasted calls** (partial) | Decision funnel + alias count |
| **D** (eval-gated) | #3 catalog prune, #10 Haiku tier | Largest token/call reduction | `eval-llm-ymms.mjs` + §68 |

---

## 8. Buyer sign-off (2026-08-11)

| # | Recommendation | Decision |
|---|----------------|----------|
| 1 | Offline-first gate | **Approved** |
| 2 | Fix `needs_review` waste | **Rejected** — out of scope |
| 3 | Catalog pruning (Ford/Chevy) | **Approved** |
| 4 | Sort prefetch by `(year, make)` | **Approved** |
| 5 | Trim listing evidence | **Approved** |
| 6 | Reduce `max_tokens` 1024 → 256 | **Rejected** — keep 1024 |
| 7 | Fix alias learning | **Approved** |
| 8 | Persist token columns | **Approved** (see §8.1) |

**Implementation scope (post sign-off):** #1, #3, #4, #5, #7, #8 — no #2, no #6.

Open: description cap **1000 vs 1500** chars for #5 (default 1000 unless buyer says otherwise).

### 8.1 Persist token columns — design spec

**Problem today:** Token usage exists only in ephemeral Worker logs (`llm_ymms.anthropic_cache_usage`). `tav.llm_ymms_decisions` has `catalog_row_count` and `latency_ms` but **no token fields**. The `model` column is always NULL in prod due to a field-name mismatch (`anthropicModel` in audit helper vs `model` in insert).

**Proposed migration** (`0069_llm_ymms_token_usage.sql`):

| Column | Type | Source (Anthropic `usage`) |
|--------|------|----------------------------|
| `cache_read_input_tokens` | integer | `cache_read_input_tokens` |
| `cache_creation_input_tokens` | integer | `cache_creation_input_tokens` |
| `uncached_input_tokens` | integer | `input_tokens` (uncached tail) |
| `output_tokens` | integer | `output_tokens` |

**Wire path:** `anthropicClient.ts` already parses cache usage → extend to include `output_tokens` → attach to `AnthropicCallResult` → propagate through `LlmYmmsResolution` (`llm_hit`, `llm_needs_review`, `llm_invalid_pick`) → `llmResolutionToAuditFields` → `insertLlmYmmsDecision`. Fix `anthropicModel` → `model` mapping at the same time.

**Example queries unlocked:**

```sql
-- Effective input tokens per listing (Anthropic billing shape)
SELECT AVG(cache_read_input_tokens + cache_creation_input_tokens + uncached_input_tokens) AS avg_input,
       AVG(output_tokens) AS avg_output
FROM tav.llm_ymms_decisions
WHERE cache_read_input_tokens IS NOT NULL;

-- Cache hit rate by make (prefetch sort validation)
SELECT input_make,
       ROUND(100.0 * SUM(cache_read_input_tokens) / NULLIF(SUM(cache_read_input_tokens + cache_creation_input_tokens), 0), 1) AS cache_read_pct
FROM tav.llm_ymms_decisions
WHERE created_at > now() - interval '24 hours'
GROUP BY input_make;

-- Token savings after catalog prune (Ford/Chevy before vs after deploy)
SELECT date_trunc('hour', created_at) AS hour,
       input_make,
       AVG(cache_read_input_tokens + cache_creation_input_tokens + uncached_input_tokens) AS avg_billed_input
FROM tav.llm_ymms_decisions
WHERE input_make IN ('ford', 'chevrolet')
GROUP BY 1, 2;
```

**§68 validation:** After one Dallas run, ≥90% of Claude outcomes should have non-null token columns; compare `cache_read / (cache_read + cache_creation)` before and after prefetch sort deploy.

---

## 9. §70 exit criteria tracker

- [x] `docs/LLM-Token-Efficiency.md` drafted with ≥5 ranked recommendations
- [x] Baseline captured from prod DB (`llm_ymms_decisions`, catalog row counts, outcome funnel)
- [ ] Baseline **token counts** from one Dallas FB run — **will be satisfied by #8 token columns after deploy**
- [x] Buyer sign-off on which recommendations to implement (2026-08-11 — see §8)
- [ ] **Implementation** — approved items #1, #3, #4, #5, #7, #8

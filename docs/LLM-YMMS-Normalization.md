# LLM Y/M/M/S Normalization — Implementation Walkthrough

**Created:** 2026-07-16 · **Rewritten:** 2026-07-18 · **Phase 0/1 code landed:** 2026-07-18
**Status:** Approach locked. **Code for Phase 0 (offline eval) and Phase 1 (prod wiring, flag OFF by default) is built and merged** — see §9 for exactly what's done vs still open. Nothing has been *run* against real data yet: no Anthropic key is configured in any environment, so `LLM_YMMS_ENABLED` staying `"false"` is not just a rollout choice, it's currently the only working state. **Read this doc first in a fresh chat** — it is the single source of truth for this work; `NEXT_STEPS.md` item **57** is just the tracker pointer.
**Related:** [`TAV API.md`](TAV%20API.md) (original handoff/context) · item **55** (offline matcher this supersedes) · item **46** (ingest cascade this reuses) · item **54** (never invent mileage — same rule applies here) · RFP FR-4.2

---

## 1. The problem (current state)

Facebook listings come in via Apify → `handleIngest.ts` → `resolveListingToCatalogForIngest` → offline scored matcher (`matchListingToCoxCatalog.ts`) → MMR lookup. That pipeline currently hits **~49.8%** MMR match rate on live ingests, and of the misses, **~55.4%** are `model_variant_missing` — Cox splits a model into variants (drivetrain, cab/bed, trim-in-model) and the scored matcher can't disambiguate from a messy Facebook title (see `NEXT_STEPS.md` §55 Phase C funnel numbers).

The scorer's own candidate list is part of the ceiling: it only ever surfaces a **pre-filtered top-3** to anything downstream (including the closer-facing "Suggested Cox match" UI). If the real answer isn't in that top-3, nothing downstream — including a smarter model — ever sees it.

## 2. Decision (locked 2026-07-18 — do not re-derive, just build)

Claude API access is now available. The approach:

1. **One structured-output Claude call per listing.** Not an autonomous agent, not a multi-turn tool-use loop. See §3 for why.
2. **Feed Claude the full, unfiltered Cox catalog subtree** for the listing's `(year, make)` — every model + style Cox has for that year/make — instead of a pre-scored top-3. The listing's `make` is already reliably parsed; it's model/trim that's ambiguous, and a year+make subtree is small (tens of models, low hundreds of styles at most), so this fits comfortably in context without any lossy pre-filtering.
3. **Claude proposes, deterministic code disposes.** Its `{ make, model, style }` answer must exist verbatim in `cox_catalog_tree` before anything downstream (MMR, lead scoring) trusts it. Since Claude was handed the exact valid list, this check is now a simple exact-match lookup, not fuzzy scoring.
4. **Runs on every listing**, not just parser misses — this is the primary Y/M/M/S path going forward, not a fallback. This has a real consequence for the ingest pipeline (§6) that must be fixed before rollout.
5. **Alias fast-path stays first.** `mmr_style_aliases` lookup (already in `resolveListingToCatalog.ts`) runs before any Claude call — an alias hit skips the LLM entirely. This is both a cost control and a correctness win (a closer already confirmed that exact mapping once).
6. **Photos are v2, not v1.** Not blocking the initial rollout. See §8.
7. **Carry-forward rules, unchanged:** never let the model call Cox/Manheim directly; never invent mileage or trim; AI is a proposer, never a source of truth.

## 3. Why a single completion call, not an agent

This task has a small, fully-known input set: listing text (+ later, photos) and the Cox catalog subtree for one year+make. We can fetch both deterministically *before* calling Claude — there's nothing for an agent to "go discover." An agent (multi-step tool use, letting the model decide what to look up) earns its complexity when the number/order of lookups is genuinely unknown ahead of time. Here it isn't, so a single call is strictly better:

- **Reproducible** — same input → same context, every time. Critical for building an eval set and for debugging a bad pick after the fact.
- **Cheap and fast** — one round-trip, no back-and-forth latency.
- **Small blast radius** — Claude gets read-only context in the prompt, no tool access, no way to call anything external.
- **Easy to test** — the resolver function is a pure `(listing, catalogSubtree) → decision` shape, mockable like every other resolver in `src/valuation/`.

The only "tool use" involved is a **forced tool call / JSON schema** used purely to make Claude return well-formed structured output — not multi-step reasoning over external actions.

## 4. Architecture — updated pipeline

```
Apify → existing Worker ingest (raw insert → adapter → normalized upsert → dedupe)
  → alias fast-path: mmr_style_aliases lookup on (make, model, trim)
      → HIT: use canonical Y/M/M/S directly, skip Claude            [cost control]
      → MISS: continue
  → fetch full Cox catalog subtree for (year, make) from cox_catalog_tree
      → catalog empty/not synced for this year: fall back to today's
        offline matcher (matchListingToCoxCatalog) or live catalog API
  → Claude call: listing context + full model/style list → structured JSON pick
  → deterministic gate: does { make, model, style } exist verbatim in the
    fetched subtree?
      → VALID  → existing MMR path (same as today)
      → INVALID → Unprocessed queue (existing Phase C pattern), log as
        new miss reason `llm_invalid_pick`; never sent to Cox
  → (async, best-effort) persist the decision (input context, output,
    accepted/rejected, latency, model, cost) for eval + future prompt tuning
```

This is the same "AI proposes, deterministic layer disposes" shape as today's detail-page "Suggested Cox match" + Apply flow (item 46) and the offline matcher (item 55) — only the *proposal* step changes from a heuristic scorer to an LLM call, and the *candidate universe* it sees widens from top-3 to the full subtree.

**Fallback behavior:** if the Claude API call errors, times out, or the catalog subtree can't be loaded, fall back to the existing `matchListingToCoxCatalog` offline scorer rather than failing the listing outright. This keeps today's ~49.8% baseline as a floor while this rolls out, and gives you a real A/B signal (LLM pick vs scorer pick) during the eval phase.

## 5. Context payload and output schema

### Input context per listing

| Field | Source | Notes |
|---|---|---|
| `title`, `price` | `normalized_listings` / Apify | Raw listing evidence. **`description` does not exist as a captured field today** (`NormalizedListingInput` has no description column — Facebook titles carry most of the signal) — implemented with `title` + `price` only; revisit if a source ever adds a real description field |
| Parser output: `year`, `make`, `model`, `trim` | `facebook.ts` adapter | Starting hypothesis, not ground truth |
| Full model+style list for `(year, make)` | `cox_catalog_tree` via `loadCoxCatalogTreeForMake` | **Unfiltered** — this is the key change from the old top-3 approach |
| Learned aliases for this make (if any near-miss, non-exact) | `mmr_style_aliases` | Advisory context, exact hit already short-circuits above |
| Prior miss reason, if this is a re-attempt | `valuation_snapshots.missing_reason` | Helps the model understand why rules-based logic struggled |
| Few-shot examples (v1.1, optional) | Curated title → Cox path pairs from the eval set | Add after Phase 0 eval reveals systematic failure patterns |

Implemented in `src/llm/ymmsPrompt.ts` (`buildYmmsUserPrompt` / `buildCatalogSubtreeText`) — pure, no network, shared by the Worker resolver and `scripts/eval-llm-ymms.mjs` (the eval script duplicates it rather than importing, since it's a plain Node script with no TS build step — see the comment at the top of that script).

### Output (forced structured JSON)

```json
{
  "make": "Ram",
  "model": "1500",
  "style": "4D Crew Cab Big Horn",
  "confidence": 0.82,
  "reasoning": "Title mentions Crew Cab and Big Horn; Cox splits 1500 by cab/trim.",
  "needsReview": false
}
```

- `make`/`model`/`style` must be chosen **only** from the provided catalog list — the prompt must say this explicitly and the deterministic gate enforces it regardless.
- `needsReview: true` (or confidence below a threshold, e.g. 0.5) routes to Unprocessed with the LLM's own reasoning attached, instead of forcing a low-confidence auto-pick.
- `reasoning` is stored for audit/debugging, not shown to buyers.

### Deterministic gate

Trivial by construction, since Claude only ever sees valid options:

```ts
function isValidCoxPick(pick: LlmPick, subtree: CoxCatalogTreeRow[]): boolean {
  return subtree.some(
    (row) =>
      row.make.toLowerCase() === pick.make.toLowerCase() &&
      row.model.toLowerCase() === pick.model.toLowerCase() &&
      row.style.toLowerCase() === pick.style.toLowerCase(),
  );
}
```

Still enforce this in code (never trust the model's self-report) — occasional paraphrasing/typos happen even under instruction.

Implemented as `isValidCoxPick` in `src/llm/ymmsPrompt.ts`, called from `resolveListingWithLLM.ts` before a proposal is ever trusted.

## 6. Ingest architecture — the budget problem you must fix first

> **Status: Phase 1 FIXED (2026-07-20).** `resolveListingWithLLM` calls for a batch now run through a bounded-concurrency prefetch window instead of one sequential await per item — see "Phase 1 — implemented" below. Still `LLM_YMMS_ENABLED="false"` everywhere (blocked on Anthropic account credits, not this), but the sequencing/budget problem itself is no longer the blocker for flipping the flag.

`ingestCore` (`src/ingest/handleIngest.ts`) processes every item in a batch **sequentially**, inside a single Worker invocation:

```50:59:TAVEnterprise-main/TAVEnterprise-main/src/ingest/handleIngest.ts
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const BATCH_TIMEOUT_MS = 25_000;
...
const COMPLETION_RESERVE_MS = 1_500;
```

That's a **~23.5s wall-clock budget per ingest call**, shared across up to `MAX_INGEST_ITEMS = 500` items (`validate.ts`). Today that budget already covers several sequential Supabase round-trips plus one MMR-worker call per item. One more **sequential** network round-trip to Claude per item (realistically 1–4s for a text completion with this much catalog context) would exhaust the entire budget after roughly **15 items**, well below real Apify batch sizes — everything after that gets marked `truncated` and simply doesn't get processed that run.

**Phase 1 — implemented.** Fire the Claude calls for a batch with bounded concurrency instead of one-at-a-time in the main loop, while keeping the rest of the pipeline (raw insert, adapter, dedupe, per-item deadline check, MMR, scoring, lead upsert) exactly as-is and per-item sequential:

- `createLlmYmmsPrefetch()` (`src/valuation/workerClient.ts`) takes a `Map<index, LlmYmmsResolutionInput>` for the items in one ingest batch that will reach the YMM worker-mode valuation branch (no VIN, year/make/model present), and keeps a fixed-size sliding window of `resolveListingWithLLM()` calls in flight (default concurrency **8**, matching the "5–10" target below). All indices up to the cap start immediately at construction; each `consume(index)` call awaits (or starts, if the window hasn't reached it yet) that index's promise and slides the window forward by one slot as soon as it resolves.
- `handleIngest.ts` builds that input map in a pure, side-effect-free pre-pass (`buildLlmYmmsPrefetchInputs`, re-parses each item with the same `parseFacebookItem` the main loop already calls — cheap, deterministic, no I/O) *before* the main sequential loop starts, then calls `llmPrefetch.consume(i)` at the exact point in the loop the LLM resolution used to happen inline.
- `getMmrLookupOutcome` / `performMmrCall` gained an optional third argument, `{ llmResolution }` — when provided, `performMmrCall` uses it directly instead of calling `resolveListingWithLLM` itself; when omitted (every call site outside ingest, and any item the prefetch didn't register — VIN path, insufficient YMM), it falls back to the original inline-resolve behavior. Fully backward compatible; zero behavior change for existing callers.
- **Why this doesn't touch the deadline-truncation contract:** the per-item deadline check, raw insert, adapter, and dedupe steps are untouched — they still run exactly once per item, in order, with the same pre-item `Date.now() >= loopDeadline` gate as before. Only the *LLM resolution itself* overlaps across items; a chunk-based restructure (do phase 1 for N items, then phase 2, then phase 3) was considered and rejected specifically because it would have coarsened that deadline check to chunk-granularity and broken the existing per-item truncation tests.
- **Bounded waste, not a correctness issue:** if a batch is truncated by the deadline before reaching an item whose Claude call was already started by the window, that call is left to resolve and its result discarded — at most `concurrency` (8) wasted calls per batch, only on the (currently rare) truncation path.
- Tests: `test/valuation.llmYmmsPrefetch.test.ts` (windowing/concurrency/error-degradation, mocked `resolveListingWithLLM`), plus new cases in `test/valuation.workerClient.test.ts` (`llmResolution` opt passthrough) and `test/ingest.test.ts` (prefetch wiring end-to-end with `getMmrLookupOutcome` mocked). All pre-existing tests — including the exact-count deadline-truncation ones — pass unmodified.

**Phase 2 (do once volume/latency data from real traffic says you need it): move LLM resolution off the synchronous webhook path.** Ingest keeps writing raw/normalized/candidate rows fast as it does today; Y/M/M/S resolution + MMR happen in a second async pass (Cloudflare Queue, or a `pending_llm_resolution` status polled by cron) — the same shape already used for parking `model_variant_missing` misses today, just applied earlier and to more rows. Not needed yet — revisit only if Phase 1's concurrency cap turns out to be insufficient headroom once real Anthropic traffic and p50/p95 latency numbers exist.

## 7. Cost controls

Running an LLM call on every listing (not just misses) multiplies volume significantly versus the original "misses only" plan, so cost/latency discipline matters:

- **Alias fast-path first** (§4) — repeat listings for the same make/model/trim combo should almost never re-hit the LLM once a closer or an accepted Claude pick has been learned into `mmr_style_aliases`.
- **Persist accepted Claude picks into `mmr_style_aliases`** (source `ingest_learned`, mirroring the existing closer-correction learning loop) so the *second* time a given raw make/model/trim combo appears, it's a free alias hit, not another Claude call. This is the single biggest lever at volume — plan it as part of the initial rollout, not a "later" item.
- **Prompt caching** on the static portions of the prompt (system instructions, output schema/tool definition) — these repeat identically on every call.
- **Model tiering (consider, not required for v1):** a cheaper/faster model for the bulk of straightforward listings, escalating to a stronger model only when the first pass comes back low-confidence or `needsReview`. Only bother with this once Phase 0 eval data shows a meaningful split between "easy" and "hard" listings.

## 8. Photos / vision — v2, explicitly deferred

Vision is just another input block on the *same* single completion call — it doesn't change the "no agent" decision. But:

- **Prerequisite work, not a flag flip:** Apify photo capture needs to be enabled, and images need to be persisted somewhere durable (e.g. R2) because Facebook photo URLs expire — you cannot rely on capturing them at LLM-call time after the fact.
- **Cost/latency:** image tokens are meaningfully more expensive and slower than text. Most Y/M/M/S ambiguity (cab style, drivetrain, trim-in-model) is resolvable from text once Claude has the real catalog options — photos mainly help the smaller slice of cases where text is still genuinely ambiguous after the catalog-constrained text pass (e.g. visually distinguishing two similarly-named trims).
- **Recommended shape when this is picked up:** two-tier — run the text-only call first; only attach photos as a follow-up call when the text-only result is low-confidence or `needsReview`. Do not send photos on every listing by default.

Do not start this until Phase 0–2 below are shipped and the storage prerequisite is separately scoped.

## 9. Rollout plan

### Phase 0 — Offline eval (no prod wiring)

- [x] Build `scripts/eval-llm-ymms.mjs`: pulls historical `tav.valuation_snapshots` miss rows for a given `missing_reason` (default `model_variant_missing`), joins `normalized_listings` for title/trim/price, builds the full-catalog context, calls Claude, runs the deterministic gate, writes per-row results + a summary to `scripts/_eval-results/*.json` (gitignored). Optional `--verify-mmr` calls the real intel-worker MMR endpoint for a true would-have-hit signal (costs real Cox quota — off by default). Run with `npm run eval:llm-ymms`.
- [ ] **Blocked:** Confirm Anthropic API key + dev spend cap in Worker secrets (leadership already agreed to unblock this — see `TAV API.md` §Open items) — **nothing above has actually been run against real data yet**; the script errors out immediately without a real `ANTHROPIC_API_KEY` in `.dev.vars`
- [ ] Actually run it against 100–500 historical listings once the key exists, and read the results
- [ ] Metrics to check once run: **valid-Cox-token rate** (target ≥99%) and **would-have-hit-MMR rate** (via `--verify-mmr`) vs the ~49.8%/55.4% baseline in §1
- [ ] **Ship to prod (flip `LLM_YMMS_ENABLED`) only if this shows a real lift**

### Phase 1 — Prod integration behind a flag, text-only, concurrent

- [x] `src/llm/ymmsPrompt.ts` — prompt/tool-schema builder + `isValidCoxPick` gate (pure, unit-tested)
- [x] `src/llm/anthropicClient.ts` — Worker-side Claude caller, forced tool-use, 15s timeout, zod-validated response (unit-tested with mocked `fetch`)
- [x] `src/valuation/resolveListingWithLLM.ts` — alias fast-path → full-catalog fetch → Claude call → deterministic gate → typed `fallback` result (unit-tested with injected deps, no real Supabase/Anthropic needed)
- [x] `src/persistence/llmYmmsDecisions.ts` + migration `0066_llm_ymms_decisions.sql` — audit log (context in, decision out, latency, model, confidence/reasoning)
- [x] Wired into `workerClient.ts` behind `LLM_YMMS_ENABLED` (default `"false"` in every environment — see `wrangler.toml`); on any non-`fallback` outcome writes an audit row, and on `llm_invalid_pick`/an actual Claude-call failure with no offline resolution, tags the miss reason `llm_invalid_pick` / `llm_unavailable` instead of the generic `model_variant_missing`
- [x] New `MmrMissReason` values `llm_invalid_pick` / `llm_unavailable` added (free-text column, no migration needed for the enum itself)
- [x] Batch concurrency fix in `ingestCore` (§6 Phase 1) — `createLlmYmmsPrefetch` window, `2026-07-20`
- [ ] Roll out to a small traffic slice first, compare funnel metrics (same cohort methodology as `NEXT_STEPS.md` §55 Phase C re-measures) before going to 100% — **still blocked on Anthropic account credits, unrelated to this checklist**

### Phase 2 — Ingest concurrency/async at scale

- [ ] Measure real p50/p95 Claude latency and batch sizes from Phase 1 production traffic
- [ ] If Phase 1's prefetch-window concurrency isn't enough headroom, move to async hand-off (§6 Phase 2)

### Phase 3 — Learning loop

- [ ] Persist accepted Claude picks into `mmr_style_aliases` (source `ingest_learned`) so repeat combos skip the LLM call

### Phase 4 — Vision tier (see §8)

- [ ] Enable Apify photo capture
- [ ] Persist images durably (R2 or equivalent) before URLs expire
- [ ] Add low-confidence-triggered vision follow-up call

### Not in this doc (tracked separately in `NEXT_STEPS.md` item 57 backlog)

- Seller classification (dealer vs private/curbstoner) — RFP FR-3.5, phase 2, needs its own labeled eval set, not blocking this work
- Broader "company AI" context expansion (historical outcomes, registry, policies) — same DB-fetch-into-prompt pattern, later

## 10. Files

All built and merged (2026-07-18) unless noted:

| File | Purpose |
|---|---|
| `src/llm/ymmsPrompt.ts` | Prompt/context builder, Anthropic tool schema, `isValidCoxPick` deterministic gate — pure, no network |
| `src/llm/anthropicClient.ts` | Claude API caller, forced tool-use, 15s timeout, zod-validated structured output |
| `src/valuation/resolveListingWithLLM.ts` | Resolver: alias → full-catalog fetch → Claude → gate → typed fallback; deps-injected for testing |
| `src/persistence/llmYmmsDecisions.ts` | Persist/query audit log of every LLM decision |
| `supabase/migrations/0066_llm_ymms_decisions.sql` | Schema for the audit table |
| `scripts/eval-llm-ymms.mjs` | Phase 0 offline eval harness (`npm run eval:llm-ymms`) — duplicates the pure prompt/gate logic rather than importing (plain Node script, no TS build step) |
| `src/llm/__tests__/ymmsPrompt.test.ts`, `src/llm/__tests__/anthropicClient.test.ts`, `src/valuation/__tests__/resolveListingWithLLM.test.ts` | Unit tests — no real Supabase/Anthropic required |

Existing files touched:

| File | Change |
|---|---|
| `src/valuation/workerClient.ts` | Calls `resolveListingWithLLM` ahead of the offline matcher inside `performMmrCall`'s YMM branch, gated by `LLM_YMMS_ENABLED`; writes the audit row; maps `llm_invalid_pick` / an actual Claude failure into the corresponding `MmrMissReason` when the offline fallback also can't resolve a model |
| `src/valuation/mmr.ts` | `MmrParams` gained an optional `price` field, forwarded from `handleIngest.ts`, passed through only as LLM prompt context |
| `src/ingest/handleIngest.ts` | Passes `listing.price` into `getMmrLookupOutcome` |
| `src/types/env.ts`, `wrangler.toml`, `.dev.vars.example` | New secrets/vars: `ANTHROPIC_API_KEY` (secret), `LLM_YMMS_ENABLED` / `LLM_YMMS_MODEL` (vars, `"false"` everywhere by default) |
| `test/valuation.mmr.test.ts`, `test/apify.webhook.test.ts`, `test/alerts.test.ts` | Test `Env` fixtures extended with the three new fields |
| `src/valuation/workerClient.ts`, `src/ingest/handleIngest.ts` | Batch concurrency for the LLM step (§6 Phase 1) — **done 2026-07-20**: `createLlmYmmsPrefetch`, `MmrLookupOutcomeOpts`, `buildLlmYmmsPrefetchInputs` |
| **Still to touch:** `src/persistence/mmrStyleAliases.ts` | Write accepted Claude picks as `ingest_learned` aliases (Phase 3) — **not done** |

## 11. Explicitly out of scope / do not do

- No autonomous agent, no multi-turn tool-use loop, no giving the model its own DB/Cox/Manheim access (§3, and carried forward from `TAV API.md`).
- No inventing mileage or trim — same rule as item 54, applies to the LLM path too.
- No wiring to production ingest before Phase 0's eval shows a real lift (§9).
- No sending photos on every listing (§8) — text-first, vision only as a low-confidence follow-up, and only once the storage prerequisite exists.

## 12. Incidental bug found while reviewing the code this replaces

`matchListingToCoxCatalog.ts` line 83, inside `parserGarbagePenalty`:

```ts
if (/\b${normalizeToken(make)}\s+${normalizeToken(make)}\b/.test(t)) return 30;
```

This is a plain regex literal, not a template string — the `${...}` never interpolates, so this duplicate-make-token penalty never fires. Low priority since this matcher is being demoted to a fallback path (§4), but worth a one-line fix (`new RegExp` with a real template string) if that fallback stays alive long-term.

## 13. Blockers

- [x] Anthropic API key configured — done 2026-07-20 (`.dev.vars`, staging, production secrets, see `NEXT_STEPS.md` item 57)
- [ ] **Anthropic account credit balance (billing/ops).** The key works end-to-end (auth, prompt build, tool-use gate all confirmed), but every real call fails with HTTP 400 "credit balance too low" — this is the actual remaining blocker on running any of §9/§10 against real data. Add credits/payment method in the Anthropic Console → Plans & Billing, then re-run `npm run eval:llm-ymms`.
- [ ] Small labeled eval set (known-good Y/M/M/S for a sample of historical listings) — needed to score Phase 0 beyond "valid token rate"; `--verify-mmr` on the eval script is a partial substitute (real Cox hit/miss) but doesn't confirm the pick was *correct*, only that Cox had pricing for it
- [x] Ingest batch-concurrency fix (§6 Phase 1) — done 2026-07-20; was a hard blocker before `LLM_YMMS_ENABLED` could go on for real ingest traffic, now cleared

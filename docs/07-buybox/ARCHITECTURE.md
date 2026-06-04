# MaxBuy — System Architecture

**What this is / who it's for:** The system architecture for MaxBuy and, specifically, the **serving decision** — how a recommendation gets from a trained artifact to a buyer at the lane. It covers where MaxBuy sits relative to TAV-AIP, the offline/online split, three concrete serving options (A/B/C) with a recommendation, the offline-pipeline operational contract, the `tav-intelligence-worker` dependency, versioning/retention, and architecture-layer risks. Audience: the solo dev (architect + implementer) and any reviewer. Companion docs: [`README.md`](README.md) · [`STATUS.md`](STATUS.md) · [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) · [`WORKER-CONTRACT.md`](WORKER-CONTRACT.md) · [`DATA-SUMMARY.md`](DATA-SUMMARY.md)

**Date:** 2026-05-20 · **Status:** Active · **Repo prefix:** `TAV-BB`

---

## 1. System context — where MaxBuy sits in TAV-AIP

MaxBuy is **standalone but not isolated**: its own deployable, reusing the platform's hardened spine (MMR access, Supabase, Google auth). It must not entangle the v2 Opportunities work.

```
        Buyer (mobile lane / desktop appraiser)
                       │  VIN (+ miles? + ask?)
                       ▼
        ┌──────────────────────────────────────┐
        │  MaxBuy API Worker  (TS, CF Worker)   │   ONLINE / fast path — never trains
        │  POST /maxbuy/evaluate                │
        │  gates → score → verdict (pure fns)   │
        └───────┬─────────────┬─────────────────┘
                │             │
   reuse        │             │  read benchmark views + model output + policy
   (do not      ▼             ▼
   rebuild)  ┌──────────────────────┐   ┌───────────────────────────────────┐
   ──────────│ tav-intelligence-    │   │  Supabase Postgres (tav schema)   │
             │ worker (MMR: VIN-    │   │  - purchase_outcomes (extended)   │
             │ first, YMM fallback, │   │  - maxbuy_* tables + benchmarks   │
             │ KV cache)            │   │  - model registry, pipeline runs  │
             └──────────────────────┘   └───────────────┬───────────────────┘
                                                        ▲
                                                        │  weekly write-back
        ┌───────────────────────────────────────────────┴─────────────┐
        │  Learning pipeline (Python) — scheduled job, NOT a Worker   │   OFFLINE / heavy path
        │  ingest sale week → rebuild features/benchmarks → train →   │
        │  backtest → promote (gated) → register version + artifact   │
        └─────────────────────────────────────────────────────────────┘
```

**Reuse vs new:**

| Component | Decision |
|---|---|
| MMR access | **Reuse** `tav-intelligence-worker` (VIN-first, YMM fallback, KV cache). Do not rebuild. Pin a versioned contract (§4.2). |
| MarketCheck | **Optional enrichment spike now, not a v1 hard dependency.** Use only after account/package, data quality, cost, rate limits, caching, and retention rights are verified. It can improve VIN decode/spec confidence, market context, listing history, and data strength, but it does not replace MMR or TAV outcomes. |
| Database | **Reuse** Supabase, `tav` schema. MaxBuy tables/views live alongside `purchase_outcomes`. All additive. |
| Auth | **Reuse** Google-domain-restricted auth from the existing `/web` pattern. |
| MaxBuy API Worker | **New** — separate `maxbuy` Worker. The only HTTP surface. |
| Offline Python pipeline | **New** — the only genuinely new infrastructure. |

> The master spec earlier sketched a standalone `buybox_*` schema with a Redis cache. This architecture **supersedes** that: we use the `tav` schema and the platform's existing KV-backed intelligence-worker, per the Leadership Brief and best-in-class spec. No Redis.

## 2. The offline / online split

The split is the right spine — the risk is the **operational contract around it**, not the split itself (closes R8).

| Path | Runtime | Responsibility | Latency budget |
|---|---|---|---|
| **Online** | MaxBuy Worker (TS, pure fns) | Read benchmarks + current model output + policy; assemble verdict. Never trains. | < 1.5s P99 incl. MMR call (master spec KPI). |
| **Offline** | Scheduled Python job (NOT a Worker) | Weekly: ingest → rebuild features/benchmarks → train → backtest → promote (gated) → register versioned artifact + benchmark/feature-view version. | Hours; no user-facing SLA. |

The offline pipeline produces **versioned artifacts**: a model artifact (with hash), benchmark/feature-view refresh IDs, and write-back of segment predictions/benchmark medians the online path reads. The online path consumes only versioned, immutable inputs — which is what makes decision replay possible ([`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) §3).

## 3. Serving decision — Option A / B / C

**The core question:** Cloudflare Workers cannot run XGBoost/LightGBM natively (no Python runtime, tight CPU/memory budget). So *how* a recommendation is served is the single biggest technical fork. Three concrete options:

### Option A — Precomputed benchmark lookup (SQL-only)
The offline job materializes segment-level recency-weighted **benchmark medians** (`sale_pct_mmr`, net gross, transport, expenses) into Postgres views/tables, optionally mirrored to KV. The Worker reads the benchmark for the VIN's segment and applies the additive max-buy formula.

| Tradeoff | |
|---|---|
| Pros | Zero new infra; fully explainable ("we usually clear this segment at 97% of MMR"); ships now; trivially replayable via `benchmark_version`. |
| Cons | Not a "real" model — misses per-VIN feature interactions; staleness between weekly refreshes (a Tuesday-11pm decision uses last refresh, not Wednesday's rebuild). |

### Option B — On-demand scoring against the latest artifact
The offline GBM is trained weekly; **either** (B1) its per-segment predictions are written back to Postgres lookup tables the Worker reads, **or** (B2) a feature vector is assembled at request time and scored against the latest model artifact loaded into the worker / intelligence-worker.

| Tradeoff | |
|---|---|
| Pros | Model power without a permanently-running inference server (B1); fresher per-request signal (B2). |
| Cons | B1 flattens per-VIN interactions to segments. B2 means model-loading / cold-start cost in the Worker (ONNX-in-wasm is heavy, fragile, bundle-bloating — avoid unless A/B1/C are blocked). More per-request cost. |

### Option C — Hybrid: precomputed base + real-time adjustment
Precomputed segment benchmark (Option A) is the **base**; a real-time adjustment layer applied in the Worker at request time layers on asking price, listing freshness, live MMR (VIN-vs-YMM, cache age), and mileage deviation. A separate small Python inference service (Cloud Run / Fly / Modal) can serve the per-VIN GBM behind this when justified.

| Tradeoff | |
|---|---|
| Pros | Fresh per-request signal on the volatile inputs (ask, live MMR) while keeping the explainable base; degrades gracefully to the benchmark if the live layer/MMR fails. |
| Cons | One more deployable + network hop + cost (the inference service); more moving parts; per-VIN service only justified if it beats segment lookups on *decision* metrics, not just sale-price MAE. |

### Recommendation

**v1 = Option A. v2 = Option B1 (offline GBM → segment lookup tables). Escalate to Option C only when a rolling-holdout backtest shows per-VIN inference materially beats segment lookups on decision metrics** (gross-hit classification, max-buy regret, no degradation in high-volume segments) — not merely on sale-price MAE.

**Rationale, tied to charter criteria:**
- **Explainability (CHARTER AC-1):** Option A is maximally defensible at the lane — the buyer can read the segment comp behind the number. B1 keeps that explainability; B2/ONNX-in-Worker erodes it.
- **Cost / moving parts:** A and B1 add zero always-on infrastructure. C's inference service is the only option that adds recurring cost and a network hop — it must earn its keep. The owner has signalled willingness to run one small Python service, so C is *on the table*, but gated behind backtest evidence.
- **Replay (CHARTER AC-8):** A and B1 are trivially replayable because every recommendation pins `benchmark_version` / `model_artifact_hash` against immutable, versioned inputs. B2's request-time scoring and C's live adjustment must additionally pin the exact feature vector and the live-MMR snapshot — which [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) §3 already requires.

### Dual training target for v2 ML (R1 hedge)

When ML is trained (Phase 4), train **two targets in parallel**: `sale_pct_mmr` (the primary, master-spec target) **and** a residual-dollar target (e.g. `actual_sale_price − current_mmr` or raw `sale_price` by price band). Compare residuals by price band, MMR source, age, mileage, and segment. This is the explicit hedge against MMR's per-segment bias hiding at price extremes — pure %MMR normalization can suppress TAV's edge where MMR is systematically wrong. The decision objective stays primary-target-first; the residual-dollar target is a diagnostic and a tiebreaker, not a separate verdict source.

## 4. Architecture spikes (punch-list 11–14)

### 4.1 Offline pipeline operations (item 11)
| Concern | Decision / spike |
|---|---|
| Scheduler / runtime | Scheduled Python job (cron-style), anchored to TAV's existing **Wednesday sale week**. Candidate hosts: Cloud Run Job / Fly Machine / Modal — pick one in the spike; same host can later serve Option C inference. |
| Run log | `tav.maxbuy_pipeline_runs` — one row per run: started/finished, status, rows ingested, benchmark/feature-view version produced, model artifact hash, promotion decision, error. DDL in [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) §1.7. |
| Artifact storage + hash | Store the trained artifact in object storage; record a content **hash** in `maxbuy_models`. The hash is stamped on every recommendation that used it (replay). |
| Retry / alert / rollback | Retry transient ingest failures with backoff; alert the dev on hard failure or skipped run (a silent missed retrain is the solo-dev failure mode — R8). Rollback = keep the prior production model live; never auto-promote on failure. |

### 4.2 `tav-intelligence-worker` contract (item 12)
- **Document and version** the request/response schema MaxBuy depends on. Store the contract version in the recommendation snapshot — a worker change must not silently alter MaxBuy decisions (R9).
- **Decide which normalized MMR fields are safe + sufficient to persist:** VIN-vs-YMM path, MMR method, source, day-of value (contract-allowed only), cache age, missing reason, timestamp. **Never** persist licensed raw payloads (R18 / CHARTER AC-7).
- Add compatibility tests before MaxBuy depends on the worker. Versioned API contract detailed in [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) §2.

### 4.3 Feature & benchmark versioning (item 13)
- Every benchmark/materialized-view rebuild gets a **refresh ID / version** (`benchmark_version`, `feature_view_version`).
- Every recommendation is stamped with the exact versions used (R7).
- Old benchmark outputs needed for replay/backtesting are **preserved**, not overwritten in place. A VIN evaluated at 11pm Tuesday must replay against Tuesday's benchmark, not Wednesday's rebuild.

### 4.4 Retention split (item 14 / R16)
| Class | Retention |
|---|---|
| Compact **immutable recommendation snapshots** (the replay set) | **Indefinite.** |
| Detailed lookup / UI / session records (nonessential) | **Purge after 90 days.** |
| Lookup that created an Opportunity | Snapshot kept permanently with the Opportunity. |

**Vendor restriction note:** the retention split must not conflict with Manheim contract terms on valuation data — store only normalized, contract-allowed MMR fields and snapshot IDs in the indefinite set; never licensed raw payloads (R18). Confirm against the current vendor contract before enabling indefinite retention.

### 4.5 MarketCheck VIN enrichment spike (item 19)

TAV has a MarketCheck account, so evaluate it during pre-code as an enrichment source. It is **not** part of the v1 decision spine until proven. The spike must confirm:

- which endpoints are included in TAV's account/package;
- whether VIN decode/specs, recall, listing history, active-market comps, and market price fields are available;
- rate limits, cost per lookup, timeout behavior, and caching terms;
- which fields are safe to persist in MaxBuy snapshots and which must remain transient;
- whether MarketCheck improves data strength, hard-gate detection, or buyer explanation on 25-50 known TAV VINs.

MMR remains the wholesale anchor. TAV purchase outcomes remain the proprietary learning signal. MarketCheck may support `data_strength`, UI context, hard-gate evidence where contractually available, and enrichment badges, but MaxBuy must degrade gracefully when MarketCheck is unavailable.

## 5. Data-audit spikes (punch-list 6, 7, 9, 10)

These are read-only investigations to run **before** ML, not code:

| Spike | Item | What to produce |
|---|---|---|
| Historical field completeness | 6 | Null-rate audit for every proposed `purchase_outcomes` extension; mark each field **backfillable / future-only / unavailable** ([`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) §1.1); define model behavior for NULL-heavy fields before training. |
| Segment support matrix | 7 | Count rows by `year/make/model/trim/region/mileage_band`; count **effective** rows after recency weighting; define minimum effective N for exact segment, fallback segment, global fallback. |
| MMR quality & residuals | 9 | Audit VIN-MMR vs YMM-fallback rates; track missing reasons + cache age; backtest `actual_sale_price − day_of_mmr` by segment / price band / MMR method (R1). |
| Decay-rate validation | 10 | Backtest a λ grid by sale week (e.g. 90/180/365/540-day half-life); compare sale-price MAE, gross-hit classification error, and segment-level stability before fixing λ. |

## 6. Evaluation rubric refresh (punch-list 18)

Re-run the earlier buybox solution-evaluation weighted rubric with **v1 adoption-weighted** criteria for the *initial build* decision:
- **Increase** explainability (C5) and product/UX-workflow (C6) weights — for an internal buyer tool the first failure mode is non-use (R11). Suggested: C5/C6 to ~15 each.
- **Downgrade** governance/MLOps maturity scores (C4) until promotion metrics and pipeline ops are actually specified — the original scorecard overstated maturity (R12).
- Document any changed conclusions.

## 7. Architecture-layer risks

Full register in [`../../archive/07-buybox-pre-code/04-RISK-REGISTER.md`](../../archive/07-buybox-pre-code/04-RISK-REGISTER.md). The architecture-class risks owned by this document:

| ID | Severity | Issue | Mitigation in this doc |
|---|---|---|---|
| R2 | BLOCKER | Recommendation log can't replay a past decision. | Versioned inputs (§4.3); pinned fields enumerated in [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) §1.4 + §3. |
| R7 | HIGH | Weekly views create staleness/replay ambiguity. | Version every refresh; preserve old outputs; stamp the version used (§4.3). |
| R8 | HIGH | Offline pipeline has no scheduler/monitoring/recovery. | Run table, retry/alert, rollback-to-prior-model (§4.1). |
| R9 | HIGH | `tav-intelligence-worker` contract implied, not versioned. | Pin + version contract; store schema version (§4.2). |
| R16 | MED | 90-day detail retention vs long-horizon replay. | Compact immutable snapshots indefinite; purge raw detail only (§4.4). |

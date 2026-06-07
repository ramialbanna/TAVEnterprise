# MaxBuy — Status

**Last updated:** 2026-06-07 · **Phase:** P0–P9 complete · **P10 next** (Shadow ML — future)  
**Repo prefix:** `TAV-BB`

Single checklist for what's closed, what's open, and when to start building.

---

## Exit criteria — ready to write code

| # | Criterion | Status |
|---|---|---|
| 1 | Owner/product decisions (items 1, 2, 4, 5) closed | ✅ Closed 2026-05-20 |
| 2 | Data audits 6, 7, 9 done; backfill (#20) loaded | ✅ 57,228 rows in Supabase |
| 3 | Worker contract pinned (#12) + CI compat test | ✅ `mmr-v1` + `test/maxbuy.mmr-contract.test.ts` |
| 4 | Architecture spikes 11, 13, 14 scoped | ⚠️ #13 versioning live in views; #11/#14 still scoped |
| 5 | UI mocks for override + two-state display (#15, #16) | ⬜ Blocked on Product |
| 6 | Adoption KPI floors + rubric refresh (#17, #18) | ⬜ Blocked on Product |

**Practical gate:** P0–P2 shipped. Start **P5** (`maxbuy-worker` + evaluate API). P4 workflow UI shell can run in parallel. Full buyer-facing MVP still waits on product items 15–18 for UI polish.

---

## Unified plan progress (IMPLEMENTATION-PLAN P0–P10)

| Phase | Ships | Status |
|---|---|---|
| **0** | `purchase_outcomes` prod schema reconcile | ✅ `0052` on `main` |
| **1** | λ backtest → 180d half-life | ✅ [`reports/10-decay-rate-report.md`](reports/10-decay-rate-report.md) |
| **2** | `maxbuy_*` DDL, benchmark mat views, scoring module | ✅ `0053`–`0056`, `src/maxbuy/scoring/` |
| **3** | Parse endpoint, `entry_method`, submit validation, duplicate block | ✅ on `main` |
| **4** | Nav, deal detail hero, MaxBuyCard shell | ✅ on `main` |
| **5** | `POST /maxbuy/evaluate` | ✅ on `main` |
| **6** | `/maxbuy` + deal detail evaluate live | ✅ on `main` |
| **7** | Overrides, passes, create-from-recommendation | ✅ on `main` |
| **8** | Async evaluate + queue badges | ✅ on `main` |
| **9** | UAT / retire Classic | ✅ on `main` |
| **10** | Shadow ML | ⬜ Future |

Detail: [`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md) §2.3

---

## Punch list — all items

Legend: ✅ Done · ⚠️ In progress · ⬜ Open · 📋 Design done, code pending

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Target net gross ($800/unit) | O | ✅ Seeded in `tav.maxbuy_policy` |
| 2 | ML promotion gate (8-week shadow proof) | P | ✅ |
| 3 | Decision replay schema | D | 📋 Tables exist; replay CI test at P5+ |
| 4 | Data strength semantics (no % confidence) | P | ✅ In `src/maxbuy/scoring/` |
| 5 | Hard gates catalog | O | ✅ MMR-missing active in scoring; stub framework at P5 |
| 6 | Field completeness audit | D | ✅ Re-audited post-backfill |
| 7 | Segment support matrix | D | ✅ |
| 8 | Pass-on logging design | D+O | ✅ Table `maxbuy_evaluated_passes`; API at P5+ |
| 9 | MMR quality & residuals | D | ✅ Median +$885 over MMR |
| 10 | Decay-rate λ backtest | D | ✅ **180d** — report committed |
| 11 | Offline pipeline host | D | ⬜ Scoped |
| 12 | Intelligence worker contract | D | ✅ `mmr-v1` pinned + CI fixture test |
| 13 | Benchmark versioning | D | ✅ `benchmark_version` on mat views (`bm-*-180d`) |
| 14 | Retention split + vendor sign-off | D+O | ⬜ Scoped |
| 15 | Override capture UI | P | ⬜ Needs mock |
| 16 | Two-state display UI | P | ⬜ Needs mock (logic in scoring module) |
| 17 | Adoption KPI floors | P | ⬜ |
| 18 | Evaluation rubric refresh | P | ⬜ |
| 19 | MarketCheck enrichment spike | D | ⚠️ Interim; live API checks pending |
| 20 | Historical outcome backfill | D | ✅ 57,228 rows loaded 2026-05-22 |

Full item definitions: [`../../archive/07-buybox-pre-code/05-PUNCH-LIST.md`](../../archive/07-buybox-pre-code/05-PUNCH-LIST.md)

---

## Closed decisions (reference)

| ID | Decision |
|---|---|
| DEC-1 | v1 target net gross: **$800/unit** global policy |
| DEC-2 | ML shadow-only until 8-week bid-quality proof + documented human approval |
| DEC-3 | UI shows **data strength** only; low caps verdict at Review |
| DEC-4 | Force-PASS: title brand, salvage, flood, structural, odometer, recall stop-sale, arbitration, source restricted |

---

## Four-concept boundary

MaxBuy is a **fifth concept** (Recommendation). It reads from outcomes/valuations; it never writes to `raw_listings`, `normalized_listings`, `vehicle_candidates`, or `leads`.

```
Raw Listing → Normalized Listing → Vehicle Candidate → Lead
                                              ↓
                              MaxBuy Recommendation (tav.maxbuy_*)
```

Detail: [`ARCHITECTURE.md`](ARCHITECTURE.md) §1

---

## Next actions (dev)

1. **Apply migration 0059** to staging and production (`wrangler d1 execute` / Supabase dashboard)
2. Product: approve mocks for #15, #16; set KPI floors for #17
3. After outcome loads: `REFRESH MATERIALIZED VIEW` on `mv_maxbuy_*` benchmarks
4. **P10** — Shadow ML pipeline (future; do not start until #15–17 resolved)

---

## Build phases (legacy numbering — see IMPLEMENTATION-PLAN for canonical P0–P10)

| Phase | Ships | Gate |
|---|---|---|
| 1 | Benchmark views, schema, λ chosen | ✅ Complete (P0–P2) |
| 2 | MVP API + snapshots + gates | ✅ Complete (P5) |
| 3 | Create-Opportunity from snapshot | ✅ Complete (P7) |
| 4 | Shadow ML pipeline | ⬜ P10 |
| 5 | ML promotion governance | ⬜ P10 |
| 6 | Per-VIN hybrid (optional) | ⬜ Future |

Full phase detail: [`../../archive/07-buybox-pre-code/00-LEADERSHIP-BRIEF.md`](../../archive/07-buybox-pre-code/00-LEADERSHIP-BRIEF.md)

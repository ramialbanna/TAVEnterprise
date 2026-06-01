# MaxBuy — Status

**Last updated:** 2026-06-01 · **Phase:** Pre-code → Phase 1  
**Repo prefix:** `TAV-BB`

Single checklist for what's closed, what's open, and when to start building.

---

## Exit criteria — ready to write code

| # | Criterion | Status |
|---|---|---|
| 1 | Owner/product decisions (items 1, 2, 4, 5) closed | ✅ Closed 2026-05-20 |
| 2 | Data audits 6, 7, 9 done; backfill (#20) loaded | ✅ 57,228 rows in Supabase |
| 3 | Worker contract pinned (#12) + CI compat test | ⚠️ Pinned `mmr-v1`; CI test pending Phase 1 |
| 4 | Architecture spikes 11, 13, 14 scoped | ⬜ Scoped only — run during Phase 1 setup |
| 5 | UI mocks for override + two-state display (#15, #16) | ⬜ Blocked on Product |
| 6 | Adoption KPI floors + rubric refresh (#17, #18) | ⬜ Blocked on Product |

**Practical gate:** Dev can start Phase 1 (benchmark views + schema) now. Full MVP ship waits on product items 15–18.

---

## Punch list — all items

Legend: ✅ Done · ⚠️ In progress · ⬜ Open · 📋 Design done, code pending

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Target net gross ($800/unit) | O | ✅ |
| 2 | ML promotion gate (8-week shadow proof) | P | ✅ |
| 3 | Decision replay schema | D | 📋 CI test in Phase 1 |
| 4 | Data strength semantics (no % confidence) | P | ✅ |
| 5 | Hard gates catalog | O | ✅ |
| 6 | Field completeness audit | D | ✅ Re-audited post-backfill |
| 7 | Segment support matrix | D | ✅ |
| 8 | Pass-on logging design | D+O | 📋 Table spec done; code at v1 ship |
| 9 | MMR quality & residuals | D | ✅ Median +$885 over MMR |
| 10 | Decay-rate λ backtest | D | ⚠️ Plan done; offline run pending |
| 11 | Offline pipeline host | D | ⬜ Scoped |
| 12 | Intelligence worker contract | D | ⚠️ `mmr-v1` pinned; CI pending |
| 13 | Benchmark versioning | D | ⬜ Scoped |
| 14 | Retention split + vendor sign-off | D+O | ⬜ Scoped |
| 15 | Override capture UI | P | ⬜ Needs mock |
| 16 | Two-state display UI | P | ⬜ Needs mock |
| 17 | Adoption KPI floors | P | ⬜ |
| 18 | Evaluation rubric refresh | P | ⬜ |
| 19 | MarketCheck enrichment spike | D | ⚠️ Interim; live API checks pending |
| 20 | Historical outcome backfill | D | ✅ 57,228 rows loaded 2026-05-22 |

Full item definitions: [`archive/pre-code/05-PUNCH-LIST.md`](archive/pre-code/05-PUNCH-LIST.md)

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

1. Commit prod `purchase_outcomes` schema extensions to `supabase/migrations/`
2. Run decay λ offline backtest (#10) → pick half-life for benchmark views
3. Branch `TAV-BB-phase-1-data-foundation` — benchmark views + `tav.maxbuy_*` DDL
4. Add MMR contract CI compat test (#12)
5. Product: approve mocks for #15, #16; set KPI floors for #17

---

## Build phases (after pre-code)

| Phase | Ships | Gate |
|---|---|---|
| 1 | Benchmark views, schema, λ chosen | Audits signed off |
| 2 | MVP API + snapshots + gates | KPI-1 buyer lookup rate |
| 3 | Create-Opportunity from snapshot | AC-6 = 100% |
| 4 | Shadow ML pipeline | DEC-2 framework live |
| 5 | ML promotion governance | KPI-4 + human approval |
| 6 | Per-VIN hybrid (optional) | Beats B1 on decision metrics |

Full phase detail: [`archive/pre-code/00-LEADERSHIP-BRIEF.md`](archive/pre-code/00-LEADERSHIP-BRIEF.md)

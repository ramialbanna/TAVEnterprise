# Report 19 — MarketCheck VIN Enrichment Spike (interim)

**Punch item:** #19 · **Kit:** [`../19-marketcheck-vin-enrichment-spike.md`](../19-marketcheck-vin-enrichment-spike.md)
**Date:** 2026-05-20 · **Status:** Interim — design-level findings complete;
live-account and VIN-sample checks pending TAV MarketCheck account access.

**Method:** design analysis only. No MarketCheck API call, no production code,
no API key handled. No raw provider payloads, VINs, or licensed Cox/Manheim
figures appear in this report.

---

## 1. Findings table

| Area | Finding | Decision impact |
|---|---|---|
| Account / package | **Pending** — needs the TAV MarketCheck account/entitlement check (kit Q1–Q2). | Determines which enrichment uses below are even possible. |
| Endpoints available | **Pending** — VIN decode/specs, listing history, price/comps, recalls, title/history indicators to be confirmed against the package. | — |
| Rate / cost limits | **Pending** — rate limit, timeout, per-lookup cost (kit Q3). | Sets whether MarketCheck is per-VIN-live or batch/cached enrichment. |
| Safe-persist fields | **Framework set** — normalized decode/spec fields (year/make/model/trim/body/engine) are persistence candidates; raw provider responses stay transient. Final list **pending** provider-terms review (caching/retention/redistribution rights). | Mirrors the R18 discipline in Report 12 §5. |
| Transient-only fields | Raw MarketCheck payloads — never stored indefinitely without explicit terms approval. | — |
| Decode / spec quality | **Pending** — needs the 25–50 known-VIN sample run (kit Q5). | Decides whether MarketCheck improves trim/spec confidence vs current parsing. |
| Listing-history quality | **Pending** — sample run. | — |
| Hard-gate signal quality | **Pending** — sample run. See §3. | — |
| Failure behavior | **Designed** — see §2. | Confirmed: MarketCheck is not a v1 hard dependency. |
| Recommendation | **Interim: defer the enable/reject call** until the live checks close. Leaning "enable later as optional v1 enrichment behind a feature flag." | — |

## 2. Failure-mode design (complete)

MarketCheck must not be able to break a recommendation. Confirmed design rule:

- MarketCheck unavailable, slow, quota-limited, or empty-result → MaxBuy still
  returns a recommendation. The enrichment is simply absent.
- Enrichment badges (`MARKETCHECK_HISTORY_AVAILABLE`,
  `MARKETCHECK_SPEC_MATCHED`) are dropped silently when the provider is down.
- In v1, `data_strength` is **not** lowered solely because MarketCheck is
  absent — `data_strength` is computed from TAV's own segment support
  (Report 07). MarketCheck may only *raise* spec confidence when present.
- A MarketCheck timeout is logged with a `reason_code`, never a silent drop.

## 3. Interaction with closed decisions

- **DEC-4 (hard gates):** the v1 force-PASS catalog
  (`GATE_TITLE_BRAND`, `GATE_SALVAGE`, `GATE_FLOOD`, `GATE_FRAME_STRUCTURAL`,
  `GATE_ODOMETER`, `GATE_RECALL_STOPSALE`, `GATE_ARBITRATION`,
  `GATE_SOURCE_RESTRICTED`) must not *depend* on MarketCheck. MarketCheck
  title/history fields may later serve as **supporting evidence** for a gate
  already triggered by a primary source, only if the field is contractually
  available and reliable — to be judged by the sample run.
- **DEC-3 (confidence):** MarketCheck spec-match quality is a candidate
  *input* to `data_strength`, never a percentage-style confidence display.

## 4. Disallowed uses for v1 (restated, confirmed)

MarketCheck must not: replace Manheim MMR as the wholesale anchor; replace TAV
historical outcomes as the learning signal; force Buy / Strong Buy from
MarketCheck price alone; or fail the whole recommendation when unavailable.

## 5. Definition of done — status

| Check | Status |
|---|---|
| Account/package capabilities documented | Pending live account check |
| Safe-persist field list documented | Framework set; final list pending terms |
| Failure/degrade behavior documented | Done (§2) |
| Small VIN-sample report (no raw payloads) | Pending sample run |
| Enable / defer / reject recommendation | Interim: defer; lean enable-later behind a flag |

To fully close #19: run the entitlement check and the 25–50-VIN sample, then
record the final recommendation. Both need TAV MarketCheck account access and
are the dev's next action — no production code is created either way.

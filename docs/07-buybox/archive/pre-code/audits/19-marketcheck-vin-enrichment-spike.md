# MarketCheck VIN Enrichment Spike

**Punch item:** 19  
**Type:** Architecture / provider spike  
**Status:** Pre-code, no production integration  
**Owner:** Dev  

## Purpose

TAV has a MarketCheck account. This spike determines whether MarketCheck should
be enabled as an optional MaxBuy enrichment source for VIN decode/specs, market
history, active comps, recall/context fields, and buyer explanation.

MarketCheck must not become a v1 hard dependency by default. MaxBuy must still
produce a recommendation when MarketCheck is unavailable.

## Guardrails

- Do not create `apps/maxbuy`, migrations, routes, or UI.
- Do not call MarketCheck from production code in this spike.
- Do not commit API keys, sample credentials, raw provider payloads, or licensed
  Cox/Manheim payloads.
- Use a small known-VIN sample and store only summarized findings in the report.
- Treat provider terms as a design input: caching, retention, display, and
  redistribution rights must be explicit before any field is persisted.

## Questions To Answer

1. Which MarketCheck endpoints are available under TAV's account/package?
2. Does the package include VIN decode/specs, listing history, MarketCheck
   price/comparables, recalls, title/history indicators, and dealer/listing
   market context?
3. What are the rate limits, timeout behavior, and per-lookup costs?
4. Which returned fields are safe to persist in compact recommendation
   snapshots, and which must stay transient?
5. On 25-50 known TAV VINs, does MarketCheck improve:
   - trim/body/spec confidence;
   - data-strength classification;
   - hard-gate evidence;
   - market-history explanation;
   - buyer-facing comp context?
6. What is the failure mode when MarketCheck is down, slow, quota-limited, or
   returns no result?

## Candidate Use In MaxBuy

Allowed uses, if the spike supports them:

- VIN/spec enrichment for year/make/model/trim/body/engine/options.
- Data-strength input when VIN/spec match quality is strong.
- Market-history context and buyer explanation.
- Hard-gate supporting evidence when the field is contractually available and
  reliable.
- Optional enrichment badges such as `MARKETCHECK_HISTORY_AVAILABLE` or
  `MARKETCHECK_SPEC_MATCHED`.

Disallowed uses for v1:

- Replacing Manheim MMR as the wholesale anchor.
- Replacing TAV historical outcomes as the learning signal.
- Forcing Buy/Strong Buy from MarketCheck price alone.
- Storing raw provider payloads indefinitely without explicit terms approval.
- Failing the whole recommendation because MarketCheck is unavailable.

## Suggested Test Sample

Use 25-50 VINs from TAV historical outcomes:

- common trucks;
- SUVs;
- sedans;
- high-mileage units;
- higher-dollar units;
- known edge cases where trim/style matters.

Do not commit VINs if they are sensitive. A report can use anonymized row IDs
or hashed VIN references.

## Report Template

| Area | Finding | Decision Impact |
|---|---|---|
| Account/package |  |  |
| Endpoints available |  |  |
| Rate/cost limits |  |  |
| Safe-persist fields |  |  |
| Transient-only fields |  |  |
| Decode/spec quality |  |  |
| Listing-history quality |  |  |
| Hard-gate signal quality |  |  |
| Failure behavior |  |  |
| Recommendation | Enable later / defer / reject |  |

## Definition Of Done

- Account/package capabilities are documented.
- Safe-persist field list is documented.
- Failure/degrade behavior is documented.
- A small VIN sample report is produced without raw provider payloads.
- Recommendation is one of:
  - enable as optional v1 enrichment behind a feature flag;
  - defer until after MaxBuy v1;
  - reject as not useful or not safe enough for this workflow.

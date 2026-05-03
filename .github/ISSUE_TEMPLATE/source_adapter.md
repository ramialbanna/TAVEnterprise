---
name: New source adapter
about: Add a marketplace source (Craigslist, AutoTrader, Cars.com, OfferUp, …)
title: "[source] add <platform> adapter"
labels: ["enhancement", "source-adapter"]
assignees: []
---

## Platform
<!-- e.g. craigslist, autotrader, cars_com, offerup -->

## What this source provides
- VIN exposed: yes / no / sometimes
- Stable listing id: yes / no
- Posted-at timestamp: yes / no / approximate
- Mileage as structured field: yes / no / in title only
- Seller identity / profile: yes / no
- Region / location format:

## Differences from Facebook adapter
<!-- Where does this platform differ? What changes in dedupe / stale / valuation as a result? -->

## Acceptance
- [ ] `src/sources/<platform>.ts` produces `NormalizedListingInput`
- [ ] No platform-specific code leaks into `src/normalize/`, `src/dedupe/`, `src/scoring/`
- [ ] At least 3 real-shaped fixtures under `test/fixtures/<platform>/`
- [ ] Unit tests cover happy path + missing YMM + missing mileage + malformed price + schema-drift sample
- [ ] `SourceName` union extended in `src/types/domain.ts`
- [ ] Wrapper Zod schema accepts the new source value
- [ ] Facebook fixtures still pass

## Plan template
Use `docs/plan-prompts/01-add-source-adapter.md` to scope this in Plan Mode before any edits.

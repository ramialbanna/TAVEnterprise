# ADR 0003 — Add `lubbock_tx` region key (Phase 8)

**Date:** 2026-05-23  
**Status:** Accepted

## Context

Phase 8 enables Apify `tav-tx-west` (task `vk7OijnAOOo8V1ekc`), which scrapes
Facebook Marketplace around Lubbock, TX. The ingest bridge maps Apify task IDs
to closed `REGION_KEYS`; unmapped tasks no-op with `unmapped_task`.

Existing keys cover Dallas, Houston, Austin, and San Antonio only.

## Decision

Add **`lubbock_tx`** to `REGION_KEYS` and map `tav-tx-west` → `lubbock_tx`.

- DB migration `0049` extends region CHECK constraints and adds `lubbock_tx` to
  the default broad + truck buy-box rules (not the Dallas/Houston luxury rule).
- Region score treats `lubbock_tx` as a **secondary** market (75), same tier as
  Austin and San Antonio.
- Oklahoma (`tav-ok`) remains out of scope until a separate ADR adds a non-TX key.

## Consequences

- West-TX listings persist under a distinct region for ingest monitor filtering
  and opportunity routing.
- Buy-box and scoring behave consistently with other secondary TX markets.
- Future metros still require ADR + migration; do not expand `REGION_KEYS` ad hoc.

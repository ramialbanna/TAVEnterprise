# ADR 0004 — Add `oklahoma_city_ok` region key (Phase 8)

**Date:** 2026-05-26  
**Status:** Accepted

## Context

Phase 8 enables Apify `tav-ok` (task `Xpq656NgueqfXDHvU`), which scrapes Facebook
Marketplace around Oklahoma City. The ingest bridge previously no-oped with
`unmapped_task` because `REGION_KEYS` was Texas-only.

## Decision

Add **`oklahoma_city_ok`** to `REGION_KEYS` and map `tav-ok` → `oklahoma_city_ok`.

- DB migration `0050` extends region CHECK constraints and adds `oklahoma_city_ok` to
  the default broad + truck buy-box rules (not the Dallas/Houston luxury rule).
- Region score treats `oklahoma_city_ok` as a **secondary** market (75), same tier as
  Austin, San Antonio, and Lubbock.
- Apify schedule `0qdlWHsaojVZxEb1s` is enabled after west and south soaks per
  [apify-phase8-regions.md](../../04-operations/apify-phase8-regions.md).

## Consequences

- OK listings persist under a distinct region for ingest monitor filtering.
- Buy-box and scoring behave consistently with other secondary markets.
- Future metros still require ADR + migration; do not expand `REGION_KEYS` ad hoc.

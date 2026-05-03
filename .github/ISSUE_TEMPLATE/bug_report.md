---
name: Bug report
about: Something is wrong in the TAV-VAIP pipeline
title: "[bug] "
labels: ["bug"]
assignees: []
---

## Symptom
<!-- What did you observe? What did you expect? -->

## Pipeline trace
- Stage where it surfaced: Raw / Normalized / Vehicle Candidate / Lead / Other
- Source: `facebook` / `craigslist` / `autotrader` / `cars_com` / `offerup` / N/A
- Region:

## Reproduction
- Sample payload (`test/fixtures/...` path or attached):
- Command / endpoint:
- Run id, listing url, listing id (if applicable):

## Logs / DB rows
<!-- Paste relevant rows from `tav.dead_letters`, `tav.filtered_out`, `tav.schema_drift_events`, or Worker logs.
     Redact anything that looks like a secret. -->

## Hypothesis
<!-- One sentence on what you think is broken and the cheapest test that would falsify it. -->

## Severity
- [ ] Blocks ingestion
- [ ] Corrupts data
- [ ] Loosens stale suppression
- [ ] Affects buyer queue
- [ ] Cosmetic / doc

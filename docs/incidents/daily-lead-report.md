# Daily lead report

Times are America/Chicago. Each new day gets a section at the top. Counts come from production `tav.raw_listings`, `tav.leads`, `tav.source_runs`, and `tav.filtered_out`.

**Unfiltered listings** are distinct Facebook listing ids stored before any drop. The same car is scraped again every few minutes, so scrape rows are higher than unique cars. **Leads** are the rows that reached `tav.leads` and can show on the sheet. Dealer, Spanish, blocked-seller, salvage, ineligible, and missing year/make/model ads are removed before scoring. A car still has to clear the lead gate after that, including an ask at or under MMR, so unfiltered listings will always be larger than leads.

Filter counts below are events. One dealer ad scraped ten times adds ten `dealer_listing` rows.

| Day | Unfiltered listings | Scrape rows | Leads | Excellent | Good | Fair | Notes |
|-----|--------------------:|------------:|------:|----------:|-----:|-----:|-------|
| Wed 18 Nov, through late morning | 650 | 1,866 | 23 | 3 | 11 | 9 | Partial day. Arizona, Missouri, and Minnesota are on. |
| Tue 17 Nov | 3,731 | 16,998 | 85 | 16 | 25 | 44 | First full day with the three new states. |
| Mon 16 Nov | 2,732 | 6,212 | 64 | 13 | 20 | 31 | Thin day. Spanish filter started at 09:58. |

## Wednesday 18 November 2026

Partial day, counted late morning. The scrapes were running. 650 unique listings came in before filters, across 1,866 scrape rows. 23 of those became leads.

Of the 23: 17 were still `new`, 1 was claimed, and 5 were flagged `bad_lead`. Region split: Dallas 10, Kansas City 5, Phoenix 4, Minneapolis 3, Oklahoma City 1.

Drops recorded this morning:

| Reason | Events |
|--------|-------:|
| dealer_listing | 996 |
| spanish_listing | 152 |
| blocked_dealer | 49 |
| ineligible_vehicle | 10 |
| salvage_or_rebuilt_title | 1 |
| missing_ymm | 1 |

Runs so far: Dallas 63 runs / 454 items / 9 leads, Kansas City 84 / 658 / 5, Phoenix 74 / 200 / 4, Oklahoma City 47 / 408 / 1, Minneapolis 30 / 71 / 3. Those item counts are the run counter. The unfiltered total above is the distinct listing ids actually stored.

## Tuesday 17 November 2026

3,731 unique listings came in before filters, across 16,998 scrape rows. 85 became leads. All 85 were still `new` when this report was written. 16 excellent, 25 good, 44 fair.

Region split: Dallas 56, Phoenix 13, Kansas City 7, Oklahoma City 6, Minneapolis 3. Arizona, Missouri, and Minnesota were connected during this day, so their totals are a partial first day, not a full market day.

Drops:

| Reason | Events |
|--------|-------:|
| dealer_listing | 8,194 |
| spanish_listing | 1,953 |
| blocked_dealer | 733 |
| ineligible_vehicle | 140 |
| missing_ymm | 28 |
| salvage_or_rebuilt_title | 18 |

799 runs. The run counter recorded 11,853 items, 3,837 processed, 6,890 rejected, and 69 `created_leads`. The lead table has 85 because a lead row and the run counter are not the same increment.

## Monday 16 November 2026

2,732 unique listings came in before filters, across 6,212 scrape rows. 64 became leads: 56 Dallas, 8 Oklahoma City. 60 were still `new` and 4 were later `bad_lead`. 13 excellent, 20 good, 31 fair. Every lead had an ask at or under MMR.

A normal weekday the week before put about 110 leads on the sheet. Monday 9 November had 113 leads and 54 excellent. Tuesday 10 November had 107 leads and 32 excellent. During buyer hours on the 16th, 8:00–17:59, there were 46 leads. The busiest hour was 13:00, with 10. From midnight to 8:00 there were 200 scraped items and 2 leads.

The Spanish filter dropped its first ad at 09:58 and recorded 510 drops by midnight. 503 were wordlist matches that were not kept as English. 7 were confirmed by the model. Sunday 15 November had zero Spanish drops.

Dealer removal was the bulk of the discard pile and was in the normal range for the scrape size: 2,929 `dealer_listing` and 649 `blocked_dealer`. Monday 9 November, which produced more leads, dropped 5,033 dealer ads and 597 blocked sellers. Other Monday drops: 9 ineligible, 3 salvage or rebuilt, 3 missing year/make/model.

430 runs. 78 of them were `batch_truncated`, about 225 items skipped at the end of a batch.

Thursday 12 November and Friday 13 November recorded no source runs. Saturday 14 November then ingested 24,272 items and created 479 leads. That hole is why the weekend looked huge next to Monday.

Workday comparison, 8:00–17:59:

| Day | Leads in buyer hours | Scraped items in buyer hours |
|-----|---------------------:|-----------------------------:|
| Mon 9 Nov | 73 | 5,428 |
| Tue 10 Nov | 79 | 5,570 |
| Mon 16 Nov | 46 | 4,618 |

Final-score bands for leads that landed:

| Day | 90+ | 80–89 | 70–79 | 60–69 | Under 60 |
|-----|----:|------:|------:|------:|---------:|
| Mon 9 Nov | 39 | 22 | 13 | 19 | 20 |
| Tue 10 Nov | 19 | 19 | 27 | 17 | 25 |
| Mon 16 Nov | 6 | 11 | 16 | 23 | 8 |

Hourly leads on Monday 16 November: 00–02 and 04–06 had none. 03 had 1, 07 had 1, then 3, 2, 2, 6, 4, 10, 7, 4, 2, 6 from 08:00 through 17:00, and 16 more from 18:00 through 23:00.

## References

- Buyer notes: `docs/buyer-feedback-2026-11-15.md`
- Grade cut: `src/scoring/lead.ts` (`excellent` at final score 85, `good` at 70, `fair` at 55)
- Runbook: `docs/04-operations/runbook.md`

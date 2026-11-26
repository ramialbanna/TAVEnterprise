# Buyer feedback — 2026-11-15

From Motaz, testing Opportunities. Three changes, in this order. Step 1 is the one to ship now.

His example was one lead: a 2024 Ford F-150 posted by Ronald Antonio Vega Piña. The description said "Titulo limpio" and "Todo perfecto." The asking price was $28,000. A Carfax on the same truck showed a total loss and named the dealer Autos Of Forney LLC.

## 1. Drop Spanish listing descriptions

**Status:** in the worker code, not on the production worker until the next deploy.

A short word list reads the title and description before valuation. "Titulo limpio" plus another Spanish word is enough. "El Paso" and a single word like "precio" are not.

The ad is dropped when the list matches. Claude is only allowed to save it, and only when Claude is sure the ad is English (a line like "troca for sale in Del Rio"). If Claude is down, slow, or unsure, the ad still drops.

The next scrape of a car already on the sheet marks that card as a bad lead so it leaves the queue. A car that has not been scraped again stays until it ages off the 24-hour sheet.

After it is live, look at one day of dropped ads. If they are dealers and title problems, leave the rule. If real private-party trucks are in the drop, narrow the word list.

## 2. Check seller on Facebook

**Doing this instead of a listing count.** **View listing on Facebook** comes first. **Check seller on Facebook** is second and opens the stored profile id. If the scrape has no id, that button is disabled and reads **No seller id**.

The scraper still does not send how many vehicles the seller has listed. The buyer checks that on the profile.

A live listing count from the scraper is parked. The button is the check for now.

## 3. Stop requiring the asking price to be under MMR

**Do this last,** after Spanish ads and multi-car sellers are off the sheet.

Today a car at or under MMR can become a lead. A car over MMR usually grades as a pass and never shows. Near-misses are hidden the same way. The sheet is a list of cars that look cheap against book. The F-150 above was under the Carfax retail number and it was a total loss.

When this is built:

- Show an MMR hit even when the ask is over book.
- Keep a ceiling so a very high ask does not flood the sheet.
- Show asking price and MMR on the card and let the buyer sort by the gap.
- A deep discount should stop raising the score. That is where salvage and bait prices sit, and the score currently gives those the highest marks.

Opening this gate first would add more of the same bad cars, plus dealers asking retail.

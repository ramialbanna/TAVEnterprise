# Next Steps — MMR Lab

**Last updated:** 2026-06-15 (UX improvements queued; Items 1/3/4 archived) · **Focus:** `/mmr-lab` buyer experience

> **Fresh chat prompt:**  
> Pick the next unchecked item below. Spec: [`07-buybox/MMR-LAB-MAXBUY-PAGE.md`](07-buybox/MMR-LAB-MAXBUY-PAGE.md). Completed UX rollout: [`02-product/ux-rollout-shipped.md`](02-product/ux-rollout-shipped.md).

**Legend:** `[x]` done · `[~]` in progress · `[ ]` not done

---

## Context

**TAV-AIP** — internal buyer app for Texas Auto Value. Next.js in `web/`; API is a Cloudflare Worker in `src/` (proxied via `web/app/api/app/*`).

**This doc:** Active work on **MMR Lab** — the combined Cox MMR lookup + MaxBuy evaluation page at `/mmr-lab`.

| Area | Path |
|------|------|
| MMR Lab page | `web/app/(app)/mmr-lab/page.tsx` |
| Client + zones | `web/app/(app)/mmr-lab/_components/*` |
| MaxBuy evaluate UI | `web/app/(app)/mmr-lab/_components/maxbuy-evaluation-section.tsx` |
| Transactions table | `web/app/(app)/mmr-lab/_components/transactions-table.tsx` |
| Search panel | `web/app/(app)/mmr-lab/_components/search-panel.tsx` |
| MMR + MaxBuy spec | `docs/07-buybox/MMR-LAB-MAXBUY-PAGE.md` |
| Cox/Manheim integration | `docs/03-api/manheim-cox.md` |
| MaxBuy scoring | `src/maxbuy/scoring/score.ts` |

### Verify (after each item)

```bash
cd web && npm run lint && npm run typecheck && npm test
cd .. && npm run lint && npm run typecheck && npm test
```

---

## Active work

| # | Item | Priority | Status |
|---|------|----------|--------|
| **1** | Manheim Transactions — fix Cox API to return sold comps | High | [ ] |
| **2** | Year dropdown — pin recent years at top | Medium | [ ] |
| **3** | Per-dropdown loading indicator | Medium | [ ] |
| **4** | Auto-scroll to results on mobile after submit | Medium | [ ] |
| **5** | Sticky SearchPanel header on desktop scroll | Medium | [ ] |
| **6** | Value button — tooltip showing what field is missing | Medium | [ ] |
| **7** | Style approximation notice — closeable banner above result band | Low | [ ] |
| **8** | Mileage ↔ Adjustments odometer sync | Low | [ ] |
| **9** | Keyboard tab flow through disabled dropdowns | Low | [ ] |
| **10** | Cleared-field highlight animation | Low | [ ] |
| **11** | MMR Range — promote to a blue highlight card (match Manheim MMR layout) | Low | [ ] |

---

## 1 — Manheim Transactions (Cox sold comps)

**Goal:** Show the **same wholesale auction sale comps** as the Cox/Manheim MMR tool — sold vehicle rows with date, hammer price, odometer, grade, region, and auction.

### Decision: Manheim/Cox vs MarketCheck

**Use Manheim/Cox. Do not use MarketCheck for this.**

Reason: Manheim Transactions are Manheim's own proprietary sold-auction database. That data does not exist anywhere except through Manheim/Cox APIs. MarketCheck's auction endpoint (`GET /v2/search/car/auction/active`) shows **active listings**, not hammer prices on **sold** vehicles — a completely different dataset. Switching to MarketCheck here would give buyers retail-style active-inventory data instead of the wholesale comp rows the native Manheim MMR tool surfaces. The right path is to fix the Cox API call to return transaction rows.

### Locked decisions

- **DEC-MLB-2** — Zone C2 must match **Manheim MMR tool behavior**: sold wholesale auction transaction rows (date, price, odometer, grade, region, auction, etc.).
- **DEC-MLB-3** — **Do not** backfill this table with MarketCheck data. MarketCheck is for optional enrichment elsewhere, not a replacement for Manheim sold comps.

### Frontend status: fully built — zero code changes needed

The table already replicates the Manheim MMR UI exactly. All 10 columns are wired (`transactions-table.tsx`), the parser (`manheimMarketContextParser.ts`) maps 7 key-name aliases per field to handle Cox response variation, and the Zod schema validates the shape end-to-end. If Cox starts returning transaction rows, they will appear immediately with no further development.

| Manheim column | Parser field | Cox raw aliases tried |
|---|---|---|
| Date | `date` | `date`, `saleDate`, `transactionDate`, `auctionDate` |
| Price | `price` | `price`, `salePrice`, `wholesale`, `amount`, `average` |
| Odo (mi) | `odometer` | `odometer`, `odo`, `mileage` |
| Grade | `grade` | `grade`, `conditionGrade`, `averageGrade` |
| EVBH | `evbh` | `evbh`, `EVBH`, `averageEVBH` |
| Eng/T | `engineTrans` | `engineTrans`, `engineTransmission`, `engine` |
| Ext Color | `exteriorColor` | `exteriorColor`, `color`, `extColor` |
| Type | `type` | `type`, `saleType`, `transactionType` |
| Region | `region` | `region`, `saleRegion` |
| Auction | `auction` | `auction`, `auctionName`, `location` |

**Small cosmetic addition still open:** The native Manheim table footer reads *"Showing N of N — Condition Reports from AutoGrade™ or Manheim Express Grade"*. This one-line addition to `transactions-table.tsx` can be done whenever the data is flowing.

### Why transactions are currently empty

**Smoke (2026-06-12, staging intel worker, VIN `1FT7W2BT4KED81759`, `force_refresh`):**

- Cox returned `historicalAverages` + `forecast` on all 6 trim variants.
- **No** transaction arrays under any key (`transactions`, `auctionTransactions`, `auctionSales`, `sampleTransactions`, `recentTransactions`, `sales`, `samples`).
- **Diagnosis:** API absent — not a parser or frontend bug.
- **`include=transactions` does not exist** — Cox API only documents `historical`, `forecast`, `retail`, `ci` as valid tokens. Adding another flag will not fix this.

**Root cause (in order of likelihood):**

1. **Account/entitlement restriction** *(most likely)* — TAV's Cox API key returns aggregates but has no entitlement for per-sale comp rows. Contact the Cox/Manheim account rep and ask: *"Does our API key have entitlement to per-sale transaction rows on the Valuations API? If not, what does it cost to enable?"*
2. **Separate endpoint** — The native Manheim MMR tool may pull sold comps from a different endpoint (e.g. `/market-report` or a Manheim GraphQL API) rather than the standard `wholesale-valuations/vehicle/mmr` endpoint. Ask the Cox rep which endpoint the native MMR tool uses for the Transactions rows.
3. **VIN activity gap** — Try the smoke script on a VIN that currently shows rows in the native Manheim MMR UI (e.g. a recent auction vehicle). If rows appear for high-activity VINs but not others, it's a data availability issue, not an entitlement block.

**Re-run smoke:**

```bash
wrangler dev --remote --env staging --config workers/tav-intelligence-worker/wrangler.toml --port 8789
node scripts/mmr-transactions-smoke.mjs http://127.0.0.1:8789
```

### MarketCheck — what it offers (for reference only)

| MarketCheck capability | Endpoint (approx.) | Relevant to MMR Lab? |
|------------------------|-------------------|----------------------|
| **VIN decode / specs** | `GET /v2/decode/car/neovin/{vin}/specs` | Future — VIN autofill fallback (not on current free-tier license) |
| **Auction inventory search** | `GET /v2/search/car/auction/active` | **No** — active listings, not sold comps |
| **Auction listing detail** | `GET /v2/listing/car/auction/{id}` | **No** — active listing detail only |
| **Recent inventory (90d)** | `GET /v2/search/car/recents` | **No** — price/trend history, not Manheim hammer prices |
| **Retail price + comparables** | `GET /v2/predict/car/us/marketcheck_price/comparables` | **No** — retail dealer comps, different market |
| **VIN listing history** | VIN history tools | **No** — past retail listing prices, not auction prices |

TAV is on a **team MarketCheck account, free tier** (2026-06-12). Licensed partner APIs on this key:

| API | Cost/call | Future MMR Lab use |
|-----|-----------|--------------------|
| AutoRecalls Recall Check | $0.07 | Hard-gate buyer warning (recall stop-sale) |
| VINData Title Check | $0.49 | Title brand / salvage context |
| CarsXE Plate to VIN | $0.70 | Plate → VIN intake |

**Not on current license:** NeoVIN decode, Auction Search, retail price prediction.

### Note — MarketCheck as a temporary stop-gap (2026-06-15)

> **Do not implement yet.** Documenting for future decision only.
>
> If Cox entitlement approval takes too long, MarketCheck **Auction Inventory Search** (`GET /v2/search/car/auction/active`) could serve as a **temporary placeholder** with a clearly labelled UI (e.g. "Active Auction Listings (temporary — not Manheim sold comps)"). Key caveats before pursuing:
> - Not on current free-tier license — would need plan upgrade or endpoint acceptance in MarketCheck dashboard.
> - Shows active listings (vehicles currently for sale), **not** hammer prices of sold vehicles — a fundamentally different dataset.
> - Must be labelled honestly in the UI; do not present as Manheim transaction data.
> - Remove the placeholder the moment real Cox transaction rows are flowing.
>
> Only consider if Cox approval is blocked for 30+ days and the team needs something visible for demos or operations.

### Exit criteria

- [x] Section renamed to Manheim Transactions
- [x] Cox transaction gap documented (API empty vs parser bug) — see [`03-api/manheim-cox.md`](03-api/manheim-cox.md) §5
- [ ] Cox/Manheim account rep confirms entitlement status for per-sale transaction rows
- [ ] If separate endpoint: new intel-worker route wired and smoke-tested
- [ ] Manheim Transactions table shows rows for a VIN that has comps in the native Manheim MMR UI
- [ ] Add "Showing N of N — Condition Reports from AutoGrade™ or Manheim Express Grade" footer to `transactions-table.tsx`

---

## 2 — Year dropdown: pin recent years at top

**Goal:** Buyers almost always look up 2022–2026 vehicles. The year dropdown currently shows a flat list from 2003 onward — requires scrolling past many years to reach common ones.

**Approach:** Split the year options into two groups: the most recent N years (e.g. current year − 4 through current year) pinned at the top, then a `<optgroup>` or `<hr>`-style divider, then all remaining years below. No functional change — just reorders the `<option>` elements in `search-panel.tsx` using the `catalog.years` array.

**Exit criteria:**
- [ ] Most recent 5 years appear at the top of the Year dropdown before older years
- [ ] Year list is still complete (all years remain selectable)
- [ ] No change to catalog API calls or selection behavior

---

## 3 — Per-dropdown loading indicator

**Goal:** When catalog data is loading (e.g. after a year change triggers a makes refetch), the Make dropdown is silently disabled. Buyers have no feedback that something is happening.

**Approach:** In `search-panel.tsx`, render a `"Loading…"` placeholder `<option>` as the first option (after the blank prompt) when `catalog.loading === "makes"` / `"models"` / `"styles"` for that field. Alternatively, show a small spinner icon inside the select wrapper using a `relative`/`absolute` overlay.

**Exit criteria:**
- [ ] Make shows loading feedback when `catalog.loading === "makes"`
- [ ] Model shows loading feedback when `catalog.loading === "models"`
- [ ] Style shows loading feedback when `catalog.loading === "styles"`
- [ ] No additional API calls introduced

---

## 4 — Auto-scroll to results on mobile after submit

**Goal:** After clicking Search (VIN) or Value (YMM) on a phone, the result band is below the fold. Buyers don't notice results have loaded.

**Approach:** In `mmr-lab-client.tsx`, after `setView({ kind: "ok", ... })` fires, call `document.getElementById("mmr-result-band")?.scrollIntoView({ behavior: "smooth" })`. Add `id="mmr-result-band"` to the `<ResultBand>` wrapper. Only scroll on mobile (use a `window.innerWidth < 768` guard or a media-query-aware hook).

**Exit criteria:**
- [ ] After submit on mobile viewport, page scrolls smoothly to the result band
- [ ] Desktop scroll behavior unchanged (no auto-scroll on desktop)

---

## 5 — Sticky SearchPanel header on desktop scroll

**Goal:** On desktop, buyers scroll down through adjustments and transactions but lose sight of the VIN / YMM inputs. The native Manheim MMR tool keeps its lookup form visible.

**Approach:** Wrap `<SearchPanel>` in a `sticky top-0 z-10` container (Tailwind). Add a collapsed/expanded toggle so the panel can be minimized once a lookup is active to free vertical space.

**Exit criteria:**
- [ ] SearchPanel sticks to the top of the viewport when scrolling on desktop (≥ 1024px)
- [ ] Panel can be collapsed/expanded while sticky to free vertical space
- [ ] Mobile behavior unchanged (no sticky on small viewports)

---

## 6 — Value button: tooltip for missing fields

**Goal:** The Value button is disabled whenever Year/Make/Model/Style/Mileage is incomplete, but clicking it does nothing and shows no explanation. Buyers don't know which field to fill.

**Approach:** In `search-panel.tsx`, compute the first missing required field from `selection` and show a Tooltip (from `@/components/ui/tooltip`) on the disabled Button listing what is missing (e.g. "Select a Style to enable valuation"). Use the `title` attribute as a fallback for non-JS contexts.

**Exit criteria:**
- [ ] Hovering or focusing the disabled Value button shows which field is missing
- [ ] Tooltip text is accurate for every combination of missing fields
- [ ] When all fields are filled the tooltip is removed (button is enabled)

---

## 7 — Style approximation notice: closeable banner

**Goal:** When Cox trim doesn't exactly match a catalog style (DEC-MLB-6), a small amber text line appears below the dropdowns. This is easy to miss, especially after the result band loads.

**Approach:** Replace the `<p role="status">` in `search-panel.tsx` with a dismissible banner component (`Alert` from `@/components/ui/alert`) positioned above the result band (below the SearchPanel). Include an × close button that calls `setStyleNotice(null)` via a lifted callback.

**Exit criteria:**
- [ ] Approximate style match shows a dismissible amber Alert above the result band
- [ ] User can close the notice; it does not reappear until the next VIN lookup
- [ ] Exact match (or no VIN lookup) shows no banner

---

## 8 — Mileage ↔ Adjustments odometer sync

**Goal:** After a VIN lookup, the mileage field in the SearchPanel and the odometer field in MMR Adjustments are seeded from the same value but thereafter diverge independently. Editing one should update the other (or at minimum they should start from the same source of truth).

**Approach:** Review whether `seedAdjustments` in `mmr-lab-client.tsx` and `selection.mileage` should stay in sync. If the buyer edits the top mileage field, the adjustments odometer should update (and vice versa). Consider merging them into a single shared state value or adding a two-way sync via `onSelectionChange` / `handleAdjustmentsChange`.

**Exit criteria:**
- [ ] Editing the SearchPanel mileage updates the adjustments odometer
- [ ] Editing the adjustments odometer updates the SearchPanel mileage
- [ ] A single source of truth for mileage — no diverged state that silently uses wrong value in either MMR recompute or MaxBuy evaluate

---

## 9 — Keyboard tab flow through disabled dropdowns

**Goal:** Tabbing through the form skips disabled dropdowns entirely. Buyers using keyboard-only navigation cannot reach the Year dropdown when the catalog is not connected, or Make when no year is selected.

**Approach:** Disabled `<select>` elements are excluded from the tab order by default. Add `tabIndex={0}` to disabled selects and intercept `onKeyDown` to show a tooltip ("Select a Year first") rather than just blocking input.

**Exit criteria:**
- [ ] Tab key moves focus through all four YMM dropdowns regardless of disabled state
- [ ] Pressing Space or Enter on a disabled dropdown shows a tooltip explaining the required prerequisite
- [ ] No regression on enabled dropdown behavior

---

## 10 — Cleared-field highlight animation

**Goal:** When a year change causes a make/model/style to be invalidated and cleared by the catalog re-validation logic (DEC-MLB-7), the field blanks out silently. Buyers don't understand why it changed.

**Approach:** In `search-panel.tsx`, track which fields were just cleared (via a short-lived state flag or CSS class toggled in `onSelectionChange`). Apply a brief flash animation (e.g. `animate-pulse` or a red border fade) to the cleared field for ~1.5 s, then revert to normal styling.

**Exit criteria:**
- [ ] When a field is cleared due to catalog re-validation, it briefly flashes/highlights
- [ ] The animation does not fire on initial page load or manual user clears
- [ ] Animation respects `prefers-reduced-motion` (no animation if user has reduced motion set)

---

## 11 — MMR Range: promote to blue highlight card

**Goal:** The MMR Range (`$25,200 – $29,700` in the Manheim screenshots) is displayed in a prominent blue card in the native tool. In the current ResultBand it appears in smaller secondary text and is easy to miss.

**Approach:** In `result-band.tsx` (or the relevant result display component), give the MMR Range its own card with a blue background (`bg-primary text-primary-foreground`) at the same visual weight as the Base MMR and Adjusted MMR values. Match the Manheim layout: Range on the left or right of the adjusted value as a peer card, not sub-text.

**Exit criteria:**
- [ ] MMR Range displayed in a visually prominent blue card matching Manheim MMR tool layout
- [ ] Range remains visible in both loading and error states (shows `--` placeholders)
- [ ] No regression on existing ResultBand tests

---

## Completed (archived)

| Track | Doc |
|-------|-----|
| Opportunities UX rollout (Phases 0–7, Classic retired) | [`02-product/ux-rollout-shipped.md`](02-product/ux-rollout-shipped.md) |
| MMR Lab Phases 1–4 (UI, live MaxBuy, adjustments, Cox historical) | [`07-buybox/MMR-LAB-MAXBUY-PAGE.md`](07-buybox/MMR-LAB-MAXBUY-PAGE.md) |
| MaxBuy P0–P9 | [`07-buybox/STATUS.md`](07-buybox/STATUS.md) |
| **MMR Lab Item 1** — VIN autofill + YMM switch (DEC-MLB-1, DEC-MLB-6) | This doc §1 (2026-06-12) |
| **MMR Lab Item 3** — MaxBuy plain-language explanation (DEC-MLB-4, DEC-MLB-5) | This doc §3 (2026-06-12) |
| **MMR Lab Item 4** — YMM dependent dropdown cascade (DEC-MLB-7 through DEC-MLB-10) | This doc §4 (2026-06-15); year-change now preserves make/model/style and re-validates against new catalog |

# Next Steps — MMR Lab

**Last updated:** 2026-06-15 (Items 12–15 added: accuracy bugs + MaxBuy VIN fix) · **Focus:** `/mmr-lab` buyer experience

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
| **12** | VIN MMR — remove mileage inference, call Cox with VIN only | High | [x] |
| **13** | MaxBuy — resolve VIN via YMM fallback when VIN not in TAV DB | High | [ ] |
| **14** | Mileage field cascade bug — can't clear the Miles input | High | [ ] |
| **15** | Retail value — enable Cox retail data (env var + entitlement check) | Medium | [ ] |
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

## 12 — VIN MMR: remove mileage inference, call Cox with VIN only

**Goal:** When a buyer searches by VIN, the MMR value shown must match Manheim's native tool. Currently it doesn't because the intel worker injects a fabricated mileage into every VIN lookup instead of letting Cox use its own vehicle data.

### Root cause

`getMmrMileageData` in `src/scoring/mmrMileage.ts` is called unconditionally for every VIN path lookup in `workers/tav-intelligence-worker/src/services/mmrLookup.ts`. When no mileage is provided (as is always the case for a plain VIN search in MMR Lab), it infers mileage from the model year:

> `(currentYear − modelYear) × 15,000 + currentMonth × 1,250`, rounded to nearest 1,000

For a 2026 model year vehicle in June 2026: `6 × 1,250 = 7,500 → 8,000`. That 8,000 is forwarded to Cox as `?odometer=8000`. Manheim's native tool queries Cox using the vehicle's actual auction/title odometer — producing a different number. The 8,000 also gets seeded into the frontend's mileage field via `hydrateVinAutofill`, which is where the ghost value comes from.

### What to change

| File | Change |
|---|---|
| `workers/tav-intelligence-worker/src/services/mmrLookup.ts` | On the VIN path: skip `getMmrMileageData` when `args.input.mileage` is absent. Pass `mileage: undefined` to `lookupByVin`. |
| `workers/tav-intelligence-worker/src/clients/manheimHttp.ts` | Make `mileage` optional on `lookupByVin`. Only append `?odometer=` when mileage is explicitly provided. |
| `workers/tav-intelligence-worker/src/clients/manheim.ts` | Make `mileage` optional on the `ManheimClient.lookupByVin` interface. |
| `workers/tav-intelligence-worker/src/cache/mmrCacheKey.ts` | `deriveVinCacheKey` currently includes mileage in the key. When mileage is absent, omit it from the key (e.g. `vin:{vin}:no-odometer`). |
| `workers/tav-intelligence-worker/src/services/mmrLookup.ts` | `mileage_used` in the envelope should be `null` (not 0) when no mileage was supplied. |
| `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` | `seedAdjustments(mileageUsed)` — when `mileageUsed` is `null`, seed `odometer: ""` (not "0"). `hydrateVinAutofill` receives `mileage: ""` — already the correct empty string. |

**Do not remove `getMmrMileageData`** — it is still needed for the YMM path (you must supply a mileage to Cox's YMMT endpoint) and for MaxBuy's mileage estimation. Only remove it from the VIN path when the caller did not supply an explicit mileage.

### Exit criteria

- [x] VIN lookup sends no `?odometer` query param to Cox when buyer has not entered mileage
- [ ] MMR value returned matches (or is within rounding of) Manheim's native tool for the same VIN
- [x] `mileage_used` in the response envelope is `null` for a no-mileage VIN lookup
- [x] Adjustment odometer field in the result band starts empty (not "8000") after a VIN lookup
- [x] Mileage field in the search panel starts empty after a VIN lookup
- [x] YMM path is unchanged — mileage is still inferred/required for YMMT calls

---

## 13 — MaxBuy: resolve VIN via YMM fallback when VIN not in TAV DB

**Goal:** MaxBuy currently fails with "Can't resolve VIN" for ~99% of VINs searched in MMR Lab because those vehicles haven't been through TAV's system before. MaxBuy should fall back to the year/make/model returned by Cox in the same MMR lookup and score the deal on that basis.

### Root cause

`runEvaluate` in `src/maxbuy/evaluateRun.ts` calls `resolveVehicleContext(db, { vin, region: "" })`. This searches `normalized_listings` and `purchase_outcomes` by VIN. Any VIN not already in TAV's DB returns `null` → `vehicle_context_missing` error. The VIN-only fallback (`if (vinModelYear != null && input.region)`) also fails because `region: ""` is falsy.

Simultaneously, `buildMmrLabMaxbuyRequest` in `_components/build-mmr-lab-maxbuy-request.ts` deliberately sends `{ vin, year: "", make: "", model: "" }` for VIN sessions — so the server has no YMM to fall back to even if it tried.

Both MMR and MaxBuy are fired in parallel (`runParallelLookup`), so year/make/model from the Cox MMR response aren't available yet when the MaxBuy request is built.

### What to change — two-part fix

**Part 1 — Server (`src/maxbuy/evaluateRun.ts`):**

In the VIN path, after `resolveVehicleContext` returns `null`, check whether `request.year`, `request.make`, and `request.model` are present. If they are, construct `vehicleCtx` from them (same as the YMM path) rather than returning `vehicle_context_missing`. The VIN is still stored in the recommendation record. Add `vinAbsent = false` so VIN is retained but context comes from the provided YMM.

```
// pseudocode — exact shape to match existing YMM path in evaluateRun.ts
if (!vehicleCtx && request.year && request.make && request.model) {
  vehicleCtx = {
    year:   request.year,
    make:   request.make.toLowerCase(),
    model:  request.model.toLowerCase(),
    trim:   (request.trim ?? "base").toLowerCase(),
    region: (request.region ?? "unknown").toLowerCase(),
    cotCity: null, cotState: null,
  };
}
```

**Part 2 — Client (`_components/mmr-lab-client.tsx` + `build-mmr-lab-maxbuy-request.ts`):**

For the VIN path, make MaxBuy launch **after** MMR resolves (sequential, not parallel). Once the MMR result returns with Cox year/make/model, build the MaxBuy request including those fields alongside the VIN. The MaxBuy loading state is shown immediately (spinner starts when the VIN search starts); it just resolves later.

Update `MmrLabLookupSession` VIN variant to carry optional `year`, `make`, `model`, `trim` populated after the MMR response. Update `buildMmrLabMaxbuyRequest` to include them when present.

| File | Change |
|---|---|
| `src/maxbuy/evaluateRun.ts` | VIN path: if context missing but request has year/make/model, construct vehicleCtx from them |
| `web/app/(app)/mmr-lab/_components/build-mmr-lab-maxbuy-request.ts` | Pass `year`, `make`, `model`, `trim` from session when available for VIN path |
| `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` | VIN path in `runParallelLookup`: fire MaxBuy after MMR resolves (sequential for VIN; YMM path stays parallel) |
| `web/app/(app)/mmr-lab/_components/build-mmr-lab-maxbuy-request.ts` | `MmrLabLookupSession` VIN variant: add optional `year`, `make`, `model`, `trim` fields |

### Exit criteria

- [ ] MaxBuy returns a verdict for a VIN that has never been in TAV's DB
- [ ] The recommendation record still captures the VIN (not null)
- [ ] MaxBuy still works correctly for VINs that ARE in TAV's DB (no regression)
- [ ] YMM-path MaxBuy is unchanged
- [ ] If MMR itself fails (no Cox result), MaxBuy shows "evaluation could not run" — not a spurious VIN error

---

## 14 — Mileage field cascade bug: can't clear the Miles input

**Goal:** The "Miles" input in the search panel becomes permanently stuck at whatever value was last seeded. After a VIN lookup the field shows 8,000 (the inferred mileage) and the user cannot delete it — deleting the last digit always restores the previous value.

### Root cause

In `web/app/(app)/mmr-lab/_components/apply-ymm-cascade.ts`:

```typescript
const mileage = next.mileage !== "" ? next.mileage : prev.mileage;
```

This fires on every call to `onSelectionChange`, including direct mileage edits. The moment the field becomes empty string (`""`), the cascade substitutes the previous non-empty value. Deleting the last character is impossible — the field reverts on every keystroke.

The original intent was to avoid wiping mileage when the user changes the Year dropdown. That's a reasonable goal, but the implementation is wrong: mileage is independent of the Y/M/M/S cascade and should not be governed by it at all.

### What to change

**`web/app/(app)/mmr-lab/_components/apply-ymm-cascade.ts`** — remove the mileage-preservation line entirely:

```typescript
// Before
export function applyYmmCascadeChange(prev: MmrSelection, next: MmrSelection): MmrSelection {
  const mileage = next.mileage !== "" ? next.mileage : prev.mileage;
  if (next.year !== prev.year) {
    return { ...next, mileage };
  }
  ...
}

// After
export function applyYmmCascadeChange(prev: MmrSelection, next: MmrSelection): MmrSelection {
  if (next.year !== prev.year) {
    return { ...next };
  }
  ...
}
```

Mileage is already carried through in `next` (the caller always spreads the full selection). The cascade only needs to clear downstream Y/M/M/S fields — it must not touch mileage.

**Note:** Once Item 12 is done, the VIN lookup will no longer seed 8,000 into `selection.mileage` (it will seed `""`), so this fix becomes cleaner — but fix Item 14 regardless because it affects the YMM path too.

### Exit criteria

- [ ] User can clear the Miles field to empty at any time
- [ ] Changing the Year dropdown does not wipe the mileage the user already typed
- [ ] Changing the Year dropdown does not restore a stale mileage if the field was manually cleared
- [ ] `applyYmmCascadeChange` unit tests updated to cover the empty-mileage case

---

## 15 — Retail value: enable Cox retail data

**Goal:** The result band has wired-up `retailValue`, `retailRangeLow`, `retailRangeHigh` columns that always show `--` because Cox is never asked for retail data.

### Root cause

`buildCoxIncludeTokens` in `workers/tav-intelligence-worker/src/clients/manheimHttp.ts` only appends `"retail"` to the Cox `include=` query param when `env.MANHEIM_INCLUDE_RETAIL === "true"`. That env var has never been set on the intel worker, so the retail block is never requested.

### What to check first

Before setting the env var, confirm with Cox/Manheim account rep whether the TAV API key is entitled for the `retail` include token. The `MANHEIM_INCLUDE_RETAIL` flag exists precisely because retail is a separate entitlement — enabling it on an un-entitled key will produce 4xx errors or empty retail blocks on every lookup.

### What to change

| Step | Action |
|---|---|
| 1 | Confirm Cox account has retail entitlement |
| 2 | Set `MANHEIM_INCLUDE_RETAIL=true` in the intel worker's Cloudflare environment (wrangler secret or `[vars]` in `wrangler.toml`) |
| 3 | Smoke-test a known VIN — confirm `retailValue` appears in the response envelope |
| 4 | Verify `result-band.tsx` renders the retail card correctly once the value is non-null |

If Cox confirms the account is **not** entitled for retail: hide the retail card in the result band UI rather than showing permanent `--` dashes.

### Exit criteria

- [ ] Either: retail value and range are populated in the result band for a live VIN lookup
- [ ] Or: retail card is hidden in the UI with a doc note confirming the account lacks entitlement
- [ ] No new 4xx errors appear in intel worker logs after enabling

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
| **MMR Lab Item 12** — VIN-only Cox lookup (no inferred odometer) | This doc §12 (2026-06-15) |

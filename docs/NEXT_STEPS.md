# Next Steps — MMR Lab

**Last updated:** 2026-06-17 (Item 16 added — MMR adjustment accuracy + Cloudflare deployment) · **Focus:** `/mmr-lab` buyer experience

> **Fresh chat prompt:**  
> Pick the next unchecked item below. Spec: [`07-buybox/MMR-LAB-MAXBUY-PAGE.md`](07-buybox/MMR-LAB-MAXBUY-PAGE.md). Completed work: [`completed-tasks.md`](completed-tasks.md).

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
| **16** | MMR adjustment accuracy — deploy fixes + smoke-test grade/build deltas | High | [~] |
| **1** | Auction Transactions — wire MarketCheck API | High | [~] |
| **15** | Retail value — enable Cox retail data (env var + entitlement check) | Medium | [x] |
| **2** | Year dropdown — pin recent years at top | Medium | [x] |
| **3** | Per-dropdown loading indicator | Medium | [x] |
| **4** | Auto-scroll to results on mobile after submit | Medium | [x] |
| **5** | Sticky SearchPanel header on desktop scroll | Medium | [x] |
| **6** | Value button — tooltip showing what field is missing | Medium | [x] |
| **7** | Style approximation notice — closeable banner above result band | Low | [x] |
| **8** | Mileage ↔ Adjustments odometer sync | Low | [x] |
| **9** | Keyboard tab flow through disabled dropdowns | Low | [x] |
| **10** | Cleared-field highlight animation | Low | [x] |

---

## 16 — MMR Adjustment Accuracy

**Goal:** Grade, build-options, and odometer deltas in the MMR Adjustments panel must match the values shown in Manheim's native MMR tool for the same inputs.

### Background — what was found (2026-06-17)

Side-by-side comparison of our MMR Lab vs the native Manheim MMR tool on VIN `1GYTEEKL1SU107843` (2025 Cadillac Escalade IQ) revealed three linked bugs:

#### Bug 1 — Build delta inflated when grade is also active

**Root cause:** `buildOptionsFromBooleanTrue()` in `src/valuation/manheimResponseParser.ts` assigned the **entire** `adjustedPricing.wholesale.average − wholesale.average` delta to build options whenever Cox sends `adjustedBy.buildOptions: true` (boolean, not dollars). It only guarded against odometer mismatch — it did **not** bail when grade, color, or region were also present in `adjustedBy`.

When grade=5.0 is active:
- Cox returns total delta = grade ($420) + build ($890) = combined in `adjustedPricing.wholesale.average`
- Our parser assigned $1,310 (or similar combined total) as build-only
- Manheim correctly showed build = $890 and grade = $420 separately

**Fix applied (commit `9d7783e`):** `buildOptionsFromBooleanTrue` now returns `{ included: true, adjustment: null }` when `adjustedByHasGrade`, `adjustedByHasColor`, or `adjustedByHasRegion` is true in `adjustedBy`. When adjustment is null, the breakdown function's residual logic can properly attribute the remaining delta to grade/color/region via single-field residual attribution.

#### Bug 2 — Grade delta never shown in the adjustments panel

**Root cause:** Two compounding issues:

1. Cox returns `adjustedBy.Grade: "40"` (a string grade code on a 10-point scale, e.g. "40" = grade 4.0, "50" = grade 5.0). `readAdjustedByFieldDollars()` only reads **numeric** values — strings are ignored — so `gradeAdjustment` from the parser always comes back `null`.

2. The fallback is **marginal tracking**: when the user changes grade from empty → 5.0, a recompute fires, and `applyAttributeMarginalDelta` captures the delta between the prior and new `adjustedMmr`. But `pendingMarginalChangesRef.current` was **overwritten** (not accumulated) on each `handleAdjustmentsChange` call. If the user entered an odometer value after selecting grade (both within the same 400ms debounce window), the odometer change would overwrite `pendingMarginalChangesRef = []`, losing the grade change, so the marginal was never stored.

**Fix applied (commit `9d7783e`):** `pendingMarginalChangesRef.current` is now accumulated with `Array.from(new Set([...existing, ...newChanges]))` instead of overwritten. Grade/color/region changes are preserved even when odometer or other fields change before the debounce fires.

#### Bug 3 — Odometer field fired Cox API on every keystroke

**Root cause:** The odometer `<input>` called parent `onChange` on every keystroke. The parent debounced at 400ms, but slow typing (any pause >400ms between digits) fired one Cox API call per intermediate value (`4`, `40`, `400`, `4000`, `40000`). Each call set a new `adjustmentBaseline`, and out-of-order responses could corrupt the displayed build delta and grade marginals.

The Express Grade input had the same problem.

**Fix applied (commit `9d7783e`):** Both text inputs now hold local React state and only call the parent `onChange` (triggering the recompute) on `onBlur`. A `useEffect` syncs the local value back down when the parent resets it (e.g. Clear button).

### What the numbers look like now vs target

With odometer=20,000 entered, no grade selected (our app) vs grade=5.0 selected (Manheim):

| Field | Our app (no grade) | Manheim (grade=5.0) | Expected when grade=5.0 added in our app |
|---|---|---|---|
| Adjusted MMR | $98,200 | $98,600 | $98,600 |
| Odometer delta | −$3,800 | −$4,050 | ~−$4,050 |
| Grade delta | — | +$400 | ~+$400 (via marginal) |
| Build delta | +$1,000 | +$890 | ~+$890 (parser fix) |

The $400 gap in adjusted MMR and the $110 build difference are both expected when grade is not applied — they disappear once grade=5.0 is selected in our app and the recompute runs. The numbers are **different inputs producing different outputs**, not a calculation error once the fixes are deployed.

### What still needs to happen

| Step | Action | Owner |
|---|---|---|
| **Deploy app worker** | Deploy `src/` (Cloudflare Worker) to production — contains the `buildOptionsFromBooleanTrue` parser fix | Engineering |
| **Deploy web app** | Deploy `web/` (Next.js) to production — contains the blur-only inputs and marginal accumulation fix | Engineering |
| **Smoke test** | On VIN `1GYTEEKL1SU107843`: enter odometer=12,181 (avg), select grade=5.0, confirm build delta shows ~$890 and grade delta shows ~$420 | QA |
| **Smoke test** | Confirm build+grade+odometer all show when all three are active simultaneously | QA |
| **Avg LV Battery Score** | `result-band.tsx` has `<Stat label="Avg EV Battery Score" />` hardcoded with no value. Parse `averageEvBatteryScore` (or equivalent key) from Cox payload in `manheimResponseParser.ts`, forward through `routes.ts`, and pass as a prop to `ResultBand`. Manheim shows 100% for this VIN. | Engineering |

### Files changed in `9d7783e`

| File | Change |
|---|---|
| `src/valuation/manheimResponseParser.ts` | `buildOptionsFromBooleanTrue` bails when grade/color/region present in `adjustedBy` |
| `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` | Accumulate `pendingMarginalChangesRef` instead of overwriting |
| `web/app/(app)/mmr-lab/_components/result-band.tsx` | Odometer + Express Grade inputs fire recompute on blur only; local state for display |

### Exit criteria

- [ ] App worker and web app deployed to Cloudflare production
- [ ] Selecting grade=5.0 on VIN `1GYTEEKL1SU107843` shows a grade delta ~+$420 next to the grade dropdown
- [ ] Build delta shows ~+$890 (not $1,000) when grade=5.0 is active
- [ ] Odometer input does not fire multiple Cox requests while typing
- [ ] Avg LV Battery Score shows 100% for the Escalade IQ (or any EV with battery data)
- [ ] No regression on build-only (no grade) scenario — build delta still shows when grade is not selected

---

## 1 — Auction Transactions (MarketCheck)

**Goal:** Populate Zone C2 with auction comp rows for the lookup vehicle using **MarketCheck API** — date, price, odometer, grade, region, auction, etc.

### Decision: MarketCheck (locked 2026-06-16)

**Use MarketCheck. Do not pursue Cox per-sale transaction rows for this table.**

Reason: Cox Valuations API smoke (2026-06-12) returned `historicalAverages` + `forecast` but **no** per-sale transaction arrays, and `include=transactions` is not a valid Cox token. Cox entitlement for Manheim sold-comp rows is uncertain and slow. MarketCheck **Auction Inventory Search** (`GET /v2/search/car/auction/active`) is the chosen data source for Zone C2.

**UI honesty requirement:** MarketCheck returns **active auction listings**, not Manheim hammer prices on sold vehicles. The table section title, empty state, and footer must say so — do not label rows as Manheim sold comps.

### Locked decisions (updated)

- **DEC-MLB-2** *(superseded 2026-06-16)* — was: match native Manheim MMR sold rows from Cox. **Now:** show MarketCheck-sourced auction listing comps in Zone C2, clearly labeled.
- **DEC-MLB-3** *(superseded 2026-06-16)* — was: do not use MarketCheck for this table. **Now:** MarketCheck is the data source for Zone C2.

### What to build

| Layer | Work |
|---|---|
| **Backend** | Intel-worker handler `GET /mmr/marketcheck-auction` calling `GET /v2/search/car/auction/active`, keyed by VIN or Y/M/M. KV cache TTL 15 min. |
| **App route** | `GET /app/mmr/auction-listings` in `src/app/routes.ts` proxying to intel worker |
| **Parser** | `src/clients/marketcheck.ts` maps MarketCheck listing fields → `MmrTransaction` shape |
| **Frontend** | New `getMarketCheckAuctions()` client fn; `mmr-lab-client.tsx` calls it after MMR resolves; section title + footer updated |

Primary endpoint: `GET /v2/search/car/auction/active`. Base URL: `https://mc-api.marketcheck.com`. Auth: `?api_key=` query param.

### MarketCheck field → MmrTransaction mapping

| MmrTransaction field | MarketCheck source field |
|---|---|
| `date` | `last_seen_at` (ISO → date portion) |
| `price` | `price` |
| `odometer` | `miles` |
| `grade` | `(none — null)` |
| `evbh` | `(none — null)` |
| `engineTrans` | `engine` + `" / " + transmission` |
| `exteriorColor` | `exterior_color` |
| `type` | `body_type` |
| `region` | `city + ", " + state` |
| `auction` | `dealer_name` |

### Backend files

| File | Change |
|---|---|
| `workers/tav-intelligence-worker/src/types/env.ts` | Add `MARKETCHECK_API_KEY: string` |
| `workers/tav-intelligence-worker/wrangler.toml` | Add secret docs for `MARKETCHECK_API_KEY` |
| `workers/tav-intelligence-worker/src/clients/marketcheck.ts` | New: HTTP client + parser |
| `workers/tav-intelligence-worker/src/handlers/mmrMarketcheck.ts` | New: handler with KV cache |
| `workers/tav-intelligence-worker/src/routes/index.ts` | Register `GET /mmr/marketcheck-auction` |
| `src/app/routes.ts` | Add `GET /app/mmr/auction-listings` proxying to intel worker |

### Frontend files

| File | Change |
|---|---|
| `web/lib/app-api/schemas.ts` | Add `AuctionListingsResponseSchema` |
| `web/lib/app-api/parse.ts` | Add `parseAuctionListings` |
| `web/lib/app-api/client.ts` | Add `getMarketCheckAuctions(params)` |
| `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` | Fetch auction listings after MMR resolves; store in `auctionListings` state |
| `web/app/(app)/mmr-lab/_components/transactions-table.tsx` | Update title/empty/idle copy to "MarketCheck auction listings" |
| `web/app/(app)/mmr-lab/_components/data-sections.tsx` | Accept + pass `auctionListings` prop |

### Exit criteria

- [x] Cox transaction gap documented (API empty vs parser bug) — see [`03-api/manheim-cox.md`](03-api/manheim-cox.md) §5
- [x] Data-source decision locked: MarketCheck for Zone C2 (2026-06-16)
- [x] Backend: intel-worker handler + MarketCheck client built
- [x] Backend: app route `GET /app/mmr/auction-listings` proxying to intel worker
- [ ] Auction Search enabled on TAV MarketCheck account (external — account action needed)
- [ ] Intel-worker MarketCheck route smoke-tested against live API key
- [ ] MarketCheck parser maps listing fields to transaction table columns
- [ ] Transactions table shows rows for a VIN/YMM lookup
- [ ] UI labels source as MarketCheck active auction listings (not Manheim sold comps)
- [ ] Add "Showing N of N" footer to `transactions-table.tsx`

### Background — why Cox was abandoned for Zone C2

**Smoke (2026-06-12, staging intel worker, VIN `1FT7W2BT4KED81759`, `force_refresh`):**

- Cox returned `historicalAverages` + `forecast` on all 6 trim variants.
- **No** transaction arrays under any key (`transactions`, `auctionTransactions`, `auctionSales`, `sampleTransactions`, `recentTransactions`, `sales`, `samples`).
- **Diagnosis:** API absent — not a parser or frontend bug.
- Cox only documents `historical`, `forecast`, `retail`, `ci` as valid `include=` tokens.

Historical Cox investigation: [`03-api/manheim-cox.md`](03-api/manheim-cox.md) §5.

### MarketCheck — licensed capabilities (2026-06-12)

| MarketCheck capability | Endpoint (approx.) | Zone C2 use |
|------------------------|-------------------|-------------|
| **Auction inventory search** | `GET /v2/search/car/auction/active` | **Yes — primary source** |
| **Auction listing detail** | `GET /v2/listing/car/auction/{id}` | Optional row enrichment |
| **VIN decode / specs** | `GET /v2/decode/car/neovin/{vin}/specs` | Future — VIN autofill fallback |
| **Recent inventory (90d)** | `GET /v2/search/car/recents` | No — different dataset |
| **Retail price + comparables** | `GET /v2/predict/car/us/marketcheck_price/comparables` | No — retail dealer comps |

TAV is on a **team MarketCheck account, free tier** (2026-06-12). Licensed partner APIs on this key:

| API | Cost/call | MMR Lab use |
|-----|-----------|-------------|
| AutoRecalls Recall Check | $0.07 | Hard-gate buyer warning (recall stop-sale) |
| VINData Title Check | $0.49 | Title brand / salvage context |
| CarsXE Plate to VIN | $0.70 | Plate → VIN intake |

**Must enable for Item 1:** Auction Search (not on current free-tier license).

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

**Goal:** The Value button is disabled whenever Year/Make/Model/Style is incomplete, but clicking it does nothing and shows no explanation. Buyers don't know which field to fill.

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

**Goal:** Odometer for MMR recompute and MaxBuy lives in MMR Adjustments only (Miles was removed from the search panel). Ensure a single source of truth — edits in adjustments odometer must flow correctly to MMR recompute and MaxBuy evaluate without diverged state.

**Approach:** Confirm `adjustments.odometer` in `mmr-lab-client.tsx` is the only mileage input. Verify `buildMmrRecomputeRequest` and `buildMmrLabMaxbuyRequest` both read from the same adjustments state after edits and after VIN lookup seeding (`mileageUsed: null` → empty odometer).

**Exit criteria:**
- [ ] Adjustments odometer is the sole mileage input on `/mmr-lab`
- [ ] MMR recompute and MaxBuy evaluate use the same odometer value from adjustments
- [ ] No stale or diverged mileage silently used after the buyer edits odometer

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

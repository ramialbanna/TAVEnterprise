# Next Steps â€” MMR Lab

**Last updated:** 2026-06-27 · **Focus:** `/mmr-lab` buyer experience · **Also:** Opportunity detail page tweaks (pending explicit go-ahead)

> **Fresh chat prompt:**
> Read [`07-buybox/MMR-LAB-ARCHITECTURE.md`](07-buybox/MMR-LAB-ARCHITECTURE.md) first for how MMR Lab works end-to-end (lookup flow, adjustments, cache/lock, invariants, file map). Then pick the next unchecked item below. Spec: [`07-buybox/MMR-LAB-MAXBUY-PAGE.md`](07-buybox/MMR-LAB-MAXBUY-PAGE.md). Completed work: [`completed-tasks.md`](completed-tasks.md).

**Legend:** `[x]` done Â· `[~]` in progress Â· `[ ]` not done

---

> ## ⚠ CRITICAL — NEVER ROUND MMR ADJUSTMENT DOLLAR VALUES
>
> **Do not round, truncate, or approximate any dollar figure in the MMR Adjustments panel.**
> Cox/Manheim returns exact cents-precision values for odometer, build-options, grade, color, and region adjustments.
> Any rounding — even to the nearest dollar — produces deltas that diverge from Manheim's native tool and mislead buyers.
>
> **Known violation history (2026-06-20):**
> - The intel worker's mileage cache key used a 5,000-mile bucket (`mileageBucket`), causing lookups at 5,000 and 5,800 miles to return the same cached Cox response. The user saw `+$3,000` (the cached 5,000-mile result) instead of the correct `+$2,560` for 5,800 miles.
> - **Fix deployed:** `deriveVinCacheKey` / `deriveYmmCacheKey` now use the exact mileage integer (no bucket) whenever the caller provides a real odometer value (`isInferred = false`).
>
> **Rules for all future work on MMR Lab:**
> 1. Cox adjustment values (`adjustedBy.Odometer`, `adjustedBy.buildOptions`, `adjustedBy.Grade`, etc.) must be forwarded to the frontend as-is — no `Math.round`, no `toFixed`, no division by 1,000.
> 2. The `nonZeroDelta` helper in `mmr-adjustment-display.ts` applies `Math.round` (nearest dollar) — this is acceptable only because Cox already returns whole-dollar integers; do not change it to round to larger increments.
> 3. Cache keys that include mileage must use the exact value for user-provided/listing-actual mileage. The 5,000-mile bucket is reserved for inferred (year-estimated) mileage only.
> 4. Any derived odometer adjustment (computed as `total − buildAdj` when Cox sends mileage as a string) is only as accurate as the underlying `adjustedPricing.wholesale.average`. If Cox rounds that value, our derived delta inherits the rounding — do not attempt to "correct" it with additional math.

---

## Context

**TAV-AIP** â€” internal buyer app for Texas Auto Value. Next.js in `web/`; API is a Cloudflare Worker in `src/` (proxied via `web/app/api/app/*`).

**This doc:** Active work on **MMR Lab** â€” the combined Cox MMR lookup + MaxBuy evaluation page at `/mmr-lab`.

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
| **21** | Odometer delta badge missing when Cox sends mileage-as-string | High | [x] |
| **22** | Grade not applied — UI CR grade must convert to Cox 10× integer | High | [x] |
| **23** | Grade & color deltas — exact Cox dollar amounts, no marginal / no Math.round | High | [x] |
| **17** | YMM parity vs Manheim â€” item selection + range source | High | [x] |
| **18** | MaxBuy `vehicle_context_missing` -- trust MMR result for VIN identity | High | [x] |
| **19** | Avg Condition 10x display bug -- `averageGrade` integer not normalized | High | [x] |
| **20** | Avg EV Battery Score -- identify correct Cox response field name | Medium | [x] |
| **16** | MMR adjustment accuracy â€” deploy fixes + smoke-test grade/build deltas | High | [x] |
| **15** | Retail value â€” enable Cox retail data (env var + entitlement check) | Medium | [x] |
| **2** | Year dropdown â€” pin recent years at top | Medium | [x] |
| **3** | Per-dropdown loading indicator | Medium | [x] |
| **4** | Auto-scroll to results on mobile after submit | Medium | [x] |
| **5** | Sticky SearchPanel header on desktop scroll | Medium | [x] |
| **6** | Value button â€” tooltip showing what field is missing | Medium | [x] |
| **7** | Style approximation notice â€” closeable banner above result band | Low | [x] |
| **8** | Mileage â†” Adjustments odometer sync | Low | [x] |
| **9** | Keyboard tab flow through disabled dropdowns | Low | [x] |
| **10** | Cleared-field highlight animation | Low | [x] |
| **24** | Opportunity detail — reorder blocks (Workflow ↓, Salesperson/Appraisal ↑) | High | [x] |
| **25** | Opportunity detail — remove Listing block | High | [x] |
| **26** | Opportunity detail — Vehicle “Additional Information” (Location, Source) | Medium | [x] |
| **27** | Opportunity detail — Valuation block: full MMR Lab (not Max buy only) | High | [x] |
| **28** | Opportunity detail — Title Information checkbox ↔ field pairing | Medium | [x] |
| **29** | Opportunity detail — Title block US state dropdowns | Medium | [x] |
| **30** | Opportunity detail — Workflow stepper: Landed → **Appraised** | High | [x] |
| **31** | Opportunity detail — Vehicle block: vAuto-style dropdown fields | High | [ ] |
| **32** | Opportunity detail — auto-save on blur (no per-block Save buttons) | High | [ ] |

---

## Opportunity detail page — layout & valuation tweaks

**Route:** `/opportunities/[id]` · **Spec:** [`02-product/opportunity-detail-redesign.md`](02-product/opportunity-detail-redesign.md)  
**Status:** Requirements captured 2026-06-27 — **do not implement until explicitly requested.**

First shipped layout (Phases 1–5) is being refined. Hero workflow CTAs stay in the hero; only collapsible block order and block contents change below.

**Save UX (product direction — see item 32):** Do **not** keep explicit **Save / Reset** on every editable block long term. When a closer edits fields and **focuses out of the block** (clicks or tabs elsewhere on the page), that block should **auto-save** if dirty. Replaces the block-level Save pattern from the original redesign doc.

### Target block order (top → bottom)

| # | Block | Change |
|---|--------|--------|
| 1 | Hero | unchanged |
| 2 | **Salesperson / Appraisal Information** | **move up** — replaces Workflow’s current slot (position 2) |
| 3 | Vehicle | add subblock (see **26**) |
| 4 | ~~Listing~~ | **remove** (see **25**) |
| 5 | Valuation | full MMR Lab + Max buy (see **27**) |
| 6 | Title Information | checkbox pairing (see **28**); full width after Valuation (no longer paired with Salesperson in 2-col grid) |
| 7 | Notes | unchanged |
| 8 | **Workflow** | **move down** — immediately **before** History |
| 9 | History | unchanged (collapsed by default) |

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx`

---

## 24 — Reorder Workflow and Salesperson / Appraisal blocks

**Goal:** Deprioritize workflow metadata on the page; elevate salesperson/appraisal fields for day-to-day closer work.

**Changes:**

- Move the **Workflow** collapsible block (stepper + `OpportunityWorkflowBlock`) from position 2 to **just above History**.
- Move **Salesperson / Appraisal Information** from the lower 2-column grid into **position 2** (where Workflow is today).
- **Title Information** stays as its own block; after this reorder it likely sits full-width between Valuation and Notes (confirm at implementation).

**Exit criteria:**

- [ ] Block order matches table above
- [ ] Hero primary/secondary workflow actions unchanged
- [ ] Workflow stepper + assignment/claim UI still works after move
- [ ] No duplicate workflow UI introduced

---

## 25 — Remove Listing block

**Goal:** Drop the Listing collapsible block entirely — provenance/intake fields duplicated elsewhere (hero one-liner, provenance line, Vehicle region) and the block adds clutter without buyer value.

**Changes:**

- Remove `<CollapsibleBlock title="Listing">` and `OpportunityListingBlock` from the detail page.
- Optionally delete or retain `opportunity-listing-block.tsx` for reuse elsewhere (implementer’s call); page must not render it.

**Exit criteria:**

- [ ] Listing block not visible on `/opportunities/[id]`
- [ ] Hero still shows listing URL, source, provenance as today
- [ ] Update E2E/UAT if they assert Listing block presence

---

## 26 — Vehicle block: “Additional Information” subblock

**Goal:** Add a labeled sub-section inside the Vehicle block with two fields buyers expect near identity, without duplicating the removed Listing block.

**Fields (2-column grid inside subblock):**

| Field | Notes |
|-------|--------|
| **Location** | Human-readable location for the vehicle/deal (source TBD: new PATCH field vs map from `region` / contact address — confirm data model at implementation) |
| **Source** | Listing source (facebook, craigslist, etc.); likely read-only from `opportunity.source` with label formatting, or editable if product wants parity with manual submit |

**UI:** Subheading **“Additional Information”** below the main vehicle identity grid (VIN, odometer, YMM, etc.), same Save/Reset behavior as the parent block (or inherit parent save — implementer choice; prefer single block-level Save).

**Exit criteria:**

- [x] Subblock visible inside Vehicle collapsible panel
- [x] Location + Source displayed with consistent labels
- [x] Save persists if editable; read-only fields clearly styled if not PATCH-backed

---

## 27 — Valuation block: full MMR Lab (not Max buy only)

**Goal:** Match redesign §5 — one combined **miniature MMR Lab + Max buy** surface. Today buyers often see **Max buy only** (especially when `maxbuySummary` exists): `SavedVerdictCard` renders while `view` stays `"empty"`, so `ResultBand` / MMR adjustments never appear until “Run fresh lookup.”

**Changes:**

- Always surface MMR Lab UI when identity is sufficient: `ResultBand` (base/adjusted MMR, ranges, retail, adjustment panel, deltas).
- Keep Max buy below or beside MMR summary (`MaxbuyEvaluationSection`).
- Reuse shared MMR Lab pieces — do **not** fork Cox call logic:
  - `mmr-lab/_components/result-band.tsx`
  - `mmr-adjustments.ts`, `build-mmr-recompute-request.ts`, `build-mmr-lab-maxbuy-request.ts`
  - `maxbuy-evaluation-section.tsx`
- Preserve: saved verdict display, auto-run on load when no verdict, loading/error/empty states, vehicle PATCH → re-run MMR/Max buy (`router.refresh()` remount).
- Fix saved-verdict path so MMR is not hidden behind Max buy-only card (show both, or show MMR + saved Max buy summary together).

**Reference:** [`02-product/opportunity-detail-redesign.md`](02-product/opportunity-detail-redesign.md) §5 · [`07-buybox/MMR-LAB-ARCHITECTURE.md`](07-buybox/MMR-LAB-ARCHITECTURE.md)

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx`

**Exit criteria:**

- [x] MMR adjustments + result band visible on detail page when lookup succeeds (not only after manual “Run fresh lookup”)
- [x] Saved Max buy verdict still shown when present, alongside MMR (not instead of it)
- [x] Auto-run MMR + Max buy on load when identity sufficient and no saved verdict
- [x] Existing valuation block tests updated/extended

---

## 28 — Title Information: checkbox ↔ field pairing

**Goal:** Pair each warranty/title flag with its related input on the **same row** (vAuto-style), instead of grouping both checkboxes at the bottom of the block.

**Pairing:**

| Checkbox | Linked field |
|----------|----------------|
| **Certified** | **Owner** (`titleOwner` text input) |
| **Extended Warranty** | **Lien Payoff** (`lienPayoff` text input) |

**Intended UX (confirm at implementation if behavior differs):**

- **Layout:** Checkbox inline with or immediately adjacent to its linked textbox (same grid row).
- **Behavior:** Checking the box **enables** the linked field; unchecking **disables** (and optionally clears) it. Unchecked + empty linked field on save persists `null` / false as today.

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-title-information-block.tsx`

**Exit criteria:**

- [x] Certified + Owner share one row; Extended Warranty + Lien Payoff share one row
- [x] Linked textbox disabled when its checkbox is unchecked
- [x] PATCH payload unchanged semantically (`certified`, `titleOwner`, `extendedWarranty`, `lienPayoff`)
- [x] Save/Reset/dirty state still correct

---

## 29 — Title Information: US state dropdowns

**Goal:** Replace free-text inputs with consistent **US state** pickers for both title and tag location fields in the Title Information block.

**Fields:**

| Label in UI | PATCH field | Control |
|-------------|-------------|---------|
| **State/Region** | `titleStateRegion` | `<select>` — all 50 US states (+ empty “Select state” option) |
| **Tag State/Region** | `tagStateRegion` | Same dropdown list |

**Implementation notes:**

- Add or reuse a shared constant (e.g. `web/lib/us-states.ts`) with state codes and display names (e.g. `TX` / `Texas` — pick one storage format and use consistently; existing DB columns are `text`, max 64 chars).
- Match styling to other selects on the page (e.g. Workflow assignee dropdown).
- Pre-select saved value on load; blank option when null.

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-title-information-block.tsx`

**Exit criteria:**

- [x] Both fields render as dropdowns, not text inputs
- [x] All US states available in each list
- [x] Save persists selected value via PATCH
- [x] Invalid legacy free-text values still display sensibly (fallback or prompt re-select)

---

## 30 — Workflow stepper: Landed → Appraised

**Goal:** Rename the final buyer-facing workflow step from **Landed** to **Appraised**. The detail page is an **appraisal workspace** — the stepper should reflect completing an appraisal, not “landing” a deal.

**Stepper (updated):**

```
Found → Working → Contacted → Appraised
```

**Changes:**

- Update label in `opportunity-workflow-stepper.tsx` (`Landed` → `Appraised`; internal step id may stay `landed` or rename to `appraised` — prefer `appraised` for clarity if no breakage).
- **Backend status mapping unchanged unless product says otherwise:** step still advances to this final step on `purchased` / `bought` (same as today’s Landed = bought). This is a **label/copy** change unless we later add a distinct `appraised` status.
- Audit and update any other user-facing “Landed” copy on the detail page, E2E assertions, and UAT checklist in `opportunity-detail-redesign.md` when that doc is next edited.
- **Out of scope unless requested:** renaming hero CTA “Mark bought” → “Mark appraised” (confirm with product at implementation).

**Primary file:** `web/app/(app)/opportunities/_components/opportunity-workflow-stepper.tsx`

**Exit criteria:**

- [ ] Stepper shows Found → Working → Contacted → **Appraised**
- [ ] Active step still resolves correctly for `purchased` / `bought` opportunities
- [ ] Passed still maps to Contacted (not Appraised), same as today
- [ ] Tests/E2E updated if they assert “Landed”

---

## 31 — Vehicle block: vAuto-style dropdown fields

**Goal:** Match vAuto **Vehicle Information** UX — most identity fields are **dependent dropdowns**, not free text. Today `OpportunityVehicleBlock` renders **all 10 editable fields as `<Input>` text boxes**; only Region is read-only text.

**Reference:** vAuto appraisal Vehicle Information panel (2026-06-27 screenshot). Compare to our block in `opportunity-vehicle-block.tsx`.

### Field control types (target)

| Field | vAuto control | Our app today | Target |
|-------|---------------|---------------|--------|
| **VIN** | Text + Go | Text | **Text** (keep; optional VIN-decode action later) |
| **Odometer** | Text (required) | Text | **Text / numeric** (keep) |
| **Year** | Catalog-driven (required) | Text | **Dropdown** — Cox/MMR catalog years |
| **Make** | Dropdown (required) | Text | **Dropdown** — dependent on Year |
| **Model** | Dropdown (required) | Text | **Dropdown** — dependent on Year + Make |
| **Series** | Dropdown | Text (`style`) | **Dropdown** — dependent on Year + Make + Model |
| **Body Type** | Dropdown | Text | **Dropdown** |
| **Engine** | Dropdown | Text | **Dropdown** |
| **Transmission** | Dropdown | Text | **Dropdown** |
| **Color** | Dropdown | Text | **Dropdown** |
| **Region** | — | Read-only text | Unchanged (provenance) |

**Count:** **8 of 10** editable vehicle fields should be dropdowns (Year, Make, Model, Series, Body Type, Engine, Transmission, Color). **2 stay text:** VIN, Odometer.

### Data sources (implementation)

| Dropdown group | Likely source |
|----------------|---------------|
| Year → Make → Model → Series | Reuse **`useVehicleCatalogOptions`** (`web/app/(app)/opportunities/_components/use-vehicle-catalog.ts`) — same `/mmr/catalog/*` APIs as MMR Lab + manual submit |
| Body Type, Engine, Transmission | TBD — VIN/MMR decode payload, Cox style metadata, or catalog extension; confirm at implementation |
| Color | TBD — align with MMR Lab color list (`mmr-adjustments` / Cox color param) where possible |

### UX rules (mirror MMR Lab / manual submit)

- Dependent dropdowns: changing Year clears Make/Model/Series; changing Make clears Model/Series; etc.
- Show loading state per dropdown while catalog fetches (see MMR Lab item **3** pattern).
- Preserve block-level **Save / Reset / dirty** behavior; valuation-affecting changes still trigger MMR/Max buy refresh on save.
- When saved values don’t match catalog options (scraper free-text), show current value and prompt re-select or allow fallback (match manual-submit parse-then-match behavior).

**Primary files:**

- `web/app/(app)/opportunities/_components/opportunity-vehicle-block.tsx`
- `web/app/(app)/opportunities/_components/use-vehicle-catalog.ts` (reuse)
- Reference UI: `web/app/(app)/mmr-lab/_components/search-panel.tsx`, `manual-submit-form.tsx`

**Exit criteria:**

- [ ] 8 fields render as `<select>` (or shared Select component), not text inputs
- [ ] VIN + Odometer remain text inputs
- [ ] Y/M/M/S cascade works with MMR catalog
- [ ] Body Type / Engine / Transmission / Color dropdowns populated (source documented in PR)
- [ ] Save/Reset/PATCH unchanged semantically
- [ ] Tests updated for dropdown interaction + catalog mocks

---

## 32 — Auto-save on blur (remove per-block Save buttons)

**Goal:** Stop requiring a **Save** click on every editable block. When the user edits a block and **leaves that block** (focus moves to another part of the page — another block, hero, nav, etc.), **persist automatically** if there are unsaved changes.

**Product intent (2026-06-27):** Closers should work fluidly across the appraisal workspace; saving should feel invisible, like vAuto-style forms that commit when you move on.

**Applies to editable blocks on `/opportunities/[id]`:**

- Hero — Contact Information  
- Salesperson / Appraisal Information  
- Vehicle (+ future Additional Information subblock)  
- Title Information  
- Notes — **exception TBD:** may keep explicit “Save note” or also blur-save; confirm at implementation  

**Does not apply:**

- Read-only blocks (Workflow metadata, History, Valuation MMR adjustments — those have their own recompute/save rules)  
- Hero workflow action buttons (claim, mark contacted, etc.)

**Behavior:**

1. User edits fields inside a block → block is **dirty**.  
2. User clicks/tabs **outside** that block’s container (blur / focus-out of the block root) → if dirty and `canMutate`, **PATCH** once (debounce ~300ms optional to avoid double-fire).  
3. Remove **Save** and **Reset** buttons from blocks once blur-save is wired (or hide Save and keep Reset only if product wants revert — confirm).  
4. **Valuation-affecting** vehicle/contact fields: same PATCH as today; parent still `router.refresh()` + MMR/Max buy re-run after successful save.  
5. **Errors:** inline banner in the block; do not lose edits on failure.  
6. **Pending:** disable duplicate saves while PATCH in flight.  
7. **Navigate away** with dirty block: optional `beforeunload` / unsaved warning — align with original redesign §3 “warn on navigate away”.

**Implementation sketch:**

- Wrap each editable block in a container with `onBlur` using `relatedTarget` / `contains()` check so focus moving **within** the same block does not save.  
- Or shared hook `useBlockAutoSave({ blockRef, isDirty, onSave })` used by Contact, Vehicle, Salesperson, Title blocks.  
- Centralize PATCH in `OpportunityDetailClientNew` (already has `patchMutation`).

**Supersedes:** Block-level Save in [`02-product/opportunity-detail-redesign.md`](02-product/opportunity-detail-redesign.md) §3 Vehicle / §6 notes — update that doc when this ships.

**Primary files:**

- `opportunity-detail-client-new.tsx`  
- `opportunity-contact-info-block.tsx`  
- `opportunity-vehicle-block.tsx`  
- `opportunity-salesperson-appraisal-block.tsx`  
- `opportunity-title-information-block.tsx`  

**Exit criteria:**

- [ ] No Save button on Contact, Vehicle, Salesperson/Appraisal, Title blocks (unless product keeps Reset)  
- [ ] Editing then clicking outside the block persists via PATCH without manual Save  
- [ ] Focus moving between fields **inside** the same block does not trigger save  
- [ ] Valuation refresh still runs after vehicle identity saves  
- [ ] E2E updated: blur-to-save instead of Save button click  

---

## 17 â€” YMM Parity vs Manheim Native

**Goal:** YMM (Year/Make/Model/Style) lookups in our MMR Lab must return the same Base MMR, MMR Range, Estimated Retail Value, and Typical Range as Manheimâ€™s native MMR tool for identical inputs.

**Last updated:** 2026-06-19 (test completed â€” fix approach confirmed)

### What was observed (2026-06-19)

Side-by-side testing of 3 YMMs + 2 VINs confirmed two distinct problems. Full results: [07-buybox/MMR-PARITY-TEST-RESULTS.md](07-buybox/MMR-PARITY-TEST-RESULTS.md)

#### Problem A -- Base MMR differs when wrong item selected (confirmed: 2022 Toyota Camry SE)

| Field | Our app | Manheim |
|---|---|---|
| Base MMR | $19,950 | $15,850 |
| Avg Condition | 3.8 | 2.3 |

- Score each item by closeness to the selected style string (exact match -> subSeries match -> token overlap)
- Pick the highest-scoring item; fall back to `items[0]` if nothing scores above threshold
- Style string comes from Cox's own catalog so the format is compatible


**Fix (decided 2026-06-19):** Pass the user's selected style name into item selection and score each item in `items[]` against `description.trim` / `description.subSeries` instead of always taking `items[0]`.

| Field | Our app | Manheim |
|---|---|---|
| Base MMR | ,700 | ,700 âœ“ |
| MMR Range | ,500 â€“ ,850 | ,000 â€“ ,400 |
| Retail Value | ,100 | ,100 âœ“ |
| Typical Range | ,400 â€“ ,700 | ,400 â€“ ,700 âœ“ |

**Root cause (suspected):** Our range fix (2026-06-19, commit 16d716a) changed 
angeLow/
angeHigh to use the base wholesale.below/above tier with fallback to the adjusted tier. Coxâ€™s search responses include both tiers on each item, but neither produces Manheimâ€™s tighter range. Manheimâ€™s range is likely sourced from the ci (confidence interval) block. The Cox API explicitly documents include=ci as unsupported on /search/... endpoints, which is why uildCoxIncludeTokens strips it for YMM calls (isSearch: true). Manheimâ€™s own native tool may use an internal API version where ci is available on search, or it converts YMM to an internal VIN match and uses VINâ€™s ci.

### Structured test in progress (2026-06-19)

Running a controlled comparison across 5 YMMs + 3 VINs to confirm which problems are consistent and which are vehicle-specific.

**YMMs (user running through Manheim native, results pending):**

| # | Year | Make | Model | Style |
|---|------|------|-------|-------|
| 1 | 2022 | Toyota | Camry | SE 4D Sedan |
| 2 | 2021 | Ford | F-150 | XLT 4D SuperCrew |
| 3 | 2023 | Honda | CR-V | EX 4D Sport Utility |
| 4 | 2020 | Chevrolet | Equinox | LT 4D Sport Utility |
| 5 | 2019 | BMW | 5 Series | 530I 4D Sedan |

**VINs (user running through Manheim native, results pending):**

| # | VIN | Vehicle |
|---|-----|---------|
| 1 | 1FT7W2BT4KED81759 | 2019 Ford F-150 |
| 2 | 1GYTEEKL1SU107843 | 2025 Cadillac Escalade IQ |
| 3 | TBD â€” any 2022 Toyota Camry from recent inventory | 2022 Toyota Camry |

**Fields to record for each lookup in Manheim:**
Base MMR, MMR Range (low â€“ high), Avg Odometer, Avg Condition, Adjusted MMR (no adjustments applied), Estimated Retail Value, Typical Range (low â€“ high)

### What to investigate before fixing

1. **Inspect raw Cox items[] array** for a YMM with a Base MMR mismatch: query mmr_cache or mmr_queries in Supabase for the 2018 BMW 3 Series 320I lookup. Find which item has avg condition 3.7 â€” is it items[0] or a later index?
2. **Test include=ci on a YMM/search call**: Cox docs say unsupported, but test whether Cox silently accepts it. If it works, enabling MANHEIM_INCLUDE_CI on search calls would fix the range problem without code changes beyond removing the isSearch guard.
3. **Compare item counts**: do different vehicles return different numbers of items? If items[0] is sometimes correct and sometimes not, the selection logic needs a smarter heuristic.

### Exit criteria

- [x] Test results from 5 YMMs + 3 VINs collected and compared
- [x] Root cause of Base MMR mismatch confirmed (wrong item index vs. trim name mismatch vs. other)
- [x] Decision made: fix item selection heuristic, enable ci on search, or both
- [x] YMM lookups produce Base MMR within  of Manheim for at least 4 of 5 test vehicles
- [x] MMR Range within  of Manheim on both ends for at least 4 of 5 test vehicles
- [x] No regression on VIN path

---

## 16 â€” MMR Adjustment Accuracy

**Goal:** Grade, build-options, and odometer deltas in the MMR Adjustments panel must match the values shown in Manheim's native MMR tool for the same inputs.

### Background â€” what was found (2026-06-17)

Side-by-side comparison of our MMR Lab vs the native Manheim MMR tool on VIN `1GYTEEKL1SU107843` (2025 Cadillac Escalade IQ) revealed three linked bugs:

#### Bug 1 â€” Build delta inflated when grade is also active

**Root cause:** `buildOptionsFromBooleanTrue()` in `src/valuation/manheimResponseParser.ts` assigned the **entire** `adjustedPricing.wholesale.average âˆ’ wholesale.average` delta to build options whenever Cox sends `adjustedBy.buildOptions: true` (boolean, not dollars). It only guarded against odometer mismatch â€” it did **not** bail when grade, color, or region were also present in `adjustedBy`.

When grade=5.0 is active:
- Cox returns total delta = grade ($420) + build ($890) = combined in `adjustedPricing.wholesale.average`
- Our parser assigned $1,310 (or similar combined total) as build-only
- Manheim correctly showed build = $890 and grade = $420 separately

**Fix applied (commit `9d7783e`):** `buildOptionsFromBooleanTrue` now returns `{ included: true, adjustment: null }` when `adjustedByHasGrade`, `adjustedByHasColor`, or `adjustedByHasRegion` is true in `adjustedBy`. When adjustment is null, the breakdown function's residual logic can properly attribute the remaining delta to grade/color/region via single-field residual attribution.

#### Bug 2 â€” Grade delta never shown in the adjustments panel

**Root cause:** Two compounding issues:

1. Cox returns `adjustedBy.Grade: "40"` (a string grade code on a 10-point scale, e.g. "40" = grade 4.0, "50" = grade 5.0). `readAdjustedByFieldDollars()` only reads **numeric** values â€” strings are ignored â€” so `gradeAdjustment` from the parser always comes back `null`.

2. The fallback is **marginal tracking**: when the user changes grade from empty â†’ 5.0, a recompute fires, and `applyAttributeMarginalDelta` captures the delta between the prior and new `adjustedMmr`. But `pendingMarginalChangesRef.current` was **overwritten** (not accumulated) on each `handleAdjustmentsChange` call. If the user entered an odometer value after selecting grade (both within the same 400ms debounce window), the odometer change would overwrite `pendingMarginalChangesRef = []`, losing the grade change, so the marginal was never stored.

**Fix applied (commit `9d7783e`):** `pendingMarginalChangesRef.current` is now accumulated with `Array.from(new Set([...existing, ...newChanges]))` instead of overwritten. Grade/color/region changes are preserved even when odometer or other fields change before the debounce fires.

#### Bug 3 â€” Odometer field fired Cox API on every keystroke

**Root cause:** The odometer `<input>` called parent `onChange` on every keystroke. The parent debounced at 400ms, but slow typing (any pause >400ms between digits) fired one Cox API call per intermediate value (`4`, `40`, `400`, `4000`, `40000`). Each call set a new `adjustmentBaseline`, and out-of-order responses could corrupt the displayed build delta and grade marginals.

The Express Grade input had the same problem.

**Fix applied (commit `9d7783e`):** Both text inputs now hold local React state and only call the parent `onChange` (triggering the recompute) on `onBlur`. A `useEffect` syncs the local value back down when the parent resets it (e.g. Clear button).

### What the numbers look like now vs target

With odometer=20,000 entered, no grade selected (our app) vs grade=5.0 selected (Manheim):

| Field | Our app (no grade) | Manheim (grade=5.0) | Expected when grade=5.0 added in our app |
|---|---|---|---|
| Adjusted MMR | $98,200 | $98,600 | $98,600 |
| Odometer delta | âˆ’$3,800 | âˆ’$4,050 | ~âˆ’$4,050 |
| Grade delta | â€” | +$400 | ~+$400 (via marginal) |
| Build delta | +$1,000 | +$890 | ~+$890 (parser fix) |

The $400 gap in adjusted MMR and the $110 build difference are both expected when grade is not applied â€” they disappear once grade=5.0 is selected in our app and the recompute runs. The numbers are **different inputs producing different outputs**, not a calculation error once the fixes are deployed.

### What still needs to happen

| Step | Action | Owner |
|---|---|---|
| **Deploy app worker** | Deploy `src/` (Cloudflare Worker) to production â€” contains the `buildOptionsFromBooleanTrue` parser fix | Engineering |
| **Deploy web app** | Deploy `web/` (Next.js) to production â€” contains the blur-only inputs and marginal accumulation fix | Engineering |
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
- [ ] No regression on build-only (no grade) scenario â€” build delta still shows when grade is not selected

---

## 15 â€” Retail value: enable Cox retail data

**Goal:** The result band has wired-up `retailValue`, `retailRangeLow`, `retailRangeHigh` columns that always show `--` because Cox is never asked for retail data.

### Root cause

`buildCoxIncludeTokens` in `workers/tav-intelligence-worker/src/clients/manheimHttp.ts` only appends `"retail"` to the Cox `include=` query param when `env.MANHEIM_INCLUDE_RETAIL === "true"`. That env var has never been set on the intel worker, so the retail block is never requested.

### What to check first

Before setting the env var, confirm with Cox/Manheim account rep whether the TAV API key is entitled for the `retail` include token. The `MANHEIM_INCLUDE_RETAIL` flag exists precisely because retail is a separate entitlement â€” enabling it on an un-entitled key will produce 4xx errors or empty retail blocks on every lookup.

### What to change

| Step | Action |
|---|---|
| 1 | Confirm Cox account has retail entitlement |
| 2 | Set `MANHEIM_INCLUDE_RETAIL=true` in the intel worker's Cloudflare environment (wrangler secret or `[vars]` in `wrangler.toml`) |
| 3 | Smoke-test a known VIN â€” confirm `retailValue` appears in the response envelope |
| 4 | Verify `result-band.tsx` renders the retail card correctly once the value is non-null |

If Cox confirms the account is **not** entitled for retail: hide the retail card in the result band UI rather than showing permanent `--` dashes.

### Exit criteria

- [ ] Either: retail value and range are populated in the result band for a live VIN lookup
- [ ] Or: retail card is hidden in the UI with a doc note confirming the account lacks entitlement
- [ ] No new 4xx errors appear in intel worker logs after enabling

---

## 2 â€” Year dropdown: pin recent years at top

**Goal:** Buyers almost always look up 2022â€“2026 vehicles. The year dropdown currently shows a flat list from 2003 onward â€” requires scrolling past many years to reach common ones.

**Approach:** Split the year options into two groups: the most recent N years (e.g. current year âˆ’ 4 through current year) pinned at the top, then a `<optgroup>` or `<hr>`-style divider, then all remaining years below. No functional change â€” just reorders the `<option>` elements in `search-panel.tsx` using the `catalog.years` array.

**Exit criteria:**
- [ ] Most recent 5 years appear at the top of the Year dropdown before older years
- [ ] Year list is still complete (all years remain selectable)
- [ ] No change to catalog API calls or selection behavior

---

## 3 â€” Per-dropdown loading indicator

**Goal:** When catalog data is loading (e.g. after a year change triggers a makes refetch), the Make dropdown is silently disabled. Buyers have no feedback that something is happening.

**Approach:** In `search-panel.tsx`, render a `"Loadingâ€¦"` placeholder `<option>` as the first option (after the blank prompt) when `catalog.loading === "makes"` / `"models"` / `"styles"` for that field. Alternatively, show a small spinner icon inside the select wrapper using a `relative`/`absolute` overlay.

**Exit criteria:**
- [ ] Make shows loading feedback when `catalog.loading === "makes"`
- [ ] Model shows loading feedback when `catalog.loading === "models"`
- [ ] Style shows loading feedback when `catalog.loading === "styles"`
- [ ] No additional API calls introduced

---

## 4 â€” Auto-scroll to results on mobile after submit

**Goal:** After clicking Search (VIN) or Value (YMM) on a phone, the result band is below the fold. Buyers don't notice results have loaded.

**Approach:** In `mmr-lab-client.tsx`, after `setView({ kind: "ok", ... })` fires, call `document.getElementById("mmr-result-band")?.scrollIntoView({ behavior: "smooth" })`. Add `id="mmr-result-band"` to the `<ResultBand>` wrapper. Only scroll on mobile (use a `window.innerWidth < 768` guard or a media-query-aware hook).

**Exit criteria:**
- [ ] After submit on mobile viewport, page scrolls smoothly to the result band
- [ ] Desktop scroll behavior unchanged (no auto-scroll on desktop)

---

## 5 â€” Sticky SearchPanel header on desktop scroll

**Goal:** On desktop, buyers scroll down through adjustments and transactions but lose sight of the VIN / YMM inputs. The native Manheim MMR tool keeps its lookup form visible.

**Approach:** Wrap `<SearchPanel>` in a `sticky top-0 z-10` container (Tailwind). Add a collapsed/expanded toggle so the panel can be minimized once a lookup is active to free vertical space.

**Exit criteria:**
- [ ] SearchPanel sticks to the top of the viewport when scrolling on desktop (â‰¥ 1024px)
- [ ] Panel can be collapsed/expanded while sticky to free vertical space
- [ ] Mobile behavior unchanged (no sticky on small viewports)

---

## 6 â€” Value button: tooltip for missing fields

**Goal:** The Value button is disabled whenever Year/Make/Model/Style is incomplete, but clicking it does nothing and shows no explanation. Buyers don't know which field to fill.

**Approach:** In `search-panel.tsx`, compute the first missing required field from `selection` and show a Tooltip (from `@/components/ui/tooltip`) on the disabled Button listing what is missing (e.g. "Select a Style to enable valuation"). Use the `title` attribute as a fallback for non-JS contexts.

**Exit criteria:**
- [ ] Hovering or focusing the disabled Value button shows which field is missing
- [ ] Tooltip text is accurate for every combination of missing fields
- [ ] When all fields are filled the tooltip is removed (button is enabled)

---

## 7 â€” Style approximation notice: closeable banner

**Goal:** When Cox trim doesn't exactly match a catalog style (DEC-MLB-6), a small amber text line appears below the dropdowns. This is easy to miss, especially after the result band loads.

**Approach:** Replace the `<p role="status">` in `search-panel.tsx` with a dismissible banner component (`Alert` from `@/components/ui/alert`) positioned above the result band (below the SearchPanel). Include an Ã— close button that calls `setStyleNotice(null)` via a lifted callback.

**Exit criteria:**
- [ ] Approximate style match shows a dismissible amber Alert above the result band
- [ ] User can close the notice; it does not reappear until the next VIN lookup
- [ ] Exact match (or no VIN lookup) shows no banner

---

## 8 â€” Mileage â†” Adjustments odometer sync

**Goal:** Odometer for MMR recompute and MaxBuy lives in MMR Adjustments only (Miles was removed from the search panel). Ensure a single source of truth â€” edits in adjustments odometer must flow correctly to MMR recompute and MaxBuy evaluate without diverged state.

**Approach:** Confirm `adjustments.odometer` in `mmr-lab-client.tsx` is the only mileage input. Verify `buildMmrRecomputeRequest` and `buildMmrLabMaxbuyRequest` both read from the same adjustments state after edits and after VIN lookup seeding (`mileageUsed: null` â†’ empty odometer).

**Exit criteria:**
- [ ] Adjustments odometer is the sole mileage input on `/mmr-lab`
- [ ] MMR recompute and MaxBuy evaluate use the same odometer value from adjustments
- [ ] No stale or diverged mileage silently used after the buyer edits odometer

---

## 9 â€” Keyboard tab flow through disabled dropdowns

**Goal:** Tabbing through the form skips disabled dropdowns entirely. Buyers using keyboard-only navigation cannot reach the Year dropdown when the catalog is not connected, or Make when no year is selected.

**Approach:** Disabled `<select>` elements are excluded from the tab order by default. Add `tabIndex={0}` to disabled selects and intercept `onKeyDown` to show a tooltip ("Select a Year first") rather than just blocking input.

**Exit criteria:**
- [ ] Tab key moves focus through all four YMM dropdowns regardless of disabled state
- [ ] Pressing Space or Enter on a disabled dropdown shows a tooltip explaining the required prerequisite
- [ ] No regression on enabled dropdown behavior

---

## 10 â€” Cleared-field highlight animation

**Goal:** When a year change causes a make/model/style to be invalidated and cleared by the catalog re-validation logic (DEC-MLB-7), the field blanks out silently. Buyers don't understand why it changed.

**Approach:** In `search-panel.tsx`, track which fields were just cleared (via a short-lived state flag or CSS class toggled in `onSelectionChange`). Apply a brief flash animation (e.g. `animate-pulse` or a red border fade) to the cleared field for ~1.5 s, then revert to normal styling.

**Exit criteria:**
- [ ] When a field is cleared due to catalog re-validation, it briefly flashes/highlights
- [ ] The animation does not fire on initial page load or manual user clears
- [ ] Animation respects `prefers-reduced-motion` (no animation if user has reduced motion set)

- Score each item by closeness to the selected style string (exact match -> subSeries match -> token overlap)
- Pick the highest-scoring item; fall back to `items[0]` if nothing scores above threshold
- Style string comes from Cox's own catalog so the format is compatible

**Files to change:**
- `src/valuation/manheimPayloadItem.ts` -- add optional `styleName` param to `selectMmrPayloadItem`, apply scoring heuristic for YMM calls
- `workers/tav-intelligence-worker/src/handlers/mmrYearMakeModel.ts` -- pass `style` query param into item selection
- `src/app/routes.ts` -- ensure `style` is forwarded through the YMM lookup path

---

## 18 -- MaxBuy `vehicle_context_missing` for External VINs

**Goal:** MaxBuy evaluation must never show "Could not resolve vehicle details for this VIN." for any VIN that produced a valid MMR result. If Cox returned year/make/model, MaxBuy must be able to run.

**Last updated:** 2026-06-19

### What was observed (2026-06-19)

VIN `1FT7W2BT4KED81759` (2019 Ford F-250 PLATINUM) returned a correct MMR result (Base MMR `,500`, high confidence) but the MaxBuy section showed:

> Could not resolve vehicle details for this VIN.

The Escalade IQ (`1GYTEEKL1SU107843`) worked fine because it exists in TAV's normalized_listings/purchase_outcomes tables as an ingested vehicle. The F-250 does not -- it is an external/test VIN never processed through TAV's ingest pipeline.

### Root cause

`resolveVehicleContext` (`src/maxbuy/persistence/vehicleContext.ts`) resolves vehicle identity in this order:

1. Query `normalized_listings` by VIN -- not found (VIN not in TAV inventory)
2. Query `purchase_outcomes` by VIN -- not found (TAV never bought/sold this vehicle)
3. VIN year-decode fallback -- decodes model year from VIN but requires `region` in the request; MMR Lab does not send region, so this also fails
4. Returns null

Then `vehicleContextFromRequestFields` is the last fallback -- it reads year/make/model from the request body. These come from the MMR session (`mmrVinSessionFromResult` attaches them from the Cox response). However this is unreliable -- if the session doesn't have those fields, the fallback returns null and the error is thrown.

### Why this is wrong by design

MaxBuy's purpose is:
1. Take a VIN, decode year/make/model
2. Look up TAV's purchase history for that year/make/model segment
3. Score and produce a max buy recommendation

Step 2 (`fetchHistoricalSummary`) already queries by year/make/model, not by VIN. The VIN lookup in step 1 is only used to GET the year/make/model -- but the MMR result already returned that from Cox. The system should trust the MMR result instead of requiring the VIN to exist in the database.

### Fix

**Option 1 -- Reliably pass year/make/model from MMR result into the MaxBuy request (primary fix)**

`buildMmrLabMaxbuyRequest` already tries to attach year/make/model from the session to the request body. Audit and harden this so it is guaranteed when a VIN MMR lookup succeeds:

- Confirm `mmrVinSessionFromResult` is always called after a successful VIN MMR lookup and the session is updated before any MaxBuy evaluate fires
- Confirm `body.year`, `body.make`, `body.model` are present in the serialized request body sent to the Worker (check the `MaxbuyEvaluateRequest` type allows these fields on VIN requests)
- In the backend, treat year/make/model from the request body as equivalent to DB-resolved identity -- no DB lookup should be required when these are present

**If no TAV historical data exists for the segment:**

Do not error. Show the MaxBuy result with `data strength: low` and the existing "Limited segment data" warning. This already works for rare vehicles -- the `fetchHistoricalSummary` returns empty and scoring degrades gracefully. The user gets a rough guide rather than a crash.

**Files to change:**
- `web/app/(app)/mmr-lab/_components/build-mmr-lab-maxbuy-request.ts` -- ensure year/make/model always in body when session has them
- `src/maxbuy/persistence/vehicleContext.ts` -- if year/make/model are in the request, return a VehicleContext from them directly without requiring DB lookup
- `web/lib/app-api/missing-reason.ts` -- never surface `vehicle_context_missing` as "Could not resolve vehicle details" to buyers; if it somehow still fires, show a softer message

### Exit criteria

- [ ] VIN `1FT7W2BT4KED81759` produces a MaxBuy result (even low-confidence) instead of the error
- [ ] Any VIN that returns a valid MMR result also gets a MaxBuy evaluation
- [ ] "Could not resolve vehicle details for this VIN." never appears on screen for a VIN with a valid MMR result
- [ ] If segment has no TAV history, shows low data-strength warning instead of error
- [ ] No regression for VINs that ARE in normalized_listings (they still resolve via DB, same behavior)

---

## 22 — Grade: convert UI CR grade to Cox query param

**Goal:** Selecting grade **4.5** in MMR Adjustments must send `grade=45` to Cox (not `grade=4.5`, which Cox silently ignores).

**Last updated:** 2026-06-22 (fix applied — **pending production smoke confirmation**)

### Fix applied

- **Web** (`mmr-adjustments.ts`): `toCoxGradeParam()` converts `"4.5"` → `"45"` inside `mapMmrAdjustmentsToApi`; UI dropdown unchanged.
- **Main worker** (`coxGradeParam.ts` + `routes.ts`): `normalizeMmrLookupAdjustments()` applies the same conversion before forwarding to the intel worker.

### Exit criteria (confirm before marking [x])

- [x] F450 VIN at odometer 200 + grade 4.5 + Black: Adjusted MMR ≈ **$66,300** (matches Manheim)
- [x] Grade delta badge shows ≈ **+$710** (display fix may still be separate if Cox returns grade as string code)
- [x] Vercel deploy includes web `mapMmrAdjustmentsToApi` change

---

## 23 — Grade & color adjustment deltas: exact Cox dollar amounts

**Goal:** Grade and color badges must show the **exact per-field dollar adjustment Cox returns** — matching Manheim native (e.g. grade **+$710**, color **−$480** on F450 VIN `1FT8W4DT8JEB57132`), not derived approximations.

**Last updated:** 2026-06-22 (analysis — fix not started)

### Grade (+$700 in our app vs +$710 Manheim)

Cox does **not** send a grade dollar amount in the field we currently read. It sends a grade **code** (e.g. `"45"` for CR 4.5). Our parser uses `readAdjustedByFieldDollars()`, which **only accepts numeric values**, so the grade code is ignored for dollar display.

The **+$700** shown in our app is **not** from Cox's grade adjustment field. It is almost certainly from **marginal tracking**: the change in Adjusted MMR when the user selected grade (e.g. $66,300 − $65,600 = $700). That is close to Manheim's **+$710** but not the same — it is a recomputed total delta, not Cox's labeled grade split.

**Requirement:** We must **not** rely on marginal tracking or residual math for grade. We need the **exact grade dollar amount from Cox** — the same value Manheim shows next to the grade dropdown. Investigate the raw Cox payload (`adjustedBy` and related fields) for VIN `1FT8W4DT8JEB57132` with grade=45 to find where Cox exposes the grade adjustment in dollars (may be a separate key from `Grade` the code string).

**Files likely involved:**
- `src/valuation/manheimResponseParser.ts` — `readAdjustedByFieldDollars`, `extractManheimAdjustmentBreakdown`
- `web/app/(app)/mmr-lab/_components/mmr-adjustment-display.ts` — stop preferring `attributeMarginals.grade` when Cox provides a dollar field

### Color (−$500 in our app vs −$480 Manheim)

Color **may** already be a numeric Cox value (`adjustedBy.Color` = −500), which we forward with only nearest-dollar `Math.round` in `nonZeroDelta` — that does not change whole integers, so **−$500 may be exactly what Cox returned** on that lookup. Manheim's **−$480** suggests either Cox returns a different value than we parse, or our decomposition diverges when odometer + grade + color are all active.

**Requirement:** **Remove `Math.round`** from the grade/color adjustment display path (align with the no-rounding rule in the CRITICAL block at top of this doc for adjustment dollars). **Parse and forward the exact dollar amount Cox returns** for color (and grade once the correct field is identified) — no rounding, no marginal fallback when Cox provides the value.

**Files likely involved:**
- `src/valuation/manheimResponseParser.ts` — color/grade dollar extraction
- `web/app/(app)/mmr-lab/_components/mmr-adjustment-display.ts` — `nonZeroDelta` / `deriveMmrAdjustmentDeltas`

### Exit criteria

- [x] F450 VIN (odometer 200, grade 4.5, Black): grade badge **+$710**, color badge **−$480** (match Manheim)
- [x] Values sourced from Cox payload fields, not marginal tracking, when Cox provides them
- [x] No `Math.round` on grade/color adjustment dollars in the display pipeline
- [x] Adjusted MMR remains **$66,300** — no regression on hero price

---

## 21 — Odometer delta badge missing (mileage-as-string)

**Goal:** When a buyer enters a non-average odometer, the green/red **+$X** badge next to the odometer field must match Manheim's native MMR tool. Adjusted MMR was already correct; only the per-field delta label was missing.

**Last updated:** 2026-06-22 (fix applied — **pending production smoke confirmation**)

### What was observed (2026-06-22)

VIN `1FT8W4DT8JEB57132` (2018 Ford F450): odometer **200** mi (avg 99,606). Manheim shows **+$15,430** next to odometer; our app showed Adjusted MMR **$66,100** (correct) but **no odometer delta badge**.

### Root cause

1. Cox sends `adjustedBy.Odometer` as mileage string `"200"`, not a dollar amount — parser could not read a dollar delta.
2. `buildOptions: true` with odometer ≠ average left `buildAdj` null, blocking the `total − buildAdj` derivation path.
3. Client fallback required build dollars or an average-odometer baseline; neither existed after recompute at 200 mi.

### Fix applied (2026-06-22)

- **Parser** (`manheimResponseParser.ts`): when build flag is on, build dollars unknown, no grade/color/region, and odometer ≠ average → assign wholesale delta to `odometerAdjustment`.
- **Client** (`mmr-adjustment-display.ts`): when build on, build dollars null, no baseline → derive odometer from `adjustedMmr − baseMmr`.

### Exit criteria (confirm before marking [x])

- [x] VIN `1FT8W4DT8JEB57132` at odometer 200 shows odometer delta ≈ **+$15,400** (within ~$50 of Manheim +$15,430)
- [x] Adjusted MMR still **$66,100** — no regression on hero price
- [x] Grade + odometer + build combined case still does **not** show a bogus grade/odo split (regression test passes)
- [x] Deploy main worker + verify on https://tav-enterprise.vercel.app/mmr-lab

---

## 19 -- Avg Condition 10x display bug

**Goal:** verageGrade returned by Cox is a 10x integer (e.g. 38 = grade 3.8). The result band was displaying the raw integer instead of the decimal.

**Last updated:** 2026-06-20

**Root cause:** 
eadNumericField(payloadItem, "averageGrade") in src/app/routes.ts forwarded the raw Cox integer directly to the frontend. The frontend ormatNumber renders it as-is (38 instead of 3.8).

**Fix applied (2026-06-20):** Added 
ormalizeAverageGrade() helper to 
outes.ts that divides by 10 when the raw value exceeds 10. Called at the single assignment site for vgCondition. Logic matches ormatGrade() already used by manheimMarketContextParser.ts for transaction-row conditions.

**Files changed:**
- src/app/routes.ts -- 
ormalizeAverageGrade helper; vgCondition now normalized before response
- web/app/(app)/mmr-lab/_components/result-band.test.tsx -- test that vgCondition={3.9} renders 3.9 not 39

### Exit criteria

- [x] Avg Condition displays 3.9 (not 39) for a VIN/YMM lookup
- [x] Unit test asserts decimal rendering
- [x] No regressions (1137 src tests + 12 result-band tests pass)

---

## 20 -- Avg EV Battery Score: identify correct Cox field name

**Goal:** Manheim native shows 100% EV Battery Score for VIN 1GYTEEKL1SU107843 (2025 Cadillac Escalade IQ). Our result band shows --.

**Last updated:** 2026-06-20

**What is already wired:** The pipeline is complete end-to-end:
- manheimResponseParser.ts -- parseEvBatteryScore tries keys: verageEvBatteryScore, verageEVBatteryScore, vgEvBatteryScore, vgEVBatteryScore, verageEVBH
- 
outes.ts -- conditionally includes vgEvBatteryScore in the response envelope
- mmr-lab-client.tsx -- passes vgEvBatteryScore to ResultBand
- 
esult-band.tsx -- renders the stat when non-null

**Blocker:** Cox returns the field under a key name that does not match any of the 5 tried names. The correct key cannot be determined from the codebase alone -- it requires inspecting a raw Cox payload for an EV VIN.

### How to find the correct key name

1. Run a VIN lookup for 1GYTEEKL1SU107843 in the app (with the intel worker deployed)
2. Temporarily log or store the raw mmr_payload from the Cox response
3. Search the payload JSON for any key containing "battery", "evbh", "ev", or "health"
4. Add the discovered key to the tried-keys list in parseEvBatteryScore in manheimResponseParser.ts

### Exit criteria

- [x] Correct Cox field name identified by inspecting raw payload
- [x] Key added to parseEvBatteryScore fallback list
- [x] Escalade IQ VIN lookup shows Avg EV Battery Score = 100% (or whatever Cox returns)

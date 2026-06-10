# MMR Lab + MaxBuy — Combined Page Spec

**Status:** Active — UI-first execution plan  
**Last updated:** 2026-06-10  
**Route:** `/mmr-lab` (canonical; buyer-accessible)  
**Audience:** Cursor agents, solo dev, reviewers  
**Reference screenshots:** `docs/07-buybox/screenshots mmr cox/` (`image.png`, `image copy.png`, `image copy 2.png`)

> **Agent entry point:** Read this file before touching `/mmr-lab`, MaxBuy standalone UI, MMR adjustments, or buyer nav for valuation tools. UI work ships first with mocks/placeholders; backend wiring is a second phase.

---

## 1. Outcome we want

Buyers at the lane (and admins) open **one page** — `/mmr-lab` — that combines:

1. **Cox-style wholesale MMR lookup** (VIN or Year/Make/Model/Trim + mileage)
2. **MaxBuy evaluation** on the same search (parallel with MMR; MMR renders first)
3. **Cox-style lower sections** (Transactions table, Historical/Projected averages) — UI shells first, live data in phase 2

The page replaces the old split experience (`/mmr-lab` admin-only + separate `/maxbuy` narrow form). **Deal detail embedded MaxBuy cards, `/maxbuy` redirect behavior, and Opportunities workflow stay unchanged** unless this doc says otherwise.

### Visual target

Match **Cox MMR information architecture**, not pixel-perfect Cox branding:

| Cox reference | TAV adaptation |
|---------------|----------------|
| Dense 3-column valuation dashboard | Reuse layout pattern; TAV tokens (`primary`, `Card`, `Badge`, existing typography) |
| Navy right-hand summary panel | TAV `bg-primary` panel (already in `ResultBand`) |
| Similar Vehicles carousel | **MaxBuy evaluation block** (verdict, max buy, economics, actions) |
| Transactions + Historical/Projected | Same section titles and table columns; placeholder → live data later |

### User journey (target)

```text
Open /mmr-lab (any buyer role)
  → Enter VIN OR Year/Make/Model/Trim + mileage (+ optional lane ask price)
  → Search
  → MMR dashboard loads (priority UI)
  → MaxBuy evaluate fires in parallel (same inputs)
  → MaxBuy block fills below MMR dashboard
  → Transactions + Historical sections (shell → live)
```

---

## 2. Locked product decisions (2026-06-10)

| ID | Decision |
|----|----------|
| **MLB-1** | **Route stays `/mmr-lab`** — single combined page for MMR + MaxBuy |
| **MLB-2** | **Buyer-accessible** — remove admin-only guard that redirects to `/opportunities` |
| **MLB-3** | **Parallel fetch on search** — MMR + MaxBuy evaluate together; **MMR has UI priority** (show/skeleton MMR first) |
| **MLB-4** | **MaxBuy runs without VIN** — YMM path (OPEN-5) must work on this page |
| **MLB-5** | **Asking price flows from MMR lookup session** — user enters lane/list price in the MMR search/adjustments context; that value is passed to MaxBuy as `asking_price` for `deal_fit` verdict (not a separate MaxBuy-only form) |
| **MLB-6** | **Full Cox lower sections** — Transactions table + Historical/Projected averages (UI first, API phase 2) |
| **MLB-7** | **Full live MMR adjustments** — odometer, region, grade, color, build options recompute adjusted MMR (API phase 2; UI shows interactive controls in phase 1) |
| **MLB-8** | **UI first** — nail layout and states with mocks/placeholders before wiring all backend |
| **MLB-9** | **Everything else unchanged** — embedded MaxBuy on deal detail, `/maxbuy` page, Opportunities queue, ingest, nav structure beyond access/route updates |

### Asking price clarification (important for implementers)

Cox MMR API responses return **wholesale** (`mmrValue`, `adjustedMmr`, ranges) and optionally **retail** (`retailValue`, retail range). They do **not** return a seller **asking price**.

**MLB-5 means:** the price the buyer is evaluating at the lane is captured **once** in the MMR lookup UI (search bar or adjustments panel — see §4.2) and forwarded to `POST /app/maxbuy/evaluate` as `asking_price`. MaxBuy already uses this for `deal_fit` vs `vehicle_fit` ([`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md), [`IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md) §4.1).

Do **not** silently map `adjustedMmr` or `retailValue` to `asking_price` unless Product explicitly changes MLB-5.

---

## 3. Cox screenshot map → page zones

Reference images in `docs/07-buybox/screenshots mmr cox/`:

### Zone A — Search + vehicle identity (image 1, top)

- VIN input + search button
- Cascading dropdowns: Year → Make → Model → Trim/Style
- Mileage input (required for YMM valuation path)
- Optional **lane ask / list price** input (new — feeds MaxBuy per MLB-5)
- After lookup: vehicle title (YMM + trim), VIN line
- Defer v1: AutoCheck, CARFAX, Print, Learn More (external links)

### Zone B — MMR valuation dashboard (all images, core)

Three columns (existing `ResultBand` pattern in `web/app/(app)/mmr-lab/_components/result-band.tsx`):

| Column | Cox content | TAV v1 UI | TAV v2 API |
|--------|-------------|-----------|------------|
| **Left** | Base MMR, avg odometer, avg condition, EV battery | Live from `POST /app/mmr/vin` or `ymm` | Same |
| **Center** | MMR Adjustments: ODO, Region, Grade, Color, Build options, Clear | **Interactive UI in phase 1**; recompute **phase 2** | New recompute endpoint(s) |
| **Right** | MMR range, Adjusted MMR (hero), Est. retail, Typical range | Live when retail include enabled | Enable `MANHEIM_INCLUDE_RETAIL` + parser (partially done) |

### Zone C1 — MaxBuy evaluation (replaces Cox “Similar Vehicles”)

Full-width section below Zone B. Shows:

- Recommended max buy (hero)
- Verdict badge (`strong_buy` / `buy` / `review` / `pass`) when `deal_fit`
- `vehicle_fit` mode when no asking price (ceiling only)
- Data strength, reason codes
- Economics summary (expected sale, transport, expenses, net)
- TAV historical snippet (`tav_historical` from evaluate response)
- Phase 7 actions: pass, override (when `recommendation_id` exists)
- Loading/error states independent of MMR (parallel fetch)

**Do not** show a Similar Vehicles carousel on this page.

### Zone C2 — Transactions table (image 2 bottom, image 3 top)

Cox columns (keep labels for familiarity):

`Date` · `Price` · `Odo (mi)` · `Grade` · `EVBH` · `Eng/T` · `Ext Color` · `Type` · `Region` · `Auction`

- **Phase 1 UI:** table shell with placeholder rows or “—”
- **Phase 2 data:** see §6.1 (Cox vs TAV vs MarketCheck)

### Zone C3 — Historical / projected averages (image 3 middle)

- **Historical Average:** Past 30 Days, 6 Months Ago, Last Year (price + avg mi each)
- **Projected Average:** Next Month
- **Phase 1 UI:** `AvgSlot` placeholders (already in `data-sections.tsx`)
- **Phase 2 data:** Cox `historical` + `forecast` includes (§6.1)

---

## 4. Current codebase state

### What exists today

| Asset | Path | Notes |
|-------|------|-------|
| MMR Lab page | `web/app/(app)/mmr-lab/page.tsx` | Wrapped in `NewModeOpsGuard` → **non-admins redirected to `/opportunities`** |
| MMR client | `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` | VIN + YMM search, `ResultBand`, empty `DataSections` |
| Result band | `web/app/(app)/mmr-lab/_components/result-band.tsx` | Cox-like 3-column layout; **adjustments disabled** |
| Data sections | `web/app/(app)/mmr-lab/_components/data-sections.tsx` | Placeholder Similar Vehicles, Transactions, Historical |
| Search panel | `web/app/(app)/mmr-lab/_components/search-panel.tsx` | VIN + catalog cascades + mileage |
| Standalone MaxBuy | `web/app/(app)/maxbuy/page.tsx` | Narrow `max-w-2xl` form — **not** Cox layout |
| MaxBuy card | `web/components/maxbuy/maxbuy-card.tsx` | Compact card — reuse **content**, not layout, in Zone C1 |
| MaxBuy live wiring | `web/components/maxbuy/maxbuy-live-card.tsx` | Evaluate mutation + form — extract logic, not page layout |
| MMR API (web) | `web/lib/app-api/client.ts` | `postMmrVin`, `postMmrYmm`, catalog getters |
| MMR API (worker) | `src/app/routes.ts` | `/app/mmr/vin`, `/app/mmr/ymm`, `/app/mmr/catalog/*` |
| MaxBuy API | `POST /app/maxbuy/evaluate` (proxied) | `web/lib/app-api/schemas.ts` → `MaxbuyEvaluateOkSchema` |
| Intel worker | `workers/tav-intelligence-worker/` | Cox Storefront MMR; retail partially parsed |
| Screenshots | `docs/07-buybox/screenshots mmr cox/` | Design reference |

### What blocks buyers today

```tsx
// web/app/(app)/mmr-lab/page.tsx
<NewModeOpsGuard>  // ← redirects non-admin to /opportunities
  <MmrLabClient />
</NewModeOpsGuard>
```

**Phase 1 must remove** `NewModeOpsGuard` from `/mmr-lab` (MLB-2).

### Nav today

- Buyers see **Max buy** → `/maxbuy` (`web/lib/app-shell/nav-new.ts` `buyerNavItems`)
- Admins see **Value a vehicle** → `/mmr-lab` under “More tools” (`opsNavItems`)

**Phase 1 nav change (recommended):**

- Buyer nav: point **Value a vehicle** (or rename **Max buy**) → `/mmr-lab`
- `/maxbuy`: redirect to `/mmr-lab` **or** keep as thin alias (product choice; default: redirect)

---

## 5. Implementation phases

### Phase 1 — UI & layout (ship first)

**Goal:** Cox IA on `/mmr-lab`, buyer-accessible, design-reviewable without new backend.

| Task | Detail |
|------|--------|
| P1.1 | Remove `NewModeOpsGuard` from `mmr-lab/page.tsx` |
| P1.2 | Widen page layout — remove `max-w-2xl` constraint; full-width dashboard like Cox |
| P1.3 | Refactor `MmrLabClient` into zones A / B / C1 / C2 / C3 (new folder `_components/zones/` or similar) |
| P1.4 | Zone A: add optional **Lane ask / List price** field; keep existing VIN + YMM search |
| P1.5 | Zone B: enable **visual** adjustment controls (not wired to API yet); show loading skeleton on search |
| P1.6 | Zone C1: new `MaxbuyEvaluationSection` — mock states: empty, loading, ready (`deal_fit` + `vehicle_fit`), error, disabled |
| P1.7 | Zone C2/C3: upgrade `DataSections` — remove Similar Vehicles; keep Transactions + Historical shells with realistic empty/loading states |
| P1.8 | Parallel fetch **stub**: on search, call real MMR APIs; MaxBuy section uses **mock snapshot** or defers evaluate until phase 2 (toggle `USE_MOCK_MAXBUY` in dev optional) |
| P1.9 | Update buyer nav → `/mmr-lab`; redirect `/maxbuy` → `/mmr-lab` |
| P1.10 | Update `maxbuy-card.tsx` link text “deep lookup” → still `/mmr-lab` |
| P1.11 | Responsive: stack 3-column dashboard on mobile; table horizontal scroll |
| P1.12 | Tests: page renders for non-admin session; zones visible; no redirect to opportunities |

**Phase 1 exit criteria:**

- Any authenticated buyer can open `/mmr-lab` without redirect
- Layout matches §3 zones (screenshot review against Cox refs)
- MMR search still works (VIN + YMM)
- MaxBuy zone shows designed states (mock OK)
- Transactions + Historical show structured placeholders
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass in `web/`

### Phase 2 — Wire live functionality

| Task | Detail |
|------|--------|
| P2.1 | On search: fire `postMmrVin` / `postMmrYmm` **and** `postMaxbuyEvaluate` in parallel |
| P2.2 | Build MaxBuy request from MMR session state (VIN or YMM + mileage + region + `asking_price` from lane field) |
| P2.3 | MMR priority: render Zone B from MMR promise first; Zone C1 updates when evaluate resolves |
| P2.4 | Error isolation: MMR failure does not block MaxBuy zone message (and vice versa) |
| P2.5 | YMM-only MaxBuy: no VIN required ([`maxbuy-evaluate-form.tsx`](../../web/components/maxbuy/maxbuy-evaluate-form.tsx) `buildMaxbuyEvaluateRequest` pattern) |
| P2.6 | Reuse `mapMaxbuyEvaluateToSnapshot` + expand Zone C1 to show full economics from `MaxbuyEvaluateOkSchema` |
| P2.7 | Pass/override actions when evaluate returns `recommendation_id` |

### Phase 3 — MMR adjustments (live recompute)

Cox center panel changes adjusted MMR when ODO/region/grade/color/build options change.

| Task | Detail |
|------|--------|
| P3.1 | Extend intelligence worker or main worker with `POST /app/mmr/recompute` (or extend `vin`/`ymm` with adjustment params) |
| P3.2 | Pass adjustment fields to Cox Storefront per [`manheim-cox.md`](../03-api/manheim-cox.md) |
| P3.3 | Wire Zone B controls → debounced recompute → update Zone B right panel |
| P3.4 | Lane ask price in adjustments/search → updates MaxBuy `asking_price` on re-evaluate |

**Note:** Today `result-band.tsx` documents adjustments as disabled pending issue #45 / recompute endpoint.

### Phase 4 — Transactions + Historical/Projected (full Cox data)

See §6 for data-source strategy.

| Task | Detail |
|------|--------|
| P4.1 | Enable `MANHEIM_INCLUDE_HISTORICAL`, `MANHEIM_INCLUDE_FORECAST` on intelligence worker (production smoke first) |
| P4.2 | Parse `historicalAverages`, `forecast`, and transaction/sample arrays from Cox payload in intel worker + main worker app envelope |
| P4.3 | Extend `MmrVinOkSchema` / `MmrYmmOk` web schemas with `transactions[]`, `historicalAverages`, `projectedAverage` |
| P4.4 | Wire `DataSections` / Zone C2/C3 to live fields |
| P4.5 | Optional MarketCheck enrichment (§6.2) — separate spike, not blocking |

---

## 6. Data sources — Transactions & market context

### 6.1 Three different “comp” concepts

| Source | What it is | Best for on this page |
|--------|------------|------------------------|
| **Cox/Manheim MMR transactions** | Wholesale auction sale comps (same ecosystem as MMR) | Zone C2 **Transactions** table — **primary for Cox parity** |
| **TAV `purchase_outcomes`** | 57k internal buy/sell outcomes | Zone C1 MaxBuy `tav_historical` (already in evaluate API); optional separate “TAV history” mini-table — **not** a substitute for Cox Transactions |
| **MarketCheck API** | Retail listing/market data (specs, listings, days on market, retail price context) | Enrichment spike (#19 in [`STATUS.md`](STATUS.md)); see §6.2 |

**Do not mix** wholesale auction comps (Cox) with retail listings (MarketCheck) in the same table without clear labeling.

### 6.2 MarketCheck — when and how (optional enrichment)

Per [`ARCHITECTURE.md`](ARCHITECTURE.md) §4.5:

- MarketCheck is **not** a v1 hard dependency for MaxBuy math
- MMR remains wholesale anchor; TAV outcomes remain proprietary signal
- MarketCheck may improve: VIN decode confidence, trim/spec validation, retail market context, data-strength badges

**Potential uses on `/mmr-lab` (phase 4+):**

| Use | Section | Value |
|-----|---------|-------|
| Retail listing comps | New subsection or augment Zone C2 | “Retail market” context alongside wholesale |
| VIN decode / trim validation | Zone A | Pre-fill YMM when VIN entered |
| Listing price suggestion | Zone A lane ask | Hint for MLB-5 (never auto-set ask without user confirm) |
| Similar vehicles (retail) | Optional tab | Only if Product wants retail comps **in addition to** MaxBuy block — **not** replacing Zone C1 |

**Spike checklist before wiring MarketCheck:**

1. Confirm API package, rate limits, cost, caching policy
2. Confirm retention/redistribution rights for UI display
3. Store credentials in Cloudflare secrets only
4. Graceful degradation when MarketCheck fails (MMR + MaxBuy still work)
5. Document new fields in `docs/03-api/` — do not overload `MmrVinOkSchema` without versioning

### 6.3 Cox historical / projected

From Cox `include=historical,forecast` ([`manheim-cox.md`](../03-api/manheim-cox.md) §5):

- `historicalAverages` → Zone C3 left (30d / 6mo / 1yr)
- `forecast` → Zone C3 right (next month)
- Parser work required in `workers/tav-intelligence-worker` (flags exist; **not yet read**)

---

## 7. API contracts (reference)

### MMR lookup (existing)

| Endpoint | Purpose |
|----------|---------|
| `GET /app/mmr/catalog/years` | Catalog cascade |
| `GET /app/mmr/catalog/makes?year=` | |
| `GET /app/mmr/catalog/models?year=&make=` | |
| `GET /app/mmr/catalog/styles?year=&make=&model=` | |
| `POST /app/mmr/vin` | VIN valuation |
| `POST /app/mmr/ymm` | YMM + style + mileage valuation |

**Web proxy:** `web/app/api/app/[...path]/route.ts` → Worker `APP_API_BASE_URL`

**Response fields used in Zone B today:** `mmrValue`, `adjustedMmr`, `rangeLow`, `rangeHigh`, `retailValue`, `retailRangeLow`, `retailRangeHigh`, `avgOdometer`, `avgCondition`, `confidence`, `method`

### MaxBuy evaluate (existing)

`POST /app/maxbuy/evaluate` — see `MaxbuyEvaluateOkSchema` in `web/lib/app-api/schemas.ts`

**Request fields for this page:**

```typescript
// VIN path
{ contract_version: "1.0.0", vin, mileage?, asking_price?, region? }

// YMM path (no VIN)
{ contract_version: "1.0.0", year, make, model, trim?, mileage, asking_price?, region? }
```

**Parallel fetch pseudocode:**

```typescript
const [mmr, maxbuy] = await Promise.allSettled([
  vin ? postMmrVin({ vin, mileage }) : postMmrYmm({ year, make, model, style, mileage }),
  postMaxbuyEvaluate(buildFromSession(session)), // includes asking_price from lane field
]);
// Render MMR from mmr immediately; merge maxbuy when settled
```

### New APIs (phase 3–4 — design only)

| Endpoint | Phase | Purpose |
|----------|-------|---------|
| `POST /app/mmr/recompute` | P3 | Adjustments → new adjusted MMR |
| Extended MMR response | P4 | `transactions`, `historicalAverages`, `forecast` |
| `POST /app/marketcheck/enrich` (TBD) | P4+ | Optional MarketCheck proxy |

---

## 8. File map for agents

### Modify (phase 1)

| File | Change |
|------|--------|
| `web/app/(app)/mmr-lab/page.tsx` | Remove ops guard; page title/description |
| `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` | Orchestrate zones + parallel fetch |
| `web/app/(app)/mmr-lab/_components/result-band.tsx` | Enable adjustment UI (visual); optional props for loading |
| `web/app/(app)/mmr-lab/_components/data-sections.tsx` | Remove Similar Vehicles; rename zones C2/C3 |
| `web/app/(app)/mmr-lab/_components/search-panel.tsx` | Add lane ask price field |
| `web/lib/app-shell/nav-new.ts` | Buyer nav → `/mmr-lab` |
| `web/app/(app)/maxbuy/page.tsx` | Redirect to `/mmr-lab` (optional) |

### Create (phase 1)

| File | Purpose |
|------|---------|
| `web/app/(app)/mmr-lab/_components/maxbuy-evaluation-section.tsx` | Zone C1 full layout |
| `web/app/(app)/mmr-lab/_components/transactions-table.tsx` | Zone C2 |
| `web/app/(app)/mmr-lab/_components/historical-projected.tsx` | Zone C3 |
| `web/app/(app)/mmr-lab/_components/mmr-lab-page.test.tsx` | Buyer access + zone smoke tests |
| `web/lib/mmr-lab/session.ts` (optional) | Shared session state: identity, adjustments, asking price |

### Reuse (do not duplicate business logic)

| Module | Use |
|--------|-----|
| `web/components/maxbuy/map-snapshot.ts` | API → display model |
| `web/components/maxbuy/maxbuy-card-actions.tsx` | Pass/override |
| `web/components/maxbuy/use-maxbuy-evaluate.ts` | Evaluate mutation |
| `web/app/(app)/mmr-lab/_components/mmr-value.tsx` | Money/range formatting |

### Do not change (MLB-9)

| Area | Reason |
|------|--------|
| `web/app/(app)/opportunities/**` deal detail MaxBuy embed | Stays compact card |
| `web/components/maxbuy/maxbuy-live-card.tsx` on deal detail | Embedded variant unchanged |
| Ingest pipeline, leads, opportunities API | Out of scope |
| `workers/maxbuy-worker/` scoring logic | Unless evaluate contract extends |

---

## 9. UI states & acceptance checklist

### Zone B (MMR) states

- `idle` — before search
- `loading` — skeleton 3-column
- `ok` — values populated
- `unavailable` — `missingReason` badge (graceful, no crash)
- `error` — retry button

### Zone C1 (MaxBuy) states

- `idle` — prompt “Search to run Max buy”
- `loading` — skeleton card below MMR
- `ready_deal_fit` — verdict + delta to ask
- `ready_vehicle_fit` — max buy ceiling only (no asking price)
- `unavailable` — API off / `MAXBUY_EVALUATE_ENABLED`
- `error` — isolated from MMR error

### Phase 1 review checklist (human)

- [ ] Compare layout to Cox screenshots side-by-side
- [ ] Buyer account opens `/mmr-lab` (no redirect)
- [ ] VIN search populates Zone B
- [ ] YMM search works without VIN
- [ ] Lane ask field visible; documented where it sits
- [ ] MaxBuy zone visually distinct from MMR (not confused with retail)
- [ ] No Similar Vehicles section
- [ ] Transactions table columns match Cox
- [ ] Mobile layout acceptable

### Verification commands

```bash
cd web
pnpm lint
pnpm typecheck
pnpm test
# After phase 2+
pnpm test:e2e -- mmr-lab
```

---

## 10. Architecture constraints (always)

```text
Raw Listing → Normalized Listing → Vehicle Candidate → Lead
                                              ↘
                        MaxBuy Recommendation (tav.maxbuy_*)
```

- MaxBuy evaluate on this page is **on-demand** — does not create leads or mutate ingest tables
- MMR lookup uses **Cox/Manheim** via `tav-intelligence-worker` — never log secrets ([`manheim-cox.md`](../03-api/manheim-cox.md) §6)
- Four-concept boundary unchanged ([`system-overview.md`](../01-architecture/system-overview.md))

---

## 11. Related docs

| Doc | Link |
|-----|------|
| MaxBuy technical spec | [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) |
| MaxBuy status | [`STATUS.md`](STATUS.md) |
| Unified implementation plan | [`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md) |
| Cox/Manheim integration | [`../03-api/manheim-cox.md`](../03-api/manheim-cox.md) |
| App API contract | [`../03-api/app-api.md`](../03-api/app-api.md) |
| Workflow UI redesign | [`../02-product/workflow-and-ui-redesign.md`](../02-product/workflow-and-ui-redesign.md) |
| MB-4 (keep MMR + MaxBuy complementary) | [`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md) §3.2 |

---

## 12. Open items (not blocking phase 1 UI)

| ID | Item | Owner |
|----|------|-------|
| OPEN-MLB-1 | Exact label for lane price field (“Lane ask”, “List price”, “Your bid”) | Product |
| OPEN-MLB-2 | Buyer nav label: “Value a vehicle” vs “Max buy” vs combined | Product |
| OPEN-MLB-3 | MarketCheck spike results + which subsection gets retail comps | Data/Eng |
| OPEN-MLB-4 | Whether `/maxbuy` 301 redirects or nav item removed | Product |
| OPEN-MLB-5 | AutoCheck/CARFAX/Print links — ever? | Product |

---

## 13. Agent prompt (copy into Cursor)

```text
Implement Phase 1 of docs/07-buybox/MMR-LAB-MAXBUY-PAGE.md:

- Make /mmr-lab buyer-accessible (remove NewModeOpsGuard)
- Rebuild page into Cox IA zones A/B/C1/C2/C3 per the spec
- Replace Similar Vehicles with MaxBuy evaluation section (mock states OK)
- UI first — real parallel MaxBuy wiring is Phase 2
- TAV design system, not pixel Cox clone
- Do not change deal detail embedded MaxBuy or opportunities workflow
- Run web lint, typecheck, test before done
```

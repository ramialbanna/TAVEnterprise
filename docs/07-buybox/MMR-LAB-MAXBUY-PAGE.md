# MMR Lab + MaxBuy — Combined Page Spec

**Status:** Phase 4 **complete on `main`** (2026-06-11) — historical/forecast wired; transactions parser ready when Cox returns rows  
**Last updated:** 2026-06-11 (Phase 4 Cox market context on `/mmr-lab` C2/C3)  
**Route:** `/mmr-lab` (canonical; buyer-accessible)  
**Shipped commits:** `a6ad7ef` (P1.1), `44c4c48`/`e35fa02` (P1.9 partial), `04ed30e` (P1.4–P1.11 UI), `dea5957` (CI fix), `eedabbc` (P2.1–P2.7 live MaxBuy), `223aa49` (P3.1–P3.3 live adjustments), `e1a511f` (deploy lint fix)
**Audience:** Cursor agents, solo dev, reviewers  
**Reference screenshots:** `docs/07-buybox/screenshots mmr cox/` (`image.png`, `image copy.png`, `image copy 2.png`)

> **Agent entry point:** Read this file before touching `/mmr-lab`, MaxBuy standalone UI, MMR adjustments, or buyer nav for valuation tools. Phases 1–3 are shipped on `main`; Phase 4 (Cox transactions + historical/forecast) is next.

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
  → User adjusts ODO/region/grade/color/build → debounced MMR recompute updates adjusted panel (P3 ✅)
  → Transactions + Historical sections (shell → live in Phase 4)
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
| **MLB-7** | **Full live MMR adjustments** — odometer, region, grade, color, build options recompute adjusted MMR via Cox query params on `vin`/`ymm` (P3 ✅) |
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
| **Center** | MMR Adjustments: ODO, Region, Grade, Color, Build options, Clear | **Live debounced recompute** (P3 ✅) | Optional `adjustments` on `POST /app/mmr/vin` and `ymm` |
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

## 4. Current codebase state (2026-06-10)

### What exists today

| Asset | Path | Notes |
|-------|------|-------|
| MMR Lab page | `web/app/(app)/mmr-lab/page.tsx` | **Buyer-accessible** — no `NewModeOpsGuard` (P1.1 ✅) |
| MMR client | `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` | Zones A–C3; **MMR + MaxBuy parallel evaluate** (P2 ✅); **debounced adjustment recompute** (P3 ✅) |
| Search panel | `web/app/(app)/mmr-lab/_components/search-panel.tsx` | VIN + YMM cascade + mileage + **lane ask price** (P1.4 ✅) |
| Result band | `web/app/(app)/mmr-lab/_components/result-band.tsx` | 3-column Cox layout; **live adjustment controls** + `recomputing` right-panel state (P3 ✅) |
| MMR adjustments | `web/app/(app)/mmr-lab/_components/mmr-adjustments.ts` | UI model + `mapMmrAdjustmentsToApi` → Cox params (P3 ✅) |
| MMR recompute builder | `web/app/(app)/mmr-lab/_components/build-mmr-recompute-request.ts` | Session + adjustments → `postMmrVin` / `postMmrYmm` body (P3 ✅) |
| MaxBuy section | `web/app/(app)/mmr-lab/_components/maxbuy-evaluation-section.tsx` | Zone C1 — live evaluate display + pass/override actions (P2 ✅) |
| MaxBuy request builder | `web/app/(app)/mmr-lab/_components/build-mmr-lab-maxbuy-request.ts` | Session → `POST /app/maxbuy/evaluate` body (P2.2 ✅) |
| MaxBuy result mapper | `web/app/(app)/mmr-lab/_components/apply-maxbuy-result.ts`, `map-maxbuy-display.ts` | API → Zone C1 display via `mapMaxbuyEvaluateToSnapshot` (P2.6 ✅) |
| MaxBuy mock | `web/app/(app)/mmr-lab/_components/maxbuy-evaluation-mock.ts` | **Tests only** — component unit tests; runtime uses live API |
| Transactions | `web/app/(app)/mmr-lab/_components/transactions-table.tsx` | Zone C2 — idle/loading/empty shells (P1.7 ✅) |
| Historical/projected | `web/app/(app)/mmr-lab/_components/historical-projected.tsx` | Zone C3 — price + avg mi placeholders (P1.7 ✅) |
| Data sections | `web/app/(app)/mmr-lab/_components/data-sections.tsx` | Composes C2 + C3; **Similar Vehicles removed** |
| Section state | `web/app/(app)/mmr-lab/_components/mmr-lower-section-state.ts` | Maps MMR view → C2/C3 idle/loading/empty |
| Standalone MaxBuy | `web/app/(app)/maxbuy/page.tsx` | Still narrow `max-w-2xl` form — **not redirected** (OPEN-MLB-4) |
| MaxBuy card | `web/components/maxbuy/maxbuy-card.tsx` | “deep lookup” → `/mmr-lab` (P1.10 ✅) |
| Buyer nav | `web/lib/app-shell/nav-new.ts` | **MMR Lab** + **Max buy** both in sidebar (P1.9 partial) |
| Tests | `mmr-lab-page.test.tsx`, `mmr-lab-client.test.tsx`, component tests | Buyer access + zones (P1.12 ✅) |
| MMR API (web) | `web/lib/app-api/client.ts` | `postMmrVin`, `postMmrYmm` (+ optional `adjustments`), catalog getters |
| MMR API (worker) | `src/app/routes.ts`, `workers/tav-intelligence-worker` | `adjustments` proxied to Cox; VIN returns full distribution fields (P3 ✅) |
| MaxBuy API | `POST /app/maxbuy/evaluate` | **Wired on `/mmr-lab`** — parallel with MMR; lane ask re-evaluates (P2 ✅); odometer adjustment re-evaluates (P3 ✅) |

### Resolved (was blocking earlier phases)

- ~~`NewModeOpsGuard` on `/mmr-lab`~~ — removed in P1.1
- ~~Similar Vehicles placeholder~~ — removed; Zone C1 is MaxBuy evaluation
- ~~Adjustments preview-only~~ — live Cox recompute on debounced change (P3 ✅)
- ~~Separate `POST /app/mmr/recompute`~~ — shipped as optional `adjustments` on existing `vin`/`ymm` endpoints (P3 ✅)

### Nav (product choice pending)

- Buyers see **MMR Lab** → `/mmr-lab` and **Max buy** → `/maxbuy` (commit `e35fa02` kept both)
- **Not done:** `/maxbuy` redirect to `/mmr-lab` — see OPEN-MLB-4


---

## 5. Implementation phases

### Phase 1 — UI & layout (ship first)

**Goal:** Cox IA on `/mmr-lab`, buyer-accessible, design-reviewable without new backend.

| Task | Detail | Status |
|------|--------|--------|
| P1.1 | Remove `NewModeOpsGuard` from `mmr-lab/page.tsx` | ✅ |
| P1.2 | Widen page layout — remove `max-w-2xl` constraint; full-width dashboard like Cox | ✅ |
| P1.3 | Refactor `MmrLabClient` into zones A / B / C1 / C2 / C3 (new folder `_components/zones/` or similar) | ⬜ Optional — zones exist as separate components; no `zones/` folder |
| P1.4 | Zone A: add optional **Lane ask / List price** field; keep existing VIN + YMM search | ✅ |
| P1.5 | Zone B: enable adjustment controls (visual in P1; **live recompute in P3**); loading skeleton on search | ✅ |
| P1.6 | Zone C1: new `MaxbuyEvaluationSection` — mock states: empty, loading, ready (`deal_fit` + `vehicle_fit`), error, disabled | ✅ (mock; `unavailable` state in component, not wired to system status) |
| P1.7 | Zone C2/C3: upgrade `DataSections` — remove Similar Vehicles; keep Transactions + Historical shells with realistic empty/loading states | ✅ |
| P1.8 | Parallel fetch **stub**: on search, call real MMR APIs; MaxBuy section uses **mock snapshot** or defers evaluate until phase 2 (toggle `USE_MOCK_MAXBUY` in dev optional) | ✅ |
| P1.9 | Update buyer nav → `/mmr-lab`; redirect `/maxbuy` → `/mmr-lab` | ⚠️ Partial — MMR Lab in buyer nav; `/maxbuy` still separate (OPEN-MLB-4) |
| P1.10 | Update `maxbuy-card.tsx` link text “deep lookup” → still `/mmr-lab` | ✅ |
| P1.11 | Responsive: stack 3-column dashboard on mobile; table horizontal scroll | ✅ |
| P1.12 | Tests: page renders for non-admin session; zones visible; no redirect to opportunities | ✅ |

**Phase 1 exit criteria:**

- [x] Any authenticated buyer can open `/mmr-lab` without redirect
- [ ] Layout matches §3 zones (screenshot review against Cox refs) — **human review pending**
- [x] MMR search still works (VIN + YMM)
- [x] MaxBuy zone shows designed states (live evaluate in Phase 2)
- [x] Transactions + Historical show structured placeholders
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass in `web/` (after `dea5957` CI fix)

### Phase 2 — Wire live functionality

| Task | Detail | Status |
|------|--------|--------|
| P2.1 | On search: fire `postMmrVin` / `postMmrYmm` **and** `postMaxbuyEvaluate` in parallel | ✅ |
| P2.2 | Build MaxBuy request from MMR session state (VIN or YMM + mileage + region + `asking_price` from lane field) | ✅ |
| P2.3 | MMR priority: render Zone B from MMR promise first; Zone C1 updates when evaluate resolves | ✅ |
| P2.4 | Error isolation: MMR failure does not block MaxBuy zone message (and vice versa) | ✅ |
| P2.5 | YMM-only MaxBuy: no VIN required ([`maxbuy-evaluate-form.tsx`](../../web/components/maxbuy/maxbuy-evaluate-form.tsx) `buildMaxbuyEvaluateRequest` pattern) | ✅ |
| P2.6 | Reuse `mapMaxbuyEvaluateToSnapshot` + expand Zone C1 to show full economics from `MaxbuyEvaluateOkSchema` | ✅ |
| P2.7 | Pass/override actions when evaluate returns `recommendation_id` | ✅ |

**Phase 2 exit criteria:**

- [x] Search fires MMR + MaxBuy evaluate in parallel (`Promise.allSettled`)
- [x] Lane ask price forwarded as `asking_price`; changing ask re-runs evaluate
- [x] YMM path works without VIN
- [x] MMR error does not suppress MaxBuy results (and vice versa handled)
- [x] Zone C1 shows economics, TAV historical, verdict, pass/override when `recommendation_id` present
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass in `web/`

### Phase 3 — MMR adjustments (live recompute)

Cox center panel changes adjusted MMR when ODO/region/grade/color/build options change.

| Task | Detail | Status |
|------|--------|--------|
| P3.1 | Extend `POST /app/mmr/vin` and `POST /app/mmr/ymm` with optional `adjustments` (no separate recompute route) | ✅ |
| P3.2 | Pass `region`, `grade`, `color`, `exclude_build`, `evbh` to Cox via `manheimHttp.appendCoxQueryParams` per [`manheim-cox.md`](../03-api/manheim-cox.md) | ✅ |
| P3.3 | Wire Zone B controls → 400ms debounced recompute → update right panel (`recomputing` skeleton on adjusted MMR) | ✅ |
| P3.4 | Lane ask in search panel re-runs MaxBuy (P2 ✅); **adjustment odometer** re-runs MaxBuy evaluate with updated mileage | ✅ |

**Implementation notes (P3):**

- Adjustment lookups **bypass KV cache** (do not overwrite base VIN/YMM entries).
- VIN cache keys include **mileage bucket** so odometer changes fetch fresh Cox values.
- Cox MMR **region** names (National, Southeast, …) are **not** forwarded to MaxBuy evaluate (TAV uses `dallas_tx`-style regions).
- `POST /app/mmr/vin` now returns the same distribution fields as YMM (`adjustedMmr`, ranges, retail when enabled).

**Phase 3 exit criteria:**

- [x] Changing region/grade/color/build/ODO triggers debounced MMR recompute
- [x] Adjusted MMR + range panel updates from live Cox response
- [x] Odometer adjustment re-runs MaxBuy when mileage changes
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass in repo root + `web/`

### Phase 4 — Transactions + Historical/Projected (full Cox data)

See §6 for data-source strategy.

| Task | Detail |
|------|--------|
| P4.1 | Enable `MANHEIM_INCLUDE_HISTORICAL`, `MANHEIM_INCLUDE_FORECAST` on intelligence worker (production smoke first) | ✅ staging + production vars |
| P4.2 | Parse `historicalAverages`, `forecast`, and transaction/sample arrays from Cox payload in intel worker + main worker app envelope | ✅ `manheimMarketContextParser.ts` + `mapIntelMmrEnvelopeToAppData` |
| P4.3 | Extend `MmrVinOkSchema` / `MmrYmmOk` web schemas with `transactions[]`, `historicalAverages`, `projectedAverage` | ✅ |
| P4.4 | Wire `DataSections` / Zone C2/C3 to live fields | ✅ |
| P4.5 | Optional MarketCheck enrichment (§6.2) — separate spike, not blocking | ⬜ |

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
| `POST /app/mmr/vin` | VIN valuation (+ optional `adjustments` for recompute) |
| `POST /app/mmr/ymm` | YMM + style + mileage valuation (+ optional `adjustments`) |

**Web proxy:** `web/app/api/app/[...path]/route.ts` → Worker `APP_API_BASE_URL`

**Optional `adjustments` body (P3):**

```typescript
{
  region?: string;        // e.g. "Southeast"
  grade?: string;         // e.g. "4.0"
  color?: string;         // e.g. "Black"
  exclude_build?: boolean; // false when user selects Build Options YES
  evbh?: number;          // Express grade 75–100
}
```

**Response fields used in Zone B:** `mmrValue`, `adjustedMmr`, `rangeLow`, `rangeHigh`, `retailValue`, `retailRangeLow`, `retailRangeHigh`, `avgOdometer`, `avgCondition`, `mileageUsed`, `confidence`, `method`

### MaxBuy evaluate (existing)

`POST /app/maxbuy/evaluate` — see `MaxbuyEvaluateOkSchema` in `web/lib/app-api/schemas.ts`

**Request fields for this page:**

```typescript
// VIN path
{ contract_version: "1.0.0", vin, mileage?, asking_price?, region? }

// YMM path (no VIN)
{ contract_version: "1.0.0", year, make, model, trim?, mileage, asking_price?, region? }
```

**Parallel fetch pseudocode (search):**

```typescript
const [mmr, maxbuy] = await Promise.allSettled([
  vin ? postMmrVin({ vin, mileage }) : postMmrYmm({ year, make, model, style, mileage }),
  postMaxbuyEvaluate(buildFromSession(session)), // includes asking_price from lane field
]);
// Render MMR from mmr immediately; merge maxbuy when settled
```

**Adjustment recompute pseudocode (P3 — debounced 400ms after Zone B change):**

```typescript
const body = buildMmrRecomputeRequest(session, adjustments); // maps UI → vin/ymm + adjustments
const mmr = await (session.vin ? postMmrVin(body) : postMmrYmm(body));
// Update Zone B right panel; re-run MaxBuy if adjustment odometer changed
```

### APIs still to build (phase 4+)

| Endpoint / extension | Phase | Purpose |
|----------|-------|---------|
| Extended MMR response | P4 | `transactions`, `historicalAverages`, `forecast` |
| `POST /app/marketcheck/enrich` (TBD) | P4+ | Optional MarketCheck proxy |

---

## 8. File map for agents

### Modify (phase 1)

| File | Change | Status |
|------|--------|--------|
| `web/app/(app)/mmr-lab/page.tsx` | Remove ops guard; page title/description | ✅ |
| `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` | Zones + parallel MMR/MaxBuy + debounced adjustment recompute | ✅ |
| `web/app/(app)/mmr-lab/_components/result-band.tsx` | Live adjustment UI; `recomputing` right-panel state | ✅ |
| `web/app/(app)/mmr-lab/_components/data-sections.tsx` | Remove Similar Vehicles; compose C2/C3 | ✅ |
| `web/app/(app)/mmr-lab/_components/search-panel.tsx` | Add lane ask price field | ✅ |
| `web/lib/app-shell/nav-new.ts` | Buyer nav → `/mmr-lab` | ✅ (both MMR Lab + Max buy) |
| `web/app/(app)/maxbuy/page.tsx` | Redirect to `/mmr-lab` (optional) | ⬜ OPEN-MLB-4 |

### Create (phase 1)

| File | Purpose | Status |
|------|---------|--------|
| `web/app/(app)/mmr-lab/_components/maxbuy-evaluation-section.tsx` | Zone C1 full layout | ✅ |
| `web/app/(app)/mmr-lab/_components/maxbuy-evaluation-mock.ts` | Phase 1 mock builder | ✅ |
| `web/app/(app)/mmr-lab/_components/transactions-table.tsx` | Zone C2 | ✅ |
| `web/app/(app)/mmr-lab/_components/historical-projected.tsx` | Zone C3 | ✅ |
| `web/app/(app)/mmr-lab/_components/mmr-adjustments.ts` | Adjustment model + options | ✅ |
| `web/app/(app)/mmr-lab/_components/mmr-lower-section-state.ts` | C2/C3 state from MMR view | ✅ |
| `web/app/(app)/mmr-lab/mmr-lab-page.test.tsx` | Buyer access smoke test | ✅ |
| `web/lib/mmr-lab/session.ts` (optional) | Shared session state | ⬜ Skipped — state lives in `mmr-lab-client` |

### Create (phase 2)

| File | Purpose | Status |
|------|---------|--------|
| `web/app/(app)/mmr-lab/_components/build-mmr-lab-maxbuy-request.ts` | Session → evaluate request body | ✅ |
| `web/app/(app)/mmr-lab/_components/apply-maxbuy-result.ts` | API result → Zone C1 state | ✅ |
| `web/app/(app)/mmr-lab/_components/map-maxbuy-display.ts` | `MaxbuyEvaluateOk` → display model | ✅ |
| `web/app/(app)/mmr-lab/_components/build-mmr-lab-maxbuy-request.test.ts` | Request builder unit tests | ✅ |

### Create (phase 3)

| File | Purpose | Status |
|------|---------|--------|
| `web/app/(app)/mmr-lab/_components/build-mmr-recompute-request.ts` | Adjustments → `postMmrVin` / `postMmrYmm` body | ✅ |
| `web/app/(app)/mmr-lab/_components/build-mmr-recompute-request.test.ts` | Recompute request builder tests | ✅ |
| `src/types/intelligence.ts` (`MmrLookupAdjustmentsSchema`) | Shared adjustment contract (intel + app API) | ✅ |
| `workers/tav-intelligence-worker/src/clients/manheimHttp.ts` | Cox `region`/`grade`/`color`/`excludeBuild` query params | ✅ |
| `workers/tav-intelligence-worker/src/services/mmrLookup.ts` | Cache bypass + mileage-bucket VIN keys for adjustments | ✅ |
| `src/app/routes.ts` (`fetchIntelMmrLookup`) | Unified VIN/YMM proxy + distribution mapping | ✅ |

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
- `loading` — skeleton 3-column (initial search)
- `ready` — values populated; adjustment controls enabled
- `recomputing` — right panel “Updating…” skeleton; controls temporarily disabled (P3 ✅)
- `unavailable` — `missingReason` badge (graceful, no crash)
- `error` — retry button

### Zone C1 (MaxBuy) states

- `idle` — prompt “Search to run Max buy”
- `loading` — skeleton card below MMR
- `ready` — `display.snapshot.displayState` is `deal_fit` (verdict + delta) or `vehicle_fit` (ceiling only)
- `unavailable` — API off / `MAXBUY_EVALUATE_ENABLED`
- `error` — isolated from MMR error

### Phase 1 review checklist (human)

- [ ] Compare layout to Cox screenshots side-by-side
- [x] Buyer account opens `/mmr-lab` (no redirect)
- [x] VIN search populates Zone B
- [x] YMM search works without VIN
- [x] Lane ask field visible; documented where it sits
- [x] MaxBuy zone visually distinct from MMR (not confused with retail)
- [x] No Similar Vehicles section
- [x] Transactions table columns match Cox
- [x] Adjustment controls recompute adjusted MMR from Cox (P3)
- [ ] Mobile layout acceptable — **human review pending**

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
Implement Phase 4 of docs/07-buybox/MMR-LAB-MAXBUY-PAGE.md:

- Enable MANHEIM_INCLUDE_HISTORICAL and MANHEIM_INCLUDE_FORECAST on intelligence worker (smoke first)
- Parse historicalAverages, forecast, and transaction arrays from Cox payload in intel + app envelope
- Extend MmrVinOkSchema with transactions[], historicalAverages, projectedAverage
- Wire DataSections / Zone C2/C3 to live fields
- Run web lint, typecheck, test before done (see .cursor/rules/web-ci-react-effects.mdc)
```

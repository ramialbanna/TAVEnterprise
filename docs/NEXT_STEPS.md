# Next Steps — MMR Lab

**Last updated:** 2026-06-13 (MaxBuy plain-language explanation shipped) · **Focus:** `/mmr-lab` buyer experience

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

| # | Item | Status |
|---|------|--------|
| **1** | VIN search autofills Year/Make/Model; user can switch to YMM lookup | [x] |
| **2** | Manheim Transactions (Cox sold comps — same as Manheim MMR tool) | [ ] |
| **3** | MaxBuy plain-language explanation (why this number) | [x] |

---

## 1 — VIN autofill + YMM switch

**Goal:** When a buyer enters a VIN and searches, the Year / Make / Model / Style dropdowns populate from the lookup result. The buyer can then change those fields and run a **YMM valuation** without re-entering the VIN.

**Current behavior:** VIN search runs MMR + MaxBuy but leaves YMM dropdowns empty. YMM path is a separate manual flow.

**Likely approach:**

- After a successful `POST /app/mmr/vin`, map response fields (`year`, `make`, `model`, `trim`/`style`) into `selection` state and load catalog options for that YMM chain.
- Keep VIN in the search bar as reference; track lookup mode (`vin` vs `ymm`) so a style/mileage change can re-run YMM without losing context.
- Mileage from VIN response or adjustments should carry into YMM search when the user switches.

**Locked (2026-06-12):**

- **DEC-MLB-1** — When the user switches to YMM lookup, the **VIN stays visible and read-only** (reference only; not cleared).
- **DEC-MLB-6** — If Cox trim doesn’t match a catalog style exactly, **select the closest style** but **tell the user** — e.g. badge or note: “Style approximated — Cox trim didn’t match catalog exactly.” Store whether match was `exact` vs `approximate` for debugging.

**Exit criteria:**

- [x] VIN search fills Year, Make, Model, Style (where Cox returns them)
- [x] VIN field remains read-only after search; user edits YMM dropdowns to run a separate YMM lookup
- [x] Approximate style match surfaces visible notice to buyer (not silent)
- [x] User can edit dropdowns and click Value / Search to run YMM lookup
- [x] MaxBuy re-evaluates on the active lookup path
- [x] Tests cover VIN → autofill → YMM re-lookup (including approximate style path)

---

## 2 — Manheim Transactions (Cox sold comps)

**Goal:** Rename **“Transactions”** → **“Manheim Transactions”** and show the **same wholesale auction sale comps** as the Cox/Manheim MMR tool — not retail listings or third-party substitutes in this table.

**Locked (2026-06-12):**

- **DEC-MLB-2** — Zone C2 must match **Manheim MMR tool behavior**: sold wholesale auction transaction rows (date, price, odometer, grade, region, auction, etc.).
- **DEC-MLB-3** — **Do not** backfill this table with MarketCheck data. MarketCheck is for optional enrichment elsewhere (e.g. VIN decode for Item 1), not a replacement for Manheim sold comps.

### Immediate UI change

- [x] Rename section title and empty-state copy in `transactions-table.tsx` to **Manheim Transactions**
- [x] Empty state should say wholesale **auction sale** comps (Manheim/Cox), not generic “transactions”

### Why Manheim Transactions are empty

Phase 4 wired Cox `include=historical,forecast` and a transaction parser (`manheimMarketContextParser.ts`). The UI is ready; **Cox may not return transaction rows** for this account/VIN sample. Confirm with a production intel-worker smoke before blaming the frontend.

**Smoke (2026-06-12, staging intel worker, VIN `1FT7W2BT4KED81759`, `force_refresh`):**

- Cox returned `historicalAverages` + `forecast` on all payload items (6 trim variants).
- **No** `transactions` / `auctionTransactions` / `auctionSales` (or other mapped keys) on any item.
- **Diagnosis:** API absent — not a parser or frontend bug. Re-run: `wrangler dev --remote --env staging --config workers/tav-intelligence-worker/wrangler.toml --port 8789` then `node scripts/mmr-transactions-smoke.mjs http://127.0.0.1:8789`.

### MarketCheck — what it offers (2026-06 research)

| MarketCheck capability | Endpoint (approx.) | Relevant to MMR Lab? |
|------------------------|-------------------|----------------------|
| **VIN decode / specs** | `GET /v2/decode/car/neovin/{vin}/specs` | **Yes — Item 1** (YMM autofill, trim validation) |
| **Auction inventory search** | `GET /v2/search/car/auction/active` | Partial — **active** auction listings (~498k unique vehicles), filter by VIN / YMMT / similar VINs |
| **Auction listing detail** | `GET /v2/listing/car/auction/{id}` | Detail for a single auction listing |
| **Recent inventory (90d)** | `GET /v2/search/car/recents` | Price/trend history, not necessarily Manheim sold comps |
| **Retail price + comparables** | `GET /v2/predict/car/us/marketcheck_price/comparables` | Retail ML price + **active dealer** comps — different market than wholesale |
| **VIN listing history** | VIN history tools | Past **retail** listing prices, not auction hammer prices |

Docs: [MarketCheck Cars APIs](https://docs.marketcheck.com/docs/api/cars) · [Auction Search](https://docs.marketcheck.com/docs/api/cars/inventory/auction-search)

**Practical path:**

1. **Rename** UI to Manheim Transactions.
2. **Debug Cox** — confirm whether transaction arrays are absent from the API response or dropped in parsing (`manheimMarketContextParser.ts`, intel worker smoke with `include=historical,forecast` + transaction flags).
3. Fix wiring until rows match what Cox returns for the same VIN in the native Manheim MMR UI.

**MarketCheck (separate — not for Manheim Transactions):**

TAV is on a **team MarketCheck account, free tier for now** (2026-06-12). Licensed **3rd-party partner APIs** on this key:

| API | Status | Cost/call | MMR Lab use (future) |
|-----|--------|-----------|----------------------|
| AutoRecalls Recall Check | Accepted | $0.07 | Hard-gate / buyer warning (recall stop-sale) — not Item 1 |
| VINData Title Check | Accepted | $0.49 | Title brand / salvage context — not Item 1 |
| CarsXE Plate to VIN | Accepted | $0.70 | Plate → VIN intake — not MMR Lab core |

**Not on current license:** NeoVIN decode, Auction Search, retail price prediction. **Item 1 (VIN autofill) should use Cox MMR response + Manheim catalog** — not MarketCheck decode until tier upgrades.

When the team moves off free tier, re-check **API Keys → permissions** for NeoVIN decode before wiring it as a fallback.

### How to check your MarketCheck plan

1. **Dashboard** — [MarketCheck Universe](https://universe.marketcheck.com/) → team account.
2. **Subscription** — Currently **free tier**; note quota before production calls to partner APIs (Title Check at $0.49/call adds up fast).
3. **Licensed 3rd party APIs** — Dashboard list under API / partner entitlements (see table above).
4. **API key permissions** — **API Keys** → key → **lock icon** → **Allowed Endpoints**.
5. **Smoke test** (only for endpoints you’ve accepted — never commit keys):

```bash
# Example — only if AutoRecalls is enabled on your key
curl "https://api.marketcheck.com/v2/car/autorecalls/1FTFW1E57NFA88472?api_key=YOUR_KEY"
```

- **200** → endpoint works on this plan/key.
- **401 / 403** → key invalid or endpoint not on free tier / not in Allowed Endpoints.
- **429** → quota exhausted.

Pricing reference: [MarketCheck APIs](https://www.marketcheck.com/apis/)

**Exit criteria:**

- [x] Section renamed to Manheim Transactions
- [x] Cox transaction gap documented (API empty vs parser bug) — see [`03-api/manheim-cox.md`](03-api/manheim-cox.md) §5
- [ ] Manheim Transactions table shows rows for a VIN that has comps in native Manheim MMR UI

---

## 3 — MaxBuy explanation (plain language)

**Goal:** Give the buyer a short, readable sentence (or two) explaining **why** MaxBuy recommends that max buy number — not just badges like `GATE MMR MISSING` or `benchmark_exact_fallback`.

**Current behavior:** `reasonCodes` render as underscored badge chips (`ReasonCodeList` in `maxbuy-evaluation-section.tsx`). Economics and TAV segment history show numbers but not a narrative.

**Locked (2026-06-12):**

- **DEC-MLB-4** — Show **both**: a short narrative sentence **and** a visible **math chain** (expected sale − transport − expenses − target net gross = recommended max buy).
- **DEC-MLB-5** — When data strength is **Low**, include an explicit **caution line** (e.g. “Limited segment data — treat this as a rough guide.”).

**Example copy (draft — not final):**

> Based on 500 similar TAV outcomes in this segment, we expect to sell around $40,083.

**Math:** $40,083 expected sale − $0 transport − $1,847 reconditioning − $800 target profit = **$37,336** max buy.

> ⚠ Limited segment data — use extra caution before bidding.

**Likely inputs:**

- Wholesale anchor (MMR)
- TAV segment sample size (`tav_historical.n_units`)
- Expected sale, transport, expenses, target net gross ($800 policy)
- Hard gates in plain English when verdict is Pass
- Deal fit vs vehicle fit wording (lane ask entered vs ceiling only)

**Exit criteria:**

- [x] Copy map or template function turns evaluate response → narrative + math lines
- [x] Low data strength appends caution line
- [x] Shown on `/mmr-lab` MaxBuy block (and optionally deal-detail card)
- [x] Raw `reasonCodes` moved behind “Details” or ops-only — not primary UX

**Still open:**

- Final caution wording and whether deal-fit vs vehicle-fit changes the narrative template

---

## Completed (archived)

| Track | Doc |
|-------|-----|
| Opportunities UX rollout (Phases 0–7, Classic retired) | [`02-product/ux-rollout-shipped.md`](02-product/ux-rollout-shipped.md) |
| MMR Lab Phases 1–4 (UI, live MaxBuy, adjustments, Cox historical) | [`07-buybox/MMR-LAB-MAXBUY-PAGE.md`](07-buybox/MMR-LAB-MAXBUY-PAGE.md) |
| MaxBuy P0–P9 | [`07-buybox/STATUS.md`](07-buybox/STATUS.md) |

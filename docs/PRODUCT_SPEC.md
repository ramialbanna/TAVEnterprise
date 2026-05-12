# TAV-AIP Frontend Requirements (v1)

**Project:** Texas Auto Value — Automotive Intelligence Platform (TAV-AIP)
**Repo:** [ramialbanna/TAVEnterprise](https://github.com/ramialbanna/TAVEnterprise) (backend already in flight)
**Frontend home:** `web/` (Next.js 15 + Tailwind, already scaffolded)
**Audience:** Claude Code (implementation) + Claude Design (UI/UX)
**Owner:** Rami Albanna, COO — Texas Auto Value
**Status:** v1 scope locked. Open follow-ups tracked in §15.
**Date:** 2026-05-11

---

## 0. How to read this document

- Sections 1–4 are product context — read once.
- Section 5 is the roles & permissions matrix — every screen depends on it.
- Sections 6–9 are the four product surfaces (TAV-MMR, Performance Dashboard, Buy Box Queue, Acquisition Entry) — implement in this order.
- Sections 10–13 are cross-cutting: stack, API contract, design system, notifications.
- Section 14 is the phased delivery plan.
- Section 15 is the open-questions backlog (do not block v1 on these).

When the brief in the repo (`docs/architecture.md`, `docs/APP_API.md`, `docs/INTELLIGENCE_CONTRACTS.md`, `docs/DEAL_SCORE.md`, `docs/CACHE_STRATEGY.md`, `docs/SCALE_ARCHITECTURE.md`, `docs/identity.md`) conflicts with this document, the **repo docs win for backend behavior** and **this document wins for frontend behavior**.

---

## 1. Product mission

TAV-AIP is the operational backbone of Texas Auto Value — the largest U.S. wholesale dealer headquartered in Dallas. The frontend is the daily workspace for every TAV employee involved in acquiring and reselling vehicles.

The platform unifies four product surfaces today, all of which already have backend support in `tav-aip`:

1. **TAV-MMR** — VIN/YMM valuation with TAV historical context.
2. **Performance Dashboard** — KPIs, leaderboard, historical view.
3. **Buy Box Queue** — ingest-fed lead queue for Buyer+Closer workflow.
4. **Acquisition Entry** — cold-call lead entry and CSV bulk upload.

Future surfaces (inventory, transport, recon, sell-side, finance) attach to the same shell.

---

## 2. Users

| Role | Description | Approx. count |
|------|-------------|---------------|
| Buyer+Closer (B/C) | Same person scores leads, claims them, and closes the deal. Plans for split roles later. | 50–100+ at scale; smaller today |
| Manager | Oversees a team. Can reassign leads, force-refresh MMR, approve cold-call leads, view full leaderboard. | <10 |
| Admin | Platform admin. Manages users, buy-box rules, integrations, audit log access. | 1–3 |

All users authenticate via **Google Workspace, fronted by Cloudflare Access** (already the backend identity contract — see `docs/INTELLIGENCE_CONTRACTS.md` §C).

---

## 3. Architecture context (what already exists)

The backend is more developed than the original brief implied. The frontend builds on top of it, it does not redesign it.

| Layer | Status |
|------|--------|
| Cloudflare Worker `tav-aip` with `/ingest`, `/admin/*`, `/app/*`, `/health` | Live on staging + production |
| `/app/*` HTTP contract | Locked — see `docs/APP_API.md` |
| Intelligence Worker (`tav-intelligence-worker`) with Manheim MMR + KV cache | Live (sandbox MMR until live Cox creds are provisioned) |
| Supabase schema (30+ tables: raw → normalized → vehicle candidate → lead → outcome) | Live; see `supabase/schema.sql` |
| Cache strategy (24h positive / 1h negative / anti-stampede lock) | Locked — see `docs/CACHE_STRATEGY.md` |
| Cache + segment keys + user context + `force_refresh` authorization | Frozen — see `docs/INTELLIGENCE_CONTRACTS.md` |
| Deal score spec | In `docs/DEAL_SCORE.md` |
| Next.js 15 web app scaffold | In `web/` (App Router, Tailwind, placeholder home page) |

**Implication for Claude Code:** the frontend does **not** invent its own data model, auth flow, or MMR plumbing. Every backend touchpoint is `/app/*` on `tav-aip` (Bearer `APP_API_SECRET`, server-side only). When `/app/*` doesn't yet expose what the frontend needs, file the gap as an ADR under `docs/adr/` and add a new endpoint on `tav-aip` — do not call Supabase directly from the browser.

---

## 4. The six items from the gap analysis — resolved

| # | Item | Resolution in v1 |
|---|------|------------------|
| 1 | Roles & permissions matrix | Hybrid model — see §5. Buyer+Closer collapsed into one role. |
| 2 | Lead lifecycle states | Locked — see §8.2. Backed by `tav.leads` + `tav.lead_actions`. |
| 3 | KPIs for dashboard v1 | Locked — see §7.2. Source: `/app/kpis` (extended in v1). |
| 4 | TAV Value formula | Locked v1 definition — see §6.4. Driven by `tav.historical_sales` + `tav.v_segment_profit`. Versioned. |
| 5 | Buy-Box data-acquisition method | Three lanes: Apify (existing `/ingest`), licensed B2B feeds (AutoTrader / Cars.com adapters), and manual entry. See §8.1. |
| 6 | Manheim sandbox + API selection | `tav-intelligence-worker` already on Cox sandbox. v1 frontend consumes via `POST /app/mmr/vin`. Production cutover to live Cox tracked separately. |

---

## 5. Roles & permissions matrix

### 5.1 Auth flow

1. User loads any page → redirected to **Google Workspace** sign-in via **Cloudflare Access**.
2. Cloudflare Access injects `Cf-Access-Authenticated-User-Email`, `Cf-Access-Jwt-Assertion`, `Cf-Access-Authenticated-User-Roles` headers on every request to the Next.js BFF.
3. Next.js BFF (server actions / route handlers) calls `tav-aip` `/app/*` with `Authorization: Bearer ${APP_API_SECRET}` — this secret lives **server-side only**, never in the browser.
4. The BFF forwards the user identity to `tav-aip` either as a propagated header (preferred — same contract `extractUserContext` already reads) or as a body field on writes. v1: propagate the Cloudflare Access headers verbatim on the server-to-server hop.

### 5.2 Roles (v1 — hybrid model)

| Role | Cloudflare Access group |
|------|--------------------------|
| Buyer+Closer (B/C) | `tav-buyer-closer` |
| Manager | `tav-manager` |
| Admin | `tav-admin` |

Roles are **not stacked** — a Manager is implicitly also B/C for any closer-style action; an Admin is implicitly Manager.

### 5.3 Permissions matrix

| Capability | B/C | Manager | Admin |
|---|:---:|:---:|:---:|
| Sign in | ✓ | ✓ | ✓ |
| Run TAV-MMR (VIN or YMM) | ✓ | ✓ | ✓ |
| See "first puller" + timestamp on duplicate VIN | ✓ | ✓ | ✓ |
| See first puller's **TAV offer** value | — | ✓ | ✓ |
| Force-refresh MMR (bypass cache) | — | ✓ | ✓ |
| View Performance Dashboard (own + team) | ✓ | ✓ | ✓ |
| View full leaderboard (all employees) | ✓ | ✓ | ✓ |
| Drill into another user's records | — | ✓ | ✓ |
| Export dashboard data (CSV / PDF) | own only | full | full |
| Browse Buy Box queue | ✓ | ✓ | ✓ |
| Score a lead (Buyer action) | ✓ | ✓ | ✓ |
| Claim a lead (Closer action) | ✓ | ✓ | ✓ |
| Reassign a lead | own claims | any lead | any lead |
| Mark lead won → push to inventory | ✓ | ✓ | ✓ |
| Add cold-call lead | ✓ | ✓ | ✓ |
| Approve cold-call lead → enters queue | — | ✓ | ✓ |
| Upload CSV (purchases / dealer / auction) | — | ✓ | ✓ |
| Preview + commit CSV batch | — | ✓ | ✓ |
| Roll back CSV batch | — | — | ✓ |
| View audit log (own actions) | ✓ | ✓ | ✓ |
| View audit log (all users) | — | ✓ | ✓ |
| Manage buy-box rules | — | — | ✓ |
| Manage users / role assignments | — | — | ✓ |
| Manage integrations / secrets | — | — | ✓ |

### 5.4 Deprovisioning

When a user is removed from the Cloudflare Access group:

- Their open lead claims auto-release after **24 hours** if not transferred sooner. Manager can transfer immediately.
- Their MMR pull history and outcomes remain attributed to their email (audit trail).
- Their leaderboard rank freezes; they drop off "active" leaderboards but remain in historical reports.

### 5.5 Audit logging

Every write action is recorded with `{ actor_email, role, action, target_id, before, after, request_id, timestamp }`. v1 uses the existing `tav.user_activity` table; an extended `tav.audit_log` migration may be needed for write-paths beyond MMR queries. Append-only.

---

## 6. Surface 1 — TAV-MMR

### 6.1 Goal

A user enters a VIN (or YMM + miles) and gets back, on one screen:

- Manheim MMR value (with confidence + method).
- **TAV Value** — TAV's data-driven recommended purchase price.
- Duplicate-pull notice if another user pulled the same vehicle recently.
- Action shortcuts: "Add as cold-call lead", "Score this listing", "Save for later".

### 6.2 UX flow

**Input modes (tabbed):**

1. **VIN lookup** — single input, 17-char VIN, client-side validation:
   - Exactly 17 characters.
   - No `I`, `O`, `Q`.
   - ISO 3779 check-digit calculation (warn but don't block on fail — some VINs in the wild are technically invalid yet still useful).
2. **YMM lookup** — Year (dropdown 1990–current+1), Make (typeahead from `tav.mmr_reference_makes`), Model (typeahead, dependent on Make), Trim (typeahead, dependent on Model — optional, defaults to "base" with explicit warning per `docs/INTELLIGENCE_CONTRACTS.md` §A), Miles (numeric).

**Result panel:**

```
┌─────────────────────────────────────────────────────────────┐
│ 2021 Ford F-150 XLT  •  VIN 1FT8W3BT1SEC27066  •  52,400 mi │
├─────────────────────────────────────────────────────────────┤
│ Manheim MMR              $34,200    (confidence: high)      │
│ TAV Value                $32,800    (v1.0 — formula below)  │
│ Suggested Max Offer      $31,400    (TAV − recon − transport)│
│                                                              │
│ [ Add as cold-call lead ]  [ Save ]  [ Force refresh* ]     │
└─────────────────────────────────────────────────────────────┘

⚠ Pulled 6h ago by sarah@texasautovalue.com — her TAV offer was hidden
```

`*` Force refresh only visible to Manager/Admin (see §5.3).

### 6.3 Duplicate VIN notification

When the same VIN was queried in the past **48 hours** by a different user:

- Both users see a banner: "Pulled <relative time> ago by <first_puller_email>".
- **B/C role:** sees only the timestamp and email — never the prior TAV offer (prevents collusion / anchoring).
- **Manager/Admin:** sees the prior TAV offer and Manheim value.
- The current user's pull still records to `tav.mmr_queries` — duplicate notice never blocks the lookup.

If `force_refresh=true` is supplied (Manager/Admin only — see `INTELLIGENCE_CONTRACTS.md` §D), the cache is bypassed and the duplicate banner shows "Force-refreshed by <user> at <time>".

### 6.4 TAV Value — formula v1.0

Locks the "black box" from the gap analysis. Versioned (`tav_value_version` field stored with every lookup) so retunes are auditable.

**Definition:** TAV Value is the price at which TAV's historical purchase data shows we acquire similar vehicles **and resell profitably within target hold time**. It is **not** an estimate of resale price.

**Formula (v1.0):**

```
TAV_Value =
  MMR_wholesale
  × segmentMultiplier(year, make, model, trim, region)
  × recencyAdjustment(historical_sales)
  − feeAdjustment(auction_fees, transport_baseline, recon_baseline)
```

Where:

- `segmentMultiplier` comes from `tav.v_segment_profit` — historical average (acquisition_cost / mmr_at_acquisition) for matching segment, weighted by recency (60-day exponential decay).
- `recencyAdjustment` — flat 1.00 if ≥ 25 matching sales in the last 180 days; falls back to broader segment (year-make-model → make-model → make) until threshold met. If no match anywhere, return `null` and `missingReason: "no_historical_match"`.
- `feeAdjustment` — flat baselines from `tav.market_expenses` (region-aware): auction $250, transport $350, recon $700. Shown separately in the UI breakdown.

**Confidence label:**

- `high` — VIN match + ≥ 25 same year/make/model/trim sales in 180d.
- `medium` — YMM match + ≥ 25 same year/make/model sales in 180d.
- `low` — fallback segment + < 25 sales, OR mileage outside training distribution.
- `null` — no usable history.

**Versioning rule:** any change to weights, decay constants, or fee baselines bumps `tav_value_version` and writes an ADR. Historical lookups always render with the version that produced them.

### 6.5 Caching

Already implemented per `docs/CACHE_STRATEGY.md`:

- 24h positive cache, 1h negative cache, 30s anti-stampede lock.
- Frontend does not re-implement caching — every call goes to `POST /app/mmr/vin` (or the new `POST /app/mmr/ymm` — see §11.2) and the worker handles the rest.
- Frontend shows a discreet "cached from <time>" tag when the response indicates a cache hit (new field on the response — see §11.2).

### 6.6 Permanent history

Separate from the 48h cache. Every lookup writes to `tav.mmr_queries` with `{ user_email, vin or ymm, mmr_value, tav_value, tav_value_version, confidence, force_refresh, cache_hit, timestamp }`. Powers analytics ("which buyer pulls trucks that never convert?").

### 6.7 Acceptance criteria

- [ ] VIN input validates client-side (length, no I/O/Q, checksum warn).
- [ ] YMM input enforces Year ≤ Make ≤ Model ≤ Trim dependency.
- [ ] Result returns within 2s on cache hit, < 6s on cache miss (P95).
- [ ] Duplicate banner appears for any same-VIN pull within 48h, with role-gated TAV offer visibility.
- [ ] Force-refresh button is hidden for B/C users (server enforces; UI hides redundantly).
- [ ] TAV Value displays version tag and missing-reason text when not computable.
- [ ] Every lookup writes a row to `tav.mmr_queries`.

---

## 7. Surface 2 — Performance Dashboard (Enterprise)

This is the company's operating heartbeat. It is **not** a single page — it is a hierarchical drill-down that starts at the enterprise top line and bottoms out at every individual unit a user has touched. Same data model, four levels of zoom, identical KPI grammar at every level.

### 7.1 Hierarchy & navigation

```
Level 1 — Enterprise           (TAV-wide)            Admin, Manager (read), B/C (top-line summary only)
  └─ Level 2 — Region          (Dallas / Houston / Austin / San Antonio / National)
        └─ Level 3 — Team       (a Manager's reports)
              └─ Level 4 — User  (individual employee)
                    └─ Level 5 — Unit  (single VIN / lead / outcome record)
```

Navigation is **drill-down by click + breadcrumb-up by click**. Every KPI tile on every level is itself a drill target. URL is canonical and shareable:

```
/dashboard                                  Enterprise
/dashboard/region/dallas_tx                 Region
/dashboard/team/rami-team                   Team
/dashboard/user/sarah@texasautovalue.com    User
/dashboard/unit/<lead_id|outcome_id>        Unit
```

All levels accept the same query params: `?since=YYYY-MM-DD&until=YYYY-MM-DD&granularity=day|week|month|quarter|year`.

### 7.2 Role-based access to levels

| Role | L1 Enterprise | L2 Region | L3 Team | L4 User | L5 Unit |
|---|:---:|:---:|:---:|:---:|:---:|
| B/C | top-line summary only (units, gross, conversion) | own region | own team summary | own only | own only |
| Manager | full | full | own + reports | own + reports | own + reports |
| Admin | full | full | full | full | full |

The leaderboard (§7.7) is separately public to everyone and lives outside this gating.

### 7.3 Universal KPI grammar (used at every level)

Every level renders the **same set of KPI categories** — only the aggregation scope changes. This is what makes drill-down coherent: a number that means something at L1 means the same thing at L4 for one person.

**A. Acquisition funnel**

| KPI | Source | Definition |
|---|---|---|
| Leads scored | `tav.lead_actions` | `action='scored'` in range |
| Leads claimed | `tav.lead_actions` | `action='claimed'` in range |
| Claim → Won conversion | `tav.leads` | `won / (won + lost + expired)` |
| Avg time-to-claim | `tav.leads` | `AVG(claimed_at - in_queue_at)` |
| Avg time-to-close | `tav.leads` | `AVG(closed_at - claimed_at)` for won |
| Units acquired | `tav.purchase_outcomes` | rows with `acquired_at` in range |

**B. Acquisition economics**

| KPI | Source | Definition |
|---|---|---|
| Total acquisition cost | `tav.purchase_outcomes` | `SUM(acquisition_cost)` |
| Avg acquisition cost / unit | `tav.purchase_outcomes` | `AVG(acquisition_cost)` |
| Avg MMR at acquisition | `tav.purchase_outcomes` | `AVG(mmr_at_acquisition)` |
| Avg acquisition discount | derived | `AVG((mmr_at_acquisition - acquisition_cost) / mmr_at_acquisition)` |
| Avg gross at acquisition | `tav.purchase_outcomes` | `AVG(mmr_at_acquisition - acquisition_cost - fees)` |
| Acquisition gross dollars | `tav.purchase_outcomes` | `SUM(...)` of the above |

**C. Sell-side performance** (any unit with a `sale_date`)

| KPI | Source | Definition |
|---|---|---|
| Units sold | `tav.historical_sales` | rows with `sale_date` in range |
| Total revenue | `tav.historical_sales` | `SUM(sale_price)` |
| Total gross profit | `tav.historical_sales` | `SUM(gross_profit)` — STORED generated column |
| Avg gross profit / unit | `tav.historical_sales` | `AVG(gross_profit)` |
| Avg front gross | `tav.historical_sales` | `AVG(sale_price - acquisition_cost - transport - recon - auction_fees)` |
| Avg hold days | `tav.historical_sales` | `AVG(sale_date - acquisition_date)` |
| Gross margin % | derived | `SUM(gross_profit) / SUM(sale_price)` |
| Gross per day held | derived | `SUM(gross_profit) / SUM(hold_days)` — true velocity metric |

**D. Inventory health** (units acquired but not yet sold)

| KPI | Source | Definition |
|---|---|---|
| Units in stock | `tav.purchase_outcomes` | acquired but no `sale_date` |
| Capital in inventory | `tav.purchase_outcomes` | `SUM(acquisition_cost + recon + transport)` of unsold |
| Avg days on lot | derived | `AVG(NOW() - acquired_at)` for unsold |
| Age buckets | derived | counts in 0–14 / 15–30 / 31–60 / 60+ |
| Aging exposure | derived | capital-in-inventory weighted by age bucket; flags overage |
| MMR-relative pricing | `tav.purchase_outcomes` ⨝ `tav.mmr_queries` | `current_listing_price / current_mmr` |

**E. Commissions & compensation** (new — see §7.5)

| KPI | Source | Definition |
|---|---|---|
| Commission earned (acquisition) | `tav.commissions` | `SUM(amount WHERE leg='acquisition')` |
| Commission earned (sale) | `tav.commissions` | `SUM(amount WHERE leg='sale')` |
| Total commission earned | `tav.commissions` | `SUM(amount)` |
| Avg commission / unit | derived | `SUM(amount) / COUNT(DISTINCT outcome_id)` |
| Pending payout | `tav.commissions` | `SUM(amount WHERE paid_at IS NULL)` |
| YTD commission | `tav.commissions` | calendar-year scoped |

**F. Activity & quality**

| KPI | Source | Definition |
|---|---|---|
| MMR pulls | `tav.mmr_queries` | rows in range |
| MMR → claim rate | derived | what % of pulls led to a claim by same user within 7 days |
| MMR → won rate | derived | what % of pulls led to a won deal within 30 days |
| Score calibration | derived | actual gross by buyer-assigned score grade (high/med/low) |
| Lost-reason mix | `tav.leads` | distribution of `lost_reason_code` |

Every block independently degrades to `{ value: null, missingReason }` — same envelope as the existing `/app/kpis`.

### 7.4 Historical time-series — "see your day, week, month, year"

Every KPI tile on every level supports a **granularity toggle**: `Day · Week · Month · Quarter · YTD · 12-month rolling · All-time`. Behind every tile is a sparkline (compact, in the tile itself) and a click-through to a **full historical chart** with:

- Time axis at the chosen granularity.
- Comparison line: prior period (e.g., last month vs this month) — toggleable.
- Comparison line: same period prior year — toggleable.
- Goal line if a goal is set for the metric (see §7.10).
- Annotations: leaderboard rank changes, major events (e.g., new region launch, buy-box rule change).

Back-end powered by daily-rollup tables (see §7.11) so charts render in < 200ms even for multi-year ranges.

**Standard date presets** (always available on every level): Today · Yesterday · This Week · Last Week · This Month · Last Month · This Quarter · Last Quarter · YTD · Last 12 Months · All Time · Custom.

A user can pin a custom range as a saved view (`tav.dashboard_views`).

### 7.5 Commission model (new)

Commissions need a first-class schema and policy so they show on every user's dashboard accurately. Initial v1 model — designed to be configurable later without breaking history:

**Schema (new tables):**

```
tav.commission_plans
  id, name, effective_from, effective_to,
  acquisition_rule jsonb,    -- e.g. {"type":"flat","amount":100} or {"type":"pct_of_gross","pct":0.25}
  sale_rule jsonb,           -- same shape, paid on sale-side gross
  created_by, created_at

tav.commission_plan_assignments
  user_email, plan_id, effective_from, effective_to

tav.commissions
  id, outcome_id, user_email, role ('buyer'|'closer'|'seller'),
  leg ('acquisition'|'sale'), amount, computed_at,
  plan_id, plan_snapshot jsonb,    -- frozen snapshot at compute time
  approved_by, approved_at,
  paid_at, payroll_batch_id
```

**Computation:**

- Acquisition leg: computed when `tav.purchase_outcomes` row is written (lead won → outcome).
- Sale leg: computed when `tav.historical_sales` row gains a `sale_price`.
- The `plan_snapshot` is frozen so changing the active plan never rewrites past commissions.
- An Admin must approve before commissions become "payable" — protects against bad-CSV inflation.

**Visibility:**

- B/C: see their own commissions on every personal dashboard tile.
- Manager: see their team's commissions (sum + per-user breakdown).
- Admin: see all commissions + manage plans and payroll batches.

**Commission display on dashboards:**

- Tile: Total commission (date-range scoped) with sparkline.
- Detail page: per-unit commission row with the underlying outcome and the plan that produced it.
- Payout view (B/C, own only): pending vs paid, grouped by payroll batch.

### 7.6 Level 5 — Unit-level detail (the bottom of the drill)

When a user clicks any unit anywhere on the dashboard, they land on a **Unit Detail page** — the canonical view of one vehicle's full life inside TAV.

**Unit page sections:**

1. **Vehicle header** — Year/Make/Model/Trim, VIN, miles, photo strip.
2. **Lifecycle timeline** — all state transitions and key events on one vertical timeline:
   - Lead created (source, by whom)
   - Scored (score breakdown, who)
   - Claimed (by whom, time-to-claim)
   - Contact attempts (communication log)
   - Offers (each offer + counter)
   - Won / Lost (with reason)
   - Acquired (cost, date, paperwork)
   - Recon events (cost, vendor, date)
   - Transport events (cost, route, date)
   - Listed for sale (channel: Manheim, OVE, DealerBlock, etc.; price)
   - Sold (price, buyer, date)
3. **Valuation history** — every MMR pull on this VIN with TAV Value at each point (chart over time).
4. **Financials block** — full P&L for the unit:
   ```
   Acquisition cost           $24,500
   Auction fees                  $250
   Transport                     $375
   Recon                         $850
   ─────────────────────────────────
   All-in cost                $25,975

   Sale price                 $29,200
   Sale fees                     $195
   ─────────────────────────────────
   Net revenue                $29,005

   Gross profit                $3,030
   Gross margin %               10.4%
   Hold days                       18
   Gross per day held             $168

   Commissions
     Acquisition (sarah@)         $100
     Sale (mike@)                 $150
   ─────────────────────────────────
   Net contribution            $2,780
   ```
5. **People involved** — buyer, closer, seller-side rep, recon vendor; click any to drill back up to that user's L4 dashboard.
6. **Source data** — original listing URL, raw listing snapshot, photos pulled.
7. **Document attachments** — title scan, BOS, ACV report, recon receipts.

Visibility: B/C sees full detail for any unit they touched; Manager/Admin see any unit.

### 7.7 Leaderboard

- Fully public to all employees (decision recorded §4, leaderboard row).
- Default sort: **Avg gross at acquisition** in current month.
- Sort options: units acquired, total gross profit (sold), avg gross per unit, conversion rate, leads scored, total commission, gross per day held, MMR → won rate.
- Tie-breaker: most-recent qualifying event.
- Shows **all** users, paginated 25/page. Highlights the viewing user's row.
- Top 3 get a visual treatment (medal icon, soft background tint) — no emoji.
- Toggle: "This month / Last month / This quarter / YTD / Last 12 months / All time".
- Each row is clickable → opens that user's L4 dashboard (B/C role sees only top-line summary on others; full detail only on themselves).
- Updates: nightly recompute + manual refresh button (rate-limited to once per minute per user).

### 7.8 Drill-down behavior (uniform rule)

- Every KPI tile is clickable → opens a **drilldown panel** showing the underlying rows (leads, outcomes, sales, commissions) that compose the number.
- Every row in any list is clickable → opens the corresponding L5 Unit page (or L4 User page if the row represents a person).
- Breadcrumb component shows: `Enterprise › Region: Dallas › Team: Rami's team › User: sarah@ › Unit: 2021 F-150 1FT…`. Each crumb is clickable.
- "Open in new tab" supported on every drilldown link.

### 7.9 Exports

- **CSV** — every tile and every list view has a "Download CSV" affordance. Honors the current filter + date range + level scope.
- **PDF** — every level has a one-click "Snapshot PDF" report: cover (level name + date range + generator's name + timestamp), KPI cards, top-N tables, and signature blocks. Rendered server-side via `@react-pdf/renderer` in a Next.js route.
- **Scheduled email digests** — Manager/Admin can subscribe themselves or others to recurring (daily/weekly/monthly) PDF digests at any level. Backed by `tav.dashboard_subscriptions`.

### 7.10 Goals & targets

- Admin sets goals per KPI per scope (enterprise / region / team / user) per period (month / quarter / year).
- Tiles render a goal-progress bar + projected end-of-period attainment (linear projection from current pace).
- Missed-goal alerts to the goal owner + their manager when projection drops below 80% of target.
- Stored in `tav.performance_goals { id, scope_type, scope_id, kpi_key, period_start, period_end, target_value, set_by, set_at }`.

### 7.11 Data pipeline & freshness

KPI tiles cannot afford slow queries at scale, so we materialize daily.

**New rollup tables (Supabase):**

```
tav.metrics_daily_user
  date, user_email, region,
  leads_scored, leads_claimed, units_acquired, units_sold,
  acq_cost_sum, acq_gross_sum, sale_revenue_sum, gross_profit_sum,
  commission_acq_sum, commission_sale_sum,
  hold_days_sum, sold_count, ...
  (PK: date, user_email)

tav.metrics_daily_region   (PK: date, region)
tav.metrics_daily_team     (PK: date, team_id)
tav.metrics_daily_enterprise (PK: date)
```

- Refreshed nightly by a Cloudflare cron + a Supabase SQL function `refresh_metrics_daily(date)`.
- Intra-day "today" tiles compute on-the-fly from the source tables (capped to today only — much smaller query).
- API merges "yesterday-and-earlier from rollup" + "today live".
- Backfill job available on demand via Admin (`POST /admin/metrics/rebuild?since=YYYY-MM-DD`).

**Freshness contract:**

- Header on every dashboard page: "Last full refresh: 2026-05-11 03:14 CDT · Live for today".
- Manual refresh available; rate-limited to 1/min per user.

### 7.12 Acceptance criteria

- [ ] All five levels (Enterprise → Region → Team → User → Unit) navigable via clicks and URLs.
- [ ] Same KPI grammar at every level; no level-specific metric names.
- [ ] Granularity toggle (Day/Week/Month/Quarter/YTD/12-month/All-time) works on every tile.
- [ ] Unit page renders the full lifecycle timeline, financial P&L, and commission breakdown.
- [ ] Commission tiles render on every user dashboard; pending vs paid is clear.
- [ ] Drill-down from any tile lands on the correct underlying rows.
- [ ] CSV + PDF export honor the current scope + filter.
- [ ] Daily rollup tables exist and are populated; "today" tiles compute live.
- [ ] Role gating: B/C can never see another user's detail beyond leaderboard top-line.
- [ ] No KPI fabricates a `0` for missing data — `{ value: null, missingReason }` everywhere.

### 7.13 Weekly Sale (Wednesday cycle) — first-class concept

TAV's operating rhythm is a **weekly sale on Wednesday**. The platform treats the sale week as a primary unit of time alongside day/month/quarter, with its own surface, its own data sources, and its own KPIs.

#### 7.13.1 Sale Week definition

- A **Sale Week** is the seven-day period that **ends on the Wednesday sale**.
- Canonical identifier: `sale_week_id = YYYY-WW` where `WW` is the Wednesday's ISO-week number, with `sale_date = <that Wednesday>`.
- Default "current sale week" in the UI: the next upcoming Wednesday (cutoff at the prior Wednesday end-of-day).
- Stored in a new reference table `tav.sale_weeks { sale_week_id, sale_date, opens_at, closes_at, status ('upcoming'|'in_progress'|'sold'|'reconciled'), created_at }`.

#### 7.13.2 Data lanes feeding a Sale Week

Two data lanes converge per Sale Week. Both are required for the full view; each independently degrades to `null + missingReason`.

**Lane A — Manheim sale results** (pulled directly from Manheim APIs)

- Source: Manheim seller/inventory APIs via `tav-intelligence-worker` (new endpoints; same OAuth pattern as MMR).
- New table `tav.manheim_sale_results`:
  ```
  id, sale_week_id, vin, manheim_listing_id,
  ymm_year, ymm_make, ymm_model, ymm_trim, mileage,
  consignor_account ('TAV'|'<other>'),
  channel ('Simulcast'|'OVE'|'DealerBlock'|'In-Lane'|...),
  listing_status ('sold'|'no_sale'|'if_bid'|'withdrawn'),
  high_bid, reserve_price, sale_price, buy_fee, sell_fee,
  buyer_dealer_id, sold_at,
  raw_payload jsonb, fetched_at
  ```
- Pull cadence: hourly during the sale (Wed 8am–6pm CT), every 15 min in the hour before and after; nightly reconciliation pull for the rest of the week.
- Idempotent upsert by `(sale_week_id, manheim_listing_id)`.
- These are the **definitive sale outcomes** — not estimates.

**Lane B — TAV weekly summary** (TAV-side ground truth)

The TAV view of the same week, split by inventory type so we can see what we own vs. what we move for others:

- New table `tav.tav_weekly_units` — every unit TAV represented in this week's sale:
  ```
  id, sale_week_id, vin, outcome_id (FK to purchase_outcomes; null for consignment),
  ownership ('owned'|'consignment'),
  consignor_name (null when ownership='owned'),
  acquisition_cost (null for consignment),
  reserve_price, list_price, run_number,
  result_join_id (FK to manheim_sale_results; resolved by reconciliation job),
  notes
  ```
- Two clear flavors per row:
  1. **Owned** — sourced from `tav.purchase_outcomes`. We bought it, we sell it, full gross is ours.
  2. **Consignment** — we move it for another party. No acquisition cost; we earn a fee/commission per the consignment agreement.
- New view `tav.v_sale_week_summary` joins Lane A + Lane B per `sale_week_id` and emits the row-level economics described in 7.13.4.

#### 7.13.3 Sale Week surface (new dashboard section)

A dedicated page at `/dashboard/sale-week/:sale_week_id` (default redirects to current). Layout:

**Header**
- Sale Week label and date ("Sale Week 2026-W19 · Wed May 13, 2026").
- Status badge: Upcoming / In Progress (live during sale) / Sold / Reconciled.
- Quick nav: Previous / Next / Pick a week (date picker that snaps to Wednesdays).
- Last refresh + manual refresh.

**Top tiles (all sourced from Lane A + Lane B):**

| Tile | Definition |
|---|---|
| Total units in sale | `COUNT(*)` from `tav_weekly_units` |
| Owned units | `COUNT(*) WHERE ownership='owned'` |
| Consignment units | `COUNT(*) WHERE ownership='consignment'` |
| Units sold | `COUNT(*) WHERE listing_status='sold'` (from joined Manheim row) |
| Sell-through rate | `sold / total` |
| Total sale revenue | `SUM(sale_price)` |
| Gross profit — owned | `SUM(sale_price - acquisition_cost - sell_fee - transport - recon)` for owned-and-sold |
| Consignment fees earned | `SUM(consignment_fee)` for consignment-and-sold |
| Avg gross / owned unit | `AVG` of the owned gross profit |
| Avg sale price | `AVG(sale_price)` |
| If-bid count | `COUNT(*) WHERE listing_status='if_bid'` |
| No-sale count | `COUNT(*) WHERE listing_status='no_sale'` |

**Tabbed detail below the tiles:**

1. **All units** — every unit in the sale (owned + consignment). Columns: Lane (Owned/Consignment), Run #, VIN, YMM, Miles, Acquisition Cost (owned only), Reserve, Sale Price, Status, Gross/Fee, Buyer Dealer, Buyer.
2. **Owned only** — same table, owned units only.
3. **Consignment only** — same table, consignment units; column "Consignor" surfaces.
4. **No-sales / If-bids** — units that didn't clear; action: relist next week, negotiate, withdraw.
5. **Channel mix** — breakdown by Manheim channel (Simulcast / OVE / DealerBlock / In-Lane).
6. **Buyer breakdown** — top buyer dealers this week + counterparties to follow up with.

Every row clicks through to the L5 Unit page (§7.6), enriched with the Sale Week joined data.

#### 7.13.4 Row-level economics formula

For an **owned** unit that sold:
```
gross_profit_owned =
    sale_price
  − acquisition_cost
  − auction_sell_fee
  − transport_cost
  − recon_cost
```

For a **consignment** unit that sold:
```
consignment_fee_earned = computed per the active consignment plan
   (flat per unit OR % of sale price OR % above-reserve — stored in tav.consignment_plans, snapshotted per unit)
```

For a **no-sale**:
```
carrying_cost_week = transport_cost_weekly_share + storage_fee
```
(Carry tracked so consecutive no-sales surface as exposure.)

#### 7.13.5 Granularity in the universal grammar

The granularity toggle from §7.4 gains a new option: **Sale Week**. Selecting it pivots all time-series tiles in the dashboard to the Wednesday-anchored cycle. "Last 12 sale weeks" becomes a standard preset alongside "Last 12 months."

#### 7.13.6 Consignment as a first-class entity

New schema:
```
tav.consignors { id, name, contact_email, default_plan_id, created_at }
tav.consignment_plans { id, name, rule jsonb, effective_from, effective_to }
tav.consignment_units { id, consignor_id, vin, intake_at, plan_id, plan_snapshot jsonb, status }
```
Consignment units flow through the same Sale Week lifecycle but never write to `purchase_outcomes`. They show in the user dashboard under a clearly labeled "Consignment" sub-section so personal gross numbers stay clean.

#### 7.13.7 New API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/app/sale-weeks?since=&until=` | List sale weeks with status + headline KPIs. |
| GET | `/app/sale-weeks/:id` | Full Sale Week payload (header + tiles + tabbed rows). |
| GET | `/app/sale-weeks/:id/units` | All units in the week (filter by ownership / status). |
| POST | `/app/sale-weeks/:id/sync-manheim` | Manager-triggered refresh of Lane A (rate-limited; usually automated). |
| GET | `/app/consignors` / `POST /app/consignors` | Manage consignors (Manager/Admin). |
| GET | `/app/consignment-plans` / `POST /app/consignment-plans` | Manage consignment plans (Admin). |

#### 7.13.8 Manheim integration scope

In addition to the MMR endpoints already wired through `tav-intelligence-worker`, this surface adds:

- Seller account inventory listing (units we have entered into a given sale).
- Sale results by sale event (run-level results).
- OVE listing status (online sales between physical sale events).

These are different Manheim products than MMR — specifics tracked in a new `docs/MANHEIM_SALES_INTEGRATION.md` to mirror the existing `docs/MANHEIM_INTEGRATION.md`.

#### 7.13.9 Acceptance criteria

- [ ] `tav.sale_weeks`, `tav.manheim_sale_results`, `tav.tav_weekly_units`, `tav.consignors`, `tav.consignment_plans`, `tav.consignment_units` migrations applied.
- [ ] Manheim sale-results sync job runs hourly during sale and writes idempotently.
- [ ] `/dashboard/sale-week/<current>` renders headline tiles, three lane-aware tabs, and channel/buyer breakdowns.
- [ ] Owned vs consignment rows render distinctly; consignment never inflates personal gross.
- [ ] Sale Week granularity toggle works on every applicable historical tile.
- [ ] Manheim Lane A failure degrades to `null + missingReason: "manheim_sync_failed"` — TAV Lane B still renders.

### 7.14 Legacy acceptance items (carry-over)

- [ ] All KPIs render with explicit `null` + `missingReason` when data is absent.
- [ ] Date-range filter applies to every tile and the leaderboard.
- [ ] CSV/PDF export reflects the current filter state.
- [ ] Leaderboard ranks update within 1 minute of a new purchase outcome (acceptable: nightly + manual refresh).
- [ ] No KPI shows a fabricated `0` for missing data.

---

## 8. Surface 3 — Buy Box Queue

### 8.1 Data acquisition (locked)

Three ingestion lanes, all feeding the same `tav.normalized_listings` → `tav.vehicle_candidates` → `tav.leads` pipeline:

| Lane | Source | Adapter | Legal posture |
|---|---|---|---|
| 1 | Apify scrapers (Facebook Marketplace, Craigslist, OfferUp, etc.) | `src/sources/<name>.ts` | Operationally accepted risk — see `docs/architecture.md`. Suppress on takedown. |
| 2 | Licensed B2B feeds | New adapters: `src/sources/autotrader_b2b.ts`, `src/sources/cars_com_b2b.ts` | Contracted. Preferred when overlap exists. |
| 3 | Manual entry | Cold-call lead form (see §9.1) | First-party. |

Lead detail UI shows **source-of-origin** explicitly so closers can prioritize licensed-feed leads.

### 8.2 Lead lifecycle (locked)

Definitive state machine. Backed by `tav.leads.status` + `tav.lead_actions` (already in schema).

```
new
  └─> scored          (Buyer scored; required before queue eligibility)
        └─> in_queue  (auto when scored AND grade != 'pass')
              └─> claimed     (Closer self-assigns; hard lock on lead_id)
                    ├─> contacted
                    │     └─> negotiating
                    │           ├─> won        ─> triggers acquisition workflow (§9.4)
                    │           └─> lost       (requires reason code)
                    ├─> released   (closer self-releases; back to in_queue)
                    └─> expired    (auto after N hours unclaimed activity)
```

**Side states:**
- `pass` — grade=`pass` from scoring; never enters queue.
- `duplicate` — fingerprint linked to another candidate; merged.
- `removed` — manual admin removal (e.g., listing taken down).

**Transition rules:**

- Every transition writes a row to `tav.lead_actions` with `{ from_status, to_status, actor_email, reason, timestamp }`.
- `claimed → contacted` requires at least one communication log entry (see §8.7).
- `claimed → negotiating` requires a recorded offer.
- `negotiating → lost` requires a reason from a controlled list: `price_too_high`, `seller_unresponsive`, `sold_elsewhere`, `vehicle_unacceptable_condition`, `title_issue`, `duplicate_of_existing_inventory`, `other`.
- `claimed` auto-releases to `in_queue` after **48 hours** of no activity on that claim. The claim-holder is notified at 36h.

### 8.3 Queue view

Default sort: **finalScore DESC, freshness DESC**. Filters:

- Region (Dallas / Houston / Austin / San Antonio / National)
- Source (Apify-Facebook / Apify-Craigslist / AutoTrader / Cars.com / Manual / ...)
- Make
- Price range
- Mileage range
- Score grade
- Status (defaults to `in_queue`)

Each row shows: vehicle (Y/M/M/trim), miles, asking price, MMR delta (`asking − MMR_wholesale`), TAV Value, score, region, source, age. Click → lead detail.

**Real-time updates:** WebSocket (Cloudflare Durable Object or a thin SSE channel — to be decided in an ADR; SSE is acceptable for v1) pushes `lead.claimed`, `lead.released`, `lead.scored`, `lead.expired` events so the queue doesn't show stale "available" leads.

### 8.4 Claim conflict resolution

Backend uses a hard `claim_lock` on `lead_id` (existing pattern — surface in `/app/leads/claim`). On conflict:

- Winner: receives the lead detail and `claimed_by_you=true`.
- Loser: receives `409 { error: "already_claimed", claimed_by: "<email>", claimed_at: "<ts>" }`. UI shows: "Just claimed by <name>" and silently advances to the next lead.

### 8.5 Lead detail page

- Vehicle summary card (YMM, VIN if present, miles, condition signals).
- Pricing panel: asking, MMR, TAV Value, suggested max offer, score breakdown (sub-scores: price-vs-MMR, freshness, region, condition, buy-box rule matched).
- Source panel: original URL (click-through), platform, posted date, last-seen date, freshness state.
- Seller contact (PII — see §8.8).
- Photo gallery (from raw_item).
- Action log (every state transition + every communication).
- Action bar: Claim / Release / Mark contacted / Add offer / Mark won / Mark lost.

### 8.6 Lead-quality feedback loop

Buyer score (input) is stored alongside the eventual outcome. Manager dashboard exposes per-buyer "score-vs-outcome calibration" — average actual gross of leads each buyer rated `high` vs `medium` vs `low`. Not required to ship in v1, but the data must be captured from day one.

### 8.7 Communications

Each lead has a chronological communication log. v1: in-app notes only ("called, left voicemail", "texted asking", etc.). v1.1 Twilio integration adds: outbound call recording reference, SMS thread, automatic activity rows. Schema: `tav.lead_communications { id, lead_id, actor_email, channel ('note'|'call'|'sms'|'email'), direction, body, attachment_url, occurred_at }`. Twilio integration tracked in §15.

### 8.8 PII handling

Seller name, phone, address fields:

- Encrypted at rest (Supabase pgcrypto + key in Cloudflare secret).
- Accessible only to authenticated users in the role matrix (no service-role exposure).
- Retention: **90 days after lead reaches a terminal state** (`won`, `lost`, `expired`). Auto-delete via daily cron, except for `won` leads where seller info promotes to the purchase record.
- Per-seller delete-on-request endpoint (Admin only) for CCPA + future Texas privacy compliance.

### 8.9 Acceptance criteria

- [ ] Queue renders within 1s on staging (P95) for typical filter combos.
- [ ] Claim conflicts resolve deterministically; loser sees who won.
- [ ] Stale claims auto-release at 48h with notification at 36h.
- [ ] Every state transition writes a `lead_actions` row.
- [ ] Lost-lead reason codes are required and limited to the controlled list.
- [ ] Real-time push updates the queue without manual refresh.

---

## 9. Surface 4 — Acquisition Entry

### 9.1 Cold-call lead entry

A form for vehicles found outside the ingestion pipeline.

**Required fields:**

- VIN **or** YMM + miles (one or the other; if YMM, allow VIN to be added later).
- Source URL (where the listing was found).
- Seller contact (name + phone).
- Asking price.

**Optional fields:**

- Trim, color, condition notes, region, photos.

**Workflow:**

1. B/C fills form → submits.
2. System auto-runs TAV-MMR (cache-aware) and shows the result inline before final submit. User confirms or edits TAV Value.
3. On submit: lead created with `status=new`, `source='manual'`, requires Manager approval before entering `in_queue` (see §5.3).
4. Manager queue: "Cold-call leads pending approval" — single-click approve (→ `in_queue`) or reject (→ `removed` with reason).

**Dedupe:** On submit, check VIN (if present) and YMM+region+miles-bucket fingerprint against existing `tav.vehicle_candidates`. If a match exists, present "Existing lead found — merge or create anyway?".

### 9.2 CSV bulk upload

For dealer / auction / wholesaler bulk purchases. **Manager/Admin only.**

**Flow:**

1. **Upload** — drag-drop or click-to-upload. Accept `.csv`, `.xlsx`. Max 10,000 rows / 25 MB.
2. **Template selection** — predefined column maps (TAV-standard, Manheim export, Adesa export, Copart, generic). Templates persisted per Admin.
3. **Column mapping UI** — left: source columns; right: target fields (vin, year, make, model, trim, miles, acquisition_cost, acquisition_date, source, region, ...). Auto-detect with override. Save mapping as a new template.
4. **Validation** — per-row Zod validation:
   - VIN length + character set (warn-only checksum).
   - Year 1990–2035, miles 0–500k, cost > 0.
   - Make in `tav.mmr_reference_makes` (with alias map) — warn if not.
5. **Preview** — table of all rows with status per row (`ok`, `warning`, `error`) and a summary: "847 of 900 will import; 53 errors require fixes." Errors are downloadable as a corrected-template CSV.
6. **Commit** — irreversible to the user; rollback only available to Admin (§5.3).
7. **Result page** — batch summary, link to the rows.
8. **Rollback** — Admin clicks "Roll back batch" → soft-delete via `import_batches.status='rolled_back'`; downstream views exclude rolled-back rows.

**Persistence:** Uses existing `tav.import_batches` + `tav.import_rows` + `tav.sales_upload_batches` + `tav.historical_sales`. v1 extends these only with `rolled_back_at` + `rolled_back_by` columns.

**Audit:** every CSV upload writes `{ uploader_email, file_name, file_hash, template_used, row_counts, batch_id }`.

### 9.3 Cold-call dedupe + audit

Both cold-call and CSV writes feed the same dedupe path (`src/dedupe/fingerprint.ts`). Audit log entries: `cold_call.submitted`, `cold_call.approved`, `cold_call.rejected`, `csv.uploaded`, `csv.committed`, `csv.rolled_back`.

### 9.4 Inventory handoff

When a lead reaches `won` OR a CSV row commits, the system writes a `tav.purchase_outcomes` row with `{ lead_id (nullable for CSV), vin, ymm, acquisition_cost, acquired_at, buyer_email, source }`. The "inventory" surface (a future tab) reads from `purchase_outcomes` + a future `inventory_status` table; v1 ships only the write path, not the inventory UI.

### 9.5 Acceptance criteria

- [ ] Cold-call form auto-runs MMR and shows it before submit.
- [ ] Manager approval queue is visible and actionable in ≤ 1 click.
- [ ] CSV upload supports at least 5 templates with column mapping persistence.
- [ ] Per-row validation reports `ok / warning / error` with downloadable error file.
- [ ] Rollback works end-to-end and excludes rows from KPIs without hard-deleting.

---

## 10. Stack & infrastructure

### 10.1 Frontend stack (confirmed)

- **Framework:** Next.js 15 App Router (already in `web/`).
- **Language:** TypeScript strict.
- **Styling:** Tailwind CSS + `shadcn/ui` component primitives.
- **Data fetching:** TanStack Query (`@tanstack/react-query`). All `/app/*` calls go through the Next.js BFF; the browser never holds `APP_API_SECRET`.
- **Client state:** Zustand for ephemeral UI state (filter panels, modals). Server state stays in TanStack Query.
- **Forms:** React Hook Form + Zod schemas mirroring the backend Zod schemas in `src/types/`.
- **Real-time:** Server-Sent Events from a new Next.js route handler that subscribes to a Supabase Realtime channel (or polls `/app/leads/events` — to be ADR'd). WebSockets only if SSE proves insufficient.
- **Auth:** Cloudflare Access at the edge. Next.js middleware reads `Cf-Access-*` headers and propagates them server-side.
- **Hosting:** Cloudflare Pages (preferred — same control plane as the Worker). Vercel acceptable if Pages can't satisfy a feature.

### 10.2 Environments

| Env | Frontend URL (TBD) | Backend `/app/*` |
|---|---|---|
| dev | local | `wrangler dev` |
| staging | `tav-aip-staging.pages.dev` | `https://tav-aip-staging.rami-1a9.workers.dev/app` |
| production | `app.texasautovalue.com` | `https://tav-aip-production.rami-1a9.workers.dev/app` |

Separate Manheim sandbox credentials in dev + staging; live Cox creds only in production (when provisioned).

### 10.3 Repository layout

Frontend lives in `web/` of the existing repo (already there). No monorepo split needed.

```
web/
  app/
    (auth)/                  # Cloudflare Access redirect helpers
    api/                     # BFF route handlers
      mmr/route.ts
      kpis/route.ts
      leads/...
    (app)/                   # authenticated app shell
      mmr/page.tsx
      dashboard/page.tsx
      queue/page.tsx
      queue/[id]/page.tsx
      entry/cold-call/page.tsx
      entry/csv/page.tsx
      admin/page.tsx
  lib/
    app-api/                 # typed clients for /app/*
    auth.ts
    env.ts
  components/                # shadcn/ui + project components
  hooks/
  tests/
```

---

## 11. API contract

### 11.1 Existing endpoints (do not change without ADR)

Locked in `docs/APP_API.md`:

- `GET /app/system-status`
- `GET /app/kpis`
- `GET /app/import-batches`
- `GET /app/historical-sales`
- `POST /app/mmr/vin`

### 11.2 New endpoints required for v1

Each requires an ADR before implementation. Frontend depends on these — backend agent picks them up before the corresponding screen ships.

| Method | Path | Purpose |
|---|---|---|
| POST | `/app/mmr/ymm` | YMM lookup — same envelope as `/app/mmr/vin`. Body: `{ year, make, model, trim?, mileage }`. Returns `mmrValue`, `tavValue`, `tavValueVersion`, `confidence`, `method`, `cacheHit`, `duplicateOf?: { user_email, pulled_at }`. |
| POST | `/app/mmr/vin` (extension) | Add `tavValue`, `tavValueVersion`, `cacheHit`, `duplicateOf` to the existing response (additive only; old fields unchanged). |
| GET | `/app/dashboard/:level?scope=&since=&until=&granularity=` | Unified dashboard endpoint. `level` ∈ `enterprise|region|team|user|unit`. Returns the universal KPI grammar (§7.3) blocks A–F plus sparkline series. Each block independently degrades. Supersedes the older single-purpose `/app/kpis` for dashboards (kept for back-compat). |
| GET | `/app/dashboard/series?scope=&kpi=&since=&until=&granularity=&compare=` | Time-series data for one KPI tile's expanded chart. `compare` ∈ `prior_period|prior_year|none`. Returns `{ points: [{date, value}], compare: [{date, value}], goal?: number }`. |
| GET | `/app/dashboard/drilldown?scope=&kpi=&since=&until=` | Underlying rows that compose a tile (leads/outcomes/sales/commissions) — the click-into-tile result set. |
| GET | `/app/units/:id` | Full unit detail page (§7.6): vehicle, lifecycle timeline, valuation history, financial P&L, commissions, attachments. |
| GET | `/app/leaderboard?since=&sort=` | Returns ranked array of `{ user_email, display_name, units_acquired, avg_gross, total_gross, total_commission, conversion_rate, gross_per_day, ... }`. |
| GET | `/app/commissions?user=&since=&status=` | Per-user commission rows; supports `pending|approved|paid` status filter. |
| POST | `/app/commissions/:id/approve` | Admin only. Marks commission row approved. |
| POST | `/app/commissions/payroll` | Admin only. Creates a payroll batch from approved rows. |
| GET | `/app/goals?scope=&kpi=` | Read goals for a scope. |
| POST | `/app/goals` | Admin only. Set/update a goal. |
| GET | `/app/dashboard/views` | Saved views for the current user. |
| POST | `/app/dashboard/views` | Save a view (scope + filters + granularity). |
| GET | `/app/kpis` (extension) | Add `acquisition.*` and `inventory.*` blocks per §7.3. Kept for back-compat with the existing system-status header tile. |
| GET | `/app/leads?status=&region=&...` | Paginated lead queue. |
| GET | `/app/leads/:id` | Single lead detail. |
| POST | `/app/leads/:id/claim` | Atomic claim. 409 on conflict. |
| POST | `/app/leads/:id/release` | Self-release. |
| POST | `/app/leads/:id/transition` | Body: `{ to_status, reason?, offer? }`. Validates allowed transitions per §8.2. |
| POST | `/app/leads/:id/communications` | Append a communication row. |
| GET | `/app/leads/events` (SSE) | Real-time stream of `lead.claimed / released / scored / expired`. |
| POST | `/app/cold-call` | Create cold-call lead (pending approval). |
| POST | `/app/cold-call/:id/approve` | Manager approval → `in_queue`. |
| POST | `/app/imports/csv` | Multipart upload → returns `batch_id` in `pending` state with parsed rows. |
| POST | `/app/imports/:batch_id/commit` | Commit the batch. |
| POST | `/app/imports/:batch_id/rollback` | Admin only. Soft-deletes the batch. |
| GET | `/app/audit?actor=&since=` | Audit-log query (scope-checked by role). |
| GET | `/app/users` | User directory for assignment dropdowns. |

All responses follow the existing envelope: `{ ok: true, data: ... }` / `{ ok: false, error: "...", issues? }`. All errors are non-blocking where the existing pattern dictates (5xx is retryable; 4xx is a client bug).

### 11.3 Rate limits + cost tracking

- Frontend respects 5 req/sec to `/app/mmr/*` per user (matches the Manheim worker's upstream limit).
- Cost dashboard (Admin) reads from a new `tav.api_costs` table (Manheim, Twilio, licensed feeds) with budget alerts at 80% of monthly budget.

---

## 12. Design system & UX standards

These are guardrails for Claude Design. Detailed visual direction is owned by Claude Design; this section sets the constraints.

### 12.1 Brand

- TAV palette: deep navy primary, signal-orange accent, neutral grays. Final hex values from the brand guide (Rami to provide; otherwise default to `#0B2A4A` + `#E26A1F`).
- Typography: Inter for UI text, JetBrains Mono for VINs and numeric tabular data.
- No emoji in product UI.

### 12.2 Density

- Operator tool, not consumer app. Default density is **compact**: 32px row height, 14px body text, 12px secondary.
- One-screen-no-scroll target for: TAV-MMR result, lead detail header + actions, queue first page.

### 12.3 Mobile / responsive

- Buyers evaluate cars on phones at lots. Mandatory mobile breakpoints (≥ 360px width):
  - **TAV-MMR:** fully usable on mobile (input, result, primary actions).
  - **Buy Box queue:** card-mode on mobile (one lead per card), filters in a bottom sheet.
  - **Lead detail:** fully usable on mobile (actions, communication log, photos).
- **Optional on mobile:** Performance Dashboard (CSV/PDF export), CSV upload, audit log.

### 12.4 Empty / loading / error states

Every list and tile has explicit states. No bare spinners. Empty state shows next action ("Pull a VIN", "Score a lead"). Error state shows the `missingReason` code translated to plain English plus a "Retry" affordance.

### 12.5 Accessibility

- WCAG AA color contrast.
- Keyboard navigation for queue → claim → transition flow (power-user shortcut keys: `j`/`k` to navigate, `c` to claim, `r` to release, `w` to mark won).
- All form fields have associated labels and live validation messages.

---

## 13. Notifications service

A single notifications service used by every surface — built once, consumed everywhere.

**Channels (v1):** in-app (toast + notification bell) and email.
**Channels (v1.1):** push (PWA), SMS (Twilio).

**Trigger events:**

- `mmr.duplicate_detected` — to the second puller.
- `lead.claimed_by_me_expiring` — at 36h.
- `lead.assigned_to_me` — when Manager reassigns.
- `lead.scored_by_team` — to managers, batched daily.
- `csv.import_complete` — to uploader.
- `cold_call.pending_approval` — to managers.
- `system.budget_threshold` — to admins.

**Persistence:** `tav.notifications { id, recipient_email, channel, event, payload, sent_at, read_at }`.

**Frontend:** notification bell in header, badge count, infinite-scroll inbox view. Click marks read.

---

## 14. Phased delivery plan

**Phase 0 — Foundation (1 sprint)**
- Cloudflare Access wired to Next.js BFF; role detection working end-to-end.
- App shell (header, sidebar, auth-gated routing).
- Typed `/app/*` client in `web/lib/app-api`.
- Empty stub pages for the four surfaces.
- ADR: SSE-vs-WebSocket; finalize choice.

**Phase 1 — TAV-MMR (1 sprint)**
- VIN + YMM input.
- `/app/mmr/ymm` endpoint shipped on backend.
- TAV Value v1.0 formula implemented in intelligence worker; exposed via `/app/mmr/*` responses.
- Duplicate-pull banner with role-gated visibility.
- Permanent history writes to `mmr_queries`.

**Phase 2 — Performance Dashboard — Enterprise drill-down (3 sprints)**
- Sprint 2a — Data foundation:
  - New rollup tables (`metrics_daily_user/region/team/enterprise`) + nightly cron + backfill job.
  - New commission tables (`commission_plans`, `commission_plan_assignments`, `commissions`) + computation hooks on `purchase_outcomes` write and `historical_sales` sale_price update.
  - `tav.performance_goals` + `tav.dashboard_views` + `tav.dashboard_subscriptions` tables.
- Sprint 2b — API + L1/L2/L3 levels:
  - `/app/dashboard/:level`, `/app/dashboard/series`, `/app/dashboard/drilldown`, `/app/leaderboard`, `/app/commissions*`, `/app/goals*`.
  - Enterprise, Region, and Team pages with the full KPI grammar (blocks A–F), sparklines, granularity toggle, drilldown panel, breadcrumb, CSV export.
- Sprint 2c — L4 User + L5 Unit + polish:
  - User dashboard with personal P&L, commission tiles (pending vs paid), MMR activity, score calibration.
  - Unit page with lifecycle timeline, full financial P&L, commission breakdown, attachments.
  - PDF snapshot export per level; scheduled email digests.
  - Goals UI + projection lines on tiles.
- Sprint 2d — Sale Week (Wednesday cycle):
  - Migrations for `sale_weeks`, `manheim_sale_results`, `tav_weekly_units`, `consignors`, `consignment_plans`, `consignment_units`.
  - New Manheim sales integration in `tav-intelligence-worker` (inventory, sale results, OVE) + hourly cron + nightly reconciliation.
  - `/app/sale-weeks*` endpoints + `/dashboard/sale-week/:id` page with headline tiles, owned vs consignment tabs, no-sale/if-bid tab, channel mix, buyer breakdown.
  - Sale Week granularity option added to the universal granularity toggle.

**Phase 3 — Buy Box Queue (2 sprints)**
- `/app/leads*` + `/app/leads/events` (SSE).
- Queue list, filters, real-time updates.
- Lead detail, transitions, communication log (notes-only).
- Claim conflict handling, stale-claim auto-release cron.

**Phase 4 — Acquisition Entry (1 sprint)**
- Cold-call form with inline MMR + approval queue.
- CSV upload with column mapping, validation, preview, commit, rollback.

**Phase 5 — Notifications + Audit (1 sprint)**
- Notifications service end-to-end.
- Audit log viewer (own / all).
- Cost dashboard skeleton.

**Phase 6 — Hardening + polish**
- Mobile QA on the three mandatory mobile surfaces.
- Performance budget pass (P95 targets).
- Load test the queue at 10k active leads.
- PDF export for dashboard.

---

## 15. Open follow-ups (do NOT block v1)

- **Sell-through rate** — blocked on acquisition-time `purchase_outcomes` writes (`docs/followups.md`).
- **Twilio integration** — call recording + SMS thread on lead.
- **Inventory surface** — read view on top of `purchase_outcomes` + future `inventory_status`.
- **Sell-side surface** — Manheim listing/inventory API integration (separate from MMR).
- **Pricing recommendation engine** — MMR + TAV + recon + transport + region + condition → recommended max offer (TAV Value v2.0).
- **Photo similarity dedupe** — currently text-fingerprint only.
- **ML-driven buy box** — after 2026 purchase outcomes accumulate.
- **CCPA / Texas data-privacy** — formalize seller-info deletion endpoint.
- **Live Cox production credentials** — replace sandbox MMR in production. **Required before Sprint 2d ships** — the Sale Week surface needs live Manheim seller/inventory APIs, not sandbox.
- **Split Buyer vs Closer roles** — when team grows past ~30, revisit hybrid decision.

---

## 17. Existing data — 18 weeks of 2026 sales

The database already contains the **first 18 weeks of 2026 sales** loaded into `tav.historical_sales` (one row per sold vehicle, with `sale_date`, `acquisition_cost`, `sale_price`, `transport_cost`, `recon_cost`, `auction_fees`, and the STORED `gross_profit` column). This is roughly **Jan 1 → early May 2026**, anchored on TAV's Wednesday sale cycle.

This isn't a blank slate — it changes how v1 ships:

### 17.1 What we get on day one

- Every Sell-side KPI in §7.3 block C has real data immediately: units sold, total revenue, total gross profit, avg front gross, avg hold days, gross margin %, gross per day held.
- Sale Week (§7.13) has **18 weeks of backfilled history** the moment the schema lands — the Sale Week page is not empty on launch.
- Per-buyer / per-region trend lines are charted from week 1, not collected over time.
- TAV Value v1.0 (§6.4) has 18 weeks of comps for the `recencyAdjustment` step — the 25-sales-in-180-days threshold is achievable for most segments on day one.
- The leaderboard is meaningful immediately; rank order reflects real Q1–early-Q2 performance.

### 17.2 Backfill normalization tasks

Before the dashboard renders against this data, three normalization tasks need to land. Each is a small migration + a one-time job.

**(a) Map every existing `historical_sales` row to a `sale_week_id`.**

- Migration adds `sale_week_id text` to `historical_sales`, nullable, indexed.
- One-time job: for each row, resolve `sale_week_id` from `sale_date` (snap to the Wednesday of that ISO week using TAV's calendar in `tav.sale_weeks`).
- Seed `tav.sale_weeks` for all 18 weeks (`2026-W01` … `2026-W18`) with `status='reconciled'`.
- Going forward, any new `historical_sales` insert resolves `sale_week_id` in the same trigger.

**(b) Map every existing row to a Buyer+Closer identity where possible.**

- `historical_sales` already has `buyer`, `buyer_user_id`, and `buyer_email` (via `sales_upload_batches.uploaded_by_email` + `historical_sales.buyer_user_id`). Backfill job reconciles these against the active Cloudflare Access user list.
- Rows with no matching user get `buyer_user_id='legacy_unmapped'` — they still aggregate at enterprise/region levels but do not show up on personal dashboards.
- An Admin tool in `/admin/historical-sales/remap` allows manual reassignment (e.g., "this CSV's `buyer = JS` is actually `jsmith@texasautovalue.com`").

**(c) Backfill `tav.tav_weekly_units` from the 18 weeks.**

- For each historical sale, create a corresponding `tav_weekly_units` row with `ownership='owned'` (these are all owned units — consignment data isn't in the historical set yet).
- `outcome_id` is left null where `purchase_outcomes` doesn't have a matching acquisition row; create a thin `purchase_outcomes` row for each historical sale to maintain referential integrity (acquisition_cost + acquired_at from the CSV).
- Manheim result join (`result_join_id`) stays null for backfilled weeks — historical Manheim lane data isn't in scope for v1 retrofit. Going forward (week 19+), the Manheim sync populates it.

### 17.3 Acquisition data implications

The 18 weeks include `acquisition_date` and `acquisition_cost` for the sold units, but **not** acquisition-time outcomes for unsold inventory. This means:

- The sell-through rate metric (§7.3 block C) **remains blocked** for the historical period — the denominator ("vehicles acquired this period") is incomplete because we don't have rows for acquired-but-not-yet-sold cars.
- Going forward from week 19, the lead→won→outcome path writes `purchase_outcomes` rows at acquisition time, making sell-through computable for new periods.
- The dashboard makes this distinction explicit: "Sell-through rate · available from week 19 onward."

### 17.4 Commissions for the backfilled period

Commissions (§7.5) need a policy decision before they're computed against historical data.

**Recommended default (locked unless overridden):**

- Commission tables (`commission_plans`, `commission_plan_assignments`, `commissions`) exist from day one.
- No commission rows are auto-computed for `historical_sales` rows where `created_at` is before the platform launch date.
- Admin has a one-click "Backfill commissions for sale_week range" tool that applies the currently-active plan retroactively, with a confirmation step — in case TAV wants to retroactively pay against the new model for some or all of the 18 weeks.
- The plan snapshot is always frozen on each row, so a later policy change never rewrites historical payouts.

### 17.5 Acceptance criteria for the backfill

- [ ] `tav.sale_weeks` seeded with `2026-W01` … `2026-W18`, status `reconciled`.
- [ ] `historical_sales.sale_week_id` populated on every existing row; trigger keeps new rows in sync.
- [ ] Every historical row mapped to a user OR explicitly marked `legacy_unmapped`; Admin remap tool functional.
- [ ] `tav_weekly_units` rows exist (`ownership='owned'`) for every historical sale.
- [ ] Enterprise, Region, Team, and User dashboards render real numbers for weeks 1–18 on first load.
- [ ] Sale Week page renders for every backfilled week with Lane B (TAV) data; Lane A (Manheim) is null with `missingReason: "manheim_history_not_backfilled"`.
- [ ] Sell-through rate explicitly labeled as "available from week 19 onward."
- [ ] Commission backfill is opt-in via Admin tool, not automatic.

### 17.6 Open questions on the backfill

These don't block the schema work but need answers before commission backfill and the legacy_unmapped tool can ship:

1. Should every sold unit in the 18 weeks be backfilled into `purchase_outcomes` (creating thin acquisition records), or should `historical_sales` remain the only source for that period?
2. For rows where `buyer` is set but doesn't map to a current Cloudflare Access user, do we want a "former employee" identity bucket vs. dropping them into `legacy_unmapped`?
3. Does TAV want to retroactively pay commission against the new platform model for the 18 backfilled weeks, or treat that period as "legacy comp" and start commission tracking at week 19?
4. Are any of the 18 weeks **consignment-inclusive** (i.e., did `historical_sales` capture units we moved for others)? If so, we need a column/flag to separate them — the schema currently assumes all 18 weeks are owned units.

---

## 18. Handoff checklist for Claude Code

Before any UI is generated, confirm:

- [x] Roles & permissions matrix locked (§5).
- [x] Lead lifecycle states locked (§8.2).
- [x] KPIs v1 locked (§7.2).
- [x] TAV Value v1.0 formula locked (§6.4).
- [x] Data acquisition method locked (§8.1).
- [x] Manheim sandbox in use; live Cox cutover tracked separately (§3, §15).
- [x] Frontend stack confirmed (§10.1).
- [x] New `/app/*` endpoints enumerated (§11.2).

Suggested implementation order matches §14. **Start with Phase 0 + the role-detection middleware** — every other screen depends on knowing who the user is.

For Phase 2 specifically: before any UI is built, land the **§17 backfill normalization migrations** (sale_week_id on `historical_sales`, seed `sale_weeks` weeks 1–18, populate `tav_weekly_units` for owned). The dashboard and Sale Week page should never see a half-mapped dataset on first render.

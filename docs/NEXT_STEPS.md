# Next Steps â€” MMR Lab

**Last updated:** 2026-07-10 · **Focus:** Items **44** (listed date), **46** (listing→Cox autofill); **51** fuller list TBD

> **Fresh chat prompt:**
> Sprint so far (through 2026-07-10): **40–43**, **45/47**, **48–50**, **52** shipped on `main`. Queue counts/Received (`6486776`); VIN save + valuation refresh (`fe50370`); **VIN → Y/M/M/S + live valuation** (`#48`); **flag/dismiss bad lead** (`#45/47` — `POST …/dismiss` → `bad_lead` + reason; excluded from default queues); web-ci lint/typecheck guards (`c374bf3`, `5ead1cd`); snappy queue tabs (`e55015b`). Next: **51** (workflow labels / fuller list TBD), **53** (salesperson/appraiser directory). Queued: **44** (listed date), **46** (listing→Cox autofill). See **Product principle** + active table below.

**Legend:** `[x]` done Â· `[~]` in progress Â· `[ ]` not done

---

> ## Product principle — identity paths + always-fresh valuation
>
> **Confirmed 2026-07-09 (buyer screenshot + feedback); shipped 2026-07-10 (#48):** Entering a VIN on opportunity detail (e.g. `7MUCAAAG7NV022177`) decodes via Cox, fills catalog Make/Model/Series, and remounts valuation for fresh MMR/Max buy. Year may already be present from the listing.
>
> **Intuitive dual path (both must work):**
> 1. **VIN-first** — enter/save a valid VIN → decode → fill Y/M/M/(S) from Cox → persist → run **fresh** MMR + Max buy (item **48**).
> 2. **Y/M/M/S-first** — pick catalog year/make/model/series (no VIN or VIN later) → same fresh MMR + Max buy path (items **46**, valuation block).
>
> **Non-negotiable:** Whatever path the closer uses, the detail page must surface **current** MMR and Max buy — not stale saved cards when identity just changed, and not a blank valuation after VIN/YMM edits. Closers will not all work the same way; the app must not punish either path.
>
> **Rules for future identity/valuation work:**
> 1. After a successful VIN decode or Y/M/M/S save that changes valuation identity, auto-run (or clearly offer) live MMR + Max buy — do not require a separate tribal-knowledge “Refresh valuation” as the only path.
> 2. VIN decode must write Cox-catalog-compatible dropdown values (reuse `matchCatalogOption` / item **46** helpers) — orphan free-text in selects is a failure.
> 3. Failed decode/lookup: keep user input, show an error, do not clear YMM or wipe a prior good valuation (see **49** / **50**).
> 4. Prefer one shared “identity → valuation” pipeline for detail + MMR Lab so behavior stays consistent.

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

**This doc:** Active buyer-facing work on **Opportunities** (queue + detail). Queue tab parity/freshness/latency (**40–43**, **52**), detail VIN-save / refresh bugs (**49–50**), and **VIN → Y/M/M/S + live valuation** (**48**) are done. Next focus is **flag/dismiss bad lead** (**45/47**). MMR Lab / opportunity detail items 2–39 remain complete.

| Area | Path |
|------|------|
| Opportunities page | `web/app/(app)/opportunities/page.tsx` |
| New-mode client | `web/app/(app)/opportunities/_components/opportunities-client-new.tsx` |
| Queue tabs + summary | `web/app/(app)/opportunities/_components/opportunities-queue-tabs.tsx` |
| Table + columns | `web/app/(app)/opportunities/_components/opportunities-table-new.tsx` |
| Detail client | `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx` |
| Valuation block | `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx` |
| Client view filter | `web/lib/opportunities/view-filter.ts` |
| Page fetch + fallback | `web/lib/app-api/opportunities-page-fetch.ts` |
| Worker list + view rules | `src/persistence/opportunities.ts` |
| API route | `src/app/routes.ts` (`GET /app/opportunities`) |
| Column prefs | `web/lib/opportunities/table-preferences.ts` |
| Web CI Cursor rule | `.cursor/rules/web-ci-react-effects.mdc` (lint + typecheck before push) |

### Verify (after each item)

```bash
cd web && npm run lint && npm run typecheck && npm test
cd .. && npm run lint && npm run typecheck && npm test
```

---

## Active work

### Shipped this sprint (2026-07-06 → 2026-07-10)

| # | Item | Commit(s) | Notes |
|---|------|-----------|--------|
| **40–41** | Queue tab count/list parity (Needs action / Mine) | `6486776` | Server `total` + aligned Mine identity |
| **42** | **Received** timestamp column + sort | `6486776` | Default sort `received_desc` |
| **49** | VIN cleared on save | `fe50370` (+ CI follow-ups `c374bf3`, `5ead1cd`) | Local detail state from PATCH; during-render prop sync |
| **50** | Refresh valuation wipe | `fe50370` | Keep prior cards; restore on failure |
| **43** | Tab switch latency | `e55015b` | `staleTime` 60s, `placeholderData`, hover prefetch, tab spinner |
| **52** | Double-click / dead UI on tabs | `e55015b` | Optimistic tab selection; shell stays mounted |
| **48** | VIN → Y/M/M/S + fresh MMR/Max buy | `3dfd38a` | Decode on VIN blur/save → catalog fill + valuation remount |
| **45/47** | Flag/dismiss bad lead | _(pending commit)_ | Queue Flag → reason dialog → `bad_lead`; excluded from default views |

**Also:** Expanded buyer email backlog **47–53** + product principle (VIN + YMM paths, always-fresh valuation). Web-ci Cursor rule requires lint+typecheck before push.

### Still open

| # | Item | Priority | Status |
|---|------|----------|--------|
| **51** | **Expand workflow statuses (buyer email #5)** — Bad Lead shipped as `bad_lead`; Purchased exists; fuller list pending from buyer | **High** | [~] |
| **44** | **Listing posted date** — marketplace post time (distinct from Received); ingest may need `posted_at` | **High** | [ ] |
| **46** | **Cox Y/M/M autofill from listing** — map parser identity to Cox catalog tokens | **High** | [ ] |

**Full status board (incl. shipped):**

| # | Item | Priority | Status |
|---|------|----------|--------|
| **40** | **Needs action** tab — badge/summary shows `(1)` but table lists many rows | **Critical** | [x] |
| **41** | **Mine** tab — badge shows `(1)` but tab body is empty | **Critical** | [x] |
| **42** | **Lead received timestamp** — show when the lead came in; sort/filter by freshness | **Critical** | [x] |
| **43** | **Tab switch latency** — Needs action / Mine / Worth a look / All feel slow (~2s) after click | **High** | [x] |
| **44** | **Listing posted date** — show when the seller listed the vehicle on the marketplace (distinct from Received / first seen) | **High** | [ ] |
| **45** | **Dismiss opportunity** — right-side queue action with required reason; remove from active views | **High** | [x] |
| **46** | **Cox Y/M/M autofill** — map listing-parsed identity to Cox catalog tokens so MMR Lab / detail valuation can run without manual dropdown hunting | **High** | [ ] |
| **47** | **Flag bad lead (buyer email #1)** — reason vocabulary: not a good lead, Title Issues, Dealer, etc.; filters out for everyone | **Critical** | [x] |
| **48** | **VIN → Y/M/M/S + fresh MMR/Max buy** — enter VIN → fill catalog Y/M/M/(S) + live valuation (confirmed UX 2026-07-09) | **Critical** | [x] |
| **49** | **VIN cleared on save (buyer email #3)** — VIN input empties after save | **Critical** | [x] |
| **50** | **Refresh valuation wipes results (buyer email #4)** — Refresh clears everything and returns nothing | **Critical** | [x] |
| **51** | **Expand workflow statuses (buyer email #5)** — Bad Lead + Purchased minimum; fuller list pending from buyer | **High** | [~] |
| **52** | **Double-click / app-wide action lag (buyer email #6)** — tabs and actions need 2 clicks; whole-app feel | **Critical** | [x] |
| **53** | **Salesperson / Appraiser lookup (buyer email #7)** — dropdown + admin add/remove (no free text) | **High** | [x] |

**Buyer email 2026-07-09 → item map:** #1→47 (+45) · #2→48 (+46) · #3→49 · #4→50 · #5→51 · #6→52 (+43) · #7→53

_Paused until flag/dismiss **45/47** ships (or in parallel):_ UX backlog §4–7 (role nav, shell polish). Queue latency **43/52** done (web quick wins; Worker SQL push still optional if network remains slow).

---

## 40 — Needs action tab: count does not match table

**Reported:** 2026-07-06 (production New mode, `/opportunities`)

**Symptom:**

- Summary line: `1 need you · No new listings today`
- **Needs action** tab badge: `(1)`
- Clicking **Needs action** shows **many** rows (e.g. 7+ vehicles), not 1

**Expected:** Tab badge, summary line, and visible table rows must use the **same** filter rules and the **same** total.

### Likely root cause (code review 2026-07-06)

Tab counts and table body use **different code paths**:

| Surface | Source | File |
|---------|--------|------|
| Tab badge `(1)` | `extractTotal()` on count-only API response (`limit: 1`) | `opportunities-client-new.tsx` |
| Table rows | `displayResult` re-filters `result.data.items` client-side, then paginates | `opportunities-client-new.tsx` + `view-filter.ts` |

Comment in client already acknowledges drift: _"Always align table rows with the active tab (API count can differ from list body)."_

Additional split-brain risk:

- `fetchOpportunitiesPage` may **classic-fallback** to an unfiltered array and apply view rules in the browser (`opportunities-page-fetch.ts` + `shouldApplyClientViewFilter`).
- Count requests and list requests can therefore disagree on which rows match `needs_action`.
- Server view rules: `src/persistence/opportunities.ts` → `matchesNeedsAction` (uses workflow map).
- Client view rules: `web/lib/opportunities/view-filter.ts` → `matchesNeedsAction` (uses row fields only). Rules are intended to mirror but are not guaranteed identical after fetch/fallback.

`needs_action` definition (both tiers today): unassigned (`!assignedTo`), OR manual submission with `status` new/null, OR active claim expiring within 4h.

### Investigation steps

1. In browser devtools, compare network calls for tab load:
   - Count: `GET /api/app/opportunities?limit=1&offset=0&sort=spread_desc&view=needs_action`
   - List: same with `limit=25`
   - Confirm `data.total` vs `data.items.length` and whether items actually match `needs_action`.
2. Check whether list response is paginated `{ items, total, offset }` or legacy array (triggers client fallback).
3. Log how many rows pass `matchesNeedsAction` client-side vs server `total`.

### Fix direction

- **Single source of truth:** tab count must be derived from the **same filtered set** as the table (prefer server-side `total` on the list query; do not maintain a separate count query with different fetch behavior).
- Remove or narrow `displayResult` client re-filter if the Worker already applies `view=` correctly.
- If client fallback stays, count queries must use the **same** fallback path so `total` matches.
- Add regression tests: count === filtered row total for each view (`needs_action`, `mine`, `worth_a_look`).

### Primary files

- `web/app/(app)/opportunities/_components/opportunities-client-new.tsx`
- `web/lib/app-api/opportunities-page-fetch.ts`
- `web/lib/opportunities/view-filter.ts`
- `src/persistence/opportunities.ts`
- `web/lib/app-api/opportunities-page-fetch.test.ts`
- `web/app/(app)/opportunities/_components/opportunities-client-new.test.tsx`

### Exit criteria

- [ ] **Needs action** badge count equals number of rows on page 1 (and `data.total` from API)
- [ ] Summary line `N need you` matches **Needs action** badge
- [ ] Switching tabs does not show a full queue under a `(1)` badge
- [ ] Unit + integration tests lock count/list parity per view

---

## 41 — Mine tab: count shows 1, list empty

**Reported:** 2026-07-06 (production New mode, `/opportunities`)

**Symptom:**

- **Mine** tab badge: `(1)`
- Clicking **Mine** shows empty state: _"Nothing assigned to you yet"_
- User expects one assigned or claimed deal

**Expected:** If badge is `(1)`, exactly one row visible (or clear empty state with badge `(0)`).

### Likely root cause (code review 2026-07-06)

Same count-vs-list split as item **40**, plus a **Mine-specific identity mismatch**:

| Layer | `matchesMine` logic |
|-------|---------------------|
| Worker (`opportunities.ts`) | `row.assignedTo === viewerUserId` OR active claim where `workflow.claimedByUserId === viewerUserId` |
| Web (`view-filter.ts`) | `row.assignedTo === viewerUserId` OR active claim where `row.claimedBy === viewerDisplayName` |

Server count can match on **user id**; client list filter can drop the row if `claimedBy` on the row is a **user id string** (see `mapToOpportunityRow`: `claimedBy: claimedByName ?? claimedBy`) while the client compares **display name**.

`displayResult` always re-applies client `matchesMine` after fetch — so API can return `total: 1` while client filter yields **0 rows**.

`view=mine` also requires `GET /app/me` before fetch (`enabled: view !== "mine" || meQuery.isSuccess`) — verify `viewerUserId` / `viewerDisplayName` passed consistently to count and list queries via `viewerFetchOptions`.

### Investigation steps

1. Identify the row the server counts as "mine" (assigned vs claimed; user id vs display name).
2. Compare `assignedTo`, `claimedBy`, `claimExpiresAt` on that row to signed-in `getAppMe` payload.
3. Confirm count query and list query both pass the same `viewerUserId` / `viewerDisplayName` headers/options.

### Fix direction

- Align client `matchesMine` with server: match **user id** for claims (`claimedByUserId`), not display name only.
- Ensure `claimedBy` on `OpportunityRow` is unambiguous (separate `claimedByUserId` + `claimedByName` if needed).
- Derive tab badge from list `total` after unified filter (same as item 40).

### Primary files

- `web/lib/opportunities/view-filter.ts`
- `src/persistence/opportunities.ts` (`matchesMine`, `mapToOpportunityRow`)
- `web/app/(app)/opportunities/_components/opportunities-client-new.tsx`
- `web/lib/opportunities/view-filter.test.ts`

### Exit criteria

- [ ] Assign deal to signed-in closer → **Mine** shows `(1)` and one row
- [ ] Claim deal → **Mine** shows row for claim owner
- [ ] Badge `(0)` when nothing assigned/claimed (no false `(1)`)
- [ ] Tests cover assignee-by-id and claim-by-id (not display-name-only)

---

## 42 — Lead received timestamp (freshness)

**Reported:** 2026-07-06 — **critical for buyer workflow**

**Symptom:**

- New-mode Opportunities table has no visible **when did this lead arrive?** column
- Buyers cannot tell which leads are freshest; default sort is `spread_desc`, not arrival time
- `lastSeenAt` exists but is **hidden by default** in column picker and reflects **last scrape**, not lead creation

**Expected:** Buyers can see and sort by when the opportunity became actionable (lead received / first surfaced), newest first.

### Data model notes

| Field | Source today | Meaning |
|-------|----------------|---------|
| `firstSeenAt` | `normalized_listings.first_seen_at` | First time listing was ingested |
| `lastSeenAt` | `normalized_listings.last_seen_at` | Last scrape (updates on re-ingest) |
| `leads.created_at` | **Not exposed** on `OpportunityRow` | When lead record was created — closest to "lead came in" |

Manual submissions have `manual_opportunity_submissions.created_at` — also not on queue row today.

### Product decision (confirm at implementation)

| Option | Label | Sort | Best for |
|--------|-------|------|----------|
| A (recommended) | **Received** | `leads.created_at` (or manual `created_at`) | "When we decided this is a lead" |
| B | **First seen** | `first_seen_at` | When listing first hit the system |
| C | Both | Two columns | Power users; may be noisy |

Default queue sort for **Needs action** / **All** should likely be **newest received first**, not spread.

### Implementation sketch

1. Worker: add `receivedAt` (or `leadCreatedAt`) to `OpportunityRow` in `mapToOpportunityRow` from `lead.created_at`, else manual submission `created_at`, else `first_seen_at` fallback.
2. Web schema: extend `OpportunityRow` in `web/lib/app-api/schemas.ts`.
3. Table: add **Received** column — **visible by default** in `table-preferences.ts`.
4. Sort: add `received_desc` (or `lead_created_desc`) to `OPPORTUNITY_SORTS` in Worker + sort dropdown in New table.
5. Optional: show relative time in Vehicle cell ("2h ago") for scan speed.

### Primary files

- `src/persistence/opportunities.ts` (`LEAD_COLUMNS`, `mapToOpportunityRow`, `sortOpportunityRows`)
- `src/app/routes.ts` (`OPPORTUNITY_SORTS`)
- `web/lib/app-api/schemas.ts`
- `web/lib/opportunities/table-preferences.ts`
- `web/app/(app)/opportunities/_components/opportunities-table-new.tsx`
- `test/app.routes.test.ts` / `web/app/(app)/opportunities/_components/opportunities-table-new.test.tsx`

### Exit criteria

- [ ] **Received** (or agreed label) column visible by default on New-mode queue
- [ ] Timestamp reflects lead creation for `type=lead` rows (verified against Supabase `tav.leads.created_at`)
- [ ] Manual submissions show submission time
- [ ] Sort **Newest first** available and documented; consider making it default for `needs_action`
- [x] Tooltip explains difference vs "Last seen" if both shown

---

## 43 — Tab switch latency (queue feels slow)

**Reported:** 2026-07-06 (production New mode, `/opportunities`) — **fixed 2026-07-09** (`e55015b`)

**Symptom (before fix):**

- Clicking **Needs action**, **Mine**, **Worth a look**, or **All** waits ~1–3 seconds before the table updates
- UI feels unresponsive during the gap (no instant feedback or stale rows held in place)
- Buyers switching tabs frequently notice the pause on every click

**Expected:** Tab switch feels **instant** — previous rows stay visible with a light loading state, or cached data shows immediately while revalidating in the background. Target: perceived switch **&lt; 200ms**; network refresh can complete asynchronously.

### Likely contributors (code review 2026-07-06)

| Layer | What happens today | File |
|-------|-------------------|------|
| **Tab click** | `router.replace` updates `?view=` → new React Query key → **fresh fetch** every switch | `opportunities-client-new.tsx` |
| **List query** | No `staleTime` / `placeholderData` on main list query (unlike summary queries at 60s) | `opportunities-client-new.tsx` |
| **Network path** | Browser → Next `/api/app/opportunities` → Cloudflare Worker → Supabase (full round trip per tab) | `web/app/api/app/*`, `src/app/routes.ts` |
| **Worker assembly** | `listOpportunities` with `view=` fetches up to **500** listings, then joins valuations, leads, manual submissions, workflow, maxbuy summaries, filters in memory, sorts, paginates | `src/persistence/opportunities.ts` |
| **Parallel load on mount** | Four extra summary queries (tab counts + new-today) compete for Worker/DB on first paint | `opportunities-client-new.tsx` (`useQueries`) |
| **No prefetch** | Hovering a tab does not warm the cache for that view | — |

### Investigation steps

1. DevTools **Network**: measure `GET /api/app/opportunities?view=…` duration per tab switch (TTFB + total). Compare views.
2. DevTools **Performance**: confirm table unmounts or shows blank vs keeps previous rows during fetch.
3. Worker logs / Supabase: check whether latency is DB-bound (large `normalized_listings` scan + N joins) or Worker CPU (in-memory filter on 500 rows × 4 views).
4. Repeat after cache warm (second click on same tab) — if still slow, caching is not helping.

### Fix direction (pick smallest wins first)

**Web (quick wins):**

- `placeholderData: keepPreviousData` (TanStack Query v5: `placeholderData: (prev) => prev`) on the list query so rows don't disappear while refetching
- Add `staleTime` (e.g. 30–60s) on list queries so revisiting a tab serves cache immediately
- **Prefetch** adjacent tabs on hover/focus (`queryClient.prefetchQuery` with each `view`)
- Show subtle **tab-level loading** indicator (spinner on active tab or table overlay) so the wait is visible, not a dead UI
- Consider `router.replace` + `startTransition` to avoid blocking paint

**API / Worker (if network is the bottleneck):**

- Reduce `MAX_FETCH` work for view-filtered requests or push `view` filters closer to SQL (assigned_to, claim expiry) instead of assembling 500 rows then filtering in memory
- Dedicated **count-only** endpoint or `?countOnly=true` so summary badges don't each trigger full assembly
- Index / query plan review on `normalized_listings.last_seen_at`, `leads.assigned_to`, workflow tables
- Optional short-lived **edge cache** for paginated queue responses (careful with auth + mine view)

**Do not:**

- Re-introduce client-side double-filtering (items 40–41 regression risk)

### Primary files

- `web/app/(app)/opportunities/_components/opportunities-client-new.tsx`
- `web/app/(app)/opportunities/_components/opportunities-queue-tabs.tsx`
- `web/lib/app-api/opportunities-page-fetch.ts`
- `web/lib/query.ts` (`queryKeys.opportunitiesPage`)
- `src/persistence/opportunities.ts` (`listOpportunities`, `MAX_FETCH`)
- `src/app/routes.ts`

### Exit criteria

- [x] Tab switch keeps previous table visible during refetch (no empty flash) — `placeholderData` on list query
- [x] Second visit to same tab within 60s renders from cache — `staleTime: 60_000`
- [ ] Measured p95 tab-switch perceived latency &lt; 500ms on production (or documented baseline + improvement) — verify after deploy
- [x] Prefetch or staleTime documented; no client double-filter regression (items 40–41)
- [x] Hover/focus prefetch warms Mine / Worth a look / All

**Fix (2026-07-09):** Optimistic `view` state + `startTransition(router.replace)`; list `staleTime` 60s + ok-only `placeholderData`; tab spinner while placeholder refetching; hover prefetch. Do not unmount queue shell when `query.data` is briefly undefined.

---

## 44 — Listing posted date (when seller listed on marketplace)

**Reported:** 2026-07-08 (production New mode, `/opportunities`) — **no code change yet**

**Symptom:**

- Queue shows **Received** (when TAV surfaced the lead) but not **when the seller originally posted** the Facebook listing
- Buyers reviewing fresh scraper leads cannot tell if a vehicle was listed 2 hours ago vs 3 days ago on the marketplace itself
- `lastSeenAt` is hidden by default and reflects last scrape, not seller post time

**Expected:** Buyers can see **Listed** (or **Posted**) — the marketplace listing creation/post time — on the queue row and/or opportunity detail, distinct from **Received**.

### Data model notes

| Field | Source today | Meaning | Exposed on queue? |
|-------|----------------|---------|-------------------|
| `receivedAt` | `leads.created_at` / manual submission / `first_seen_at` fallback | When TAV made this actionable | ✅ Yes (item 42) |
| `firstSeenAt` | `normalized_listings.first_seen_at` | First ingest into TAV | Hidden by default |
| `lastSeenAt` | `normalized_listings.last_seen_at` | Last scrape | Hidden by default |
| `posted_at` | `normalized_listings.posted_at` | **Seller listing post time** (from source) | ❌ **Not exposed** |

**Ingest gap (code review 2026-07-08):** Apify `custom-vehicle-scraper` already emits `postedAt` on dataset items (and `payloadAdapter.ts` preserves/maps it from `listing_date_ms`). `NormalizedListingInput` and `normalized_listings.posted_at` exist, but `parseFacebookItem` (`src/sources/facebook.ts`) does **not** copy `postedAt` / `posted_at` / `listedAt` into the normalized listing today — so `posted_at` is likely **NULL** for most Facebook rows even though the raw payload has the timestamp. **Verify in Supabase** before UI work: `SELECT posted_at, first_seen_at, title FROM tav.normalized_listings WHERE source = 'facebook' ORDER BY created_at DESC LIMIT 20`.

### Product decision (confirm at implementation)

| Option | Label | Sort | Notes |
|--------|-------|------|-------|
| A (recommended) | **Listed** | `posted_at DESC` | Marketplace post time — what buyers asked for |
| B | **Listed** + **Received** | Both columns | Clearer but wider table |
| C | Relative in Vehicle cell | — | e.g. "Listed 3h ago · Received 10m ago" |

Tooltip must explain: **Listed** = seller post time on Facebook; **Received** = when TAV created/surfaced the opportunity.

### Implementation sketch

1. **Ingest fix (if `posted_at` is null):** extend `parseFacebookItem` to extract `postedAt` / `posted_at` / `listedAt` from the mapped item into `NormalizedListingInput.postedAt`.
2. **Worker:** add `postedAt` to `OpportunityRow` / `OpportunityDetail` in `mapToOpportunityRow` from `normalized_listings.posted_at`.
3. **Web schema:** extend `OpportunityRow` in `web/lib/app-api/schemas.ts`.
4. **Table:** add **Listed** column in `table-preferences.ts` (visible by default or one click away in column picker).
5. **Sort:** add `posted_desc` / `listed_desc` to `OPPORTUNITY_SORTS` in Worker + sort dropdown.
6. **Detail:** show Listed timestamp in Vehicle block "Additional Information" or a metadata strip near Received.

### Primary files

- `src/sources/facebook.ts` (`parseFacebookItem` — extract posted time)
- `src/persistence/opportunities.ts` (`LISTING_COLUMNS`, `mapToOpportunityRow`, `sortOpportunityRows`)
- `src/app/routes.ts` (`OPPORTUNITY_SORTS`)
- `web/lib/app-api/schemas.ts`
- `web/lib/opportunities/table-preferences.ts`
- `web/app/(app)/opportunities/_components/opportunities-table-new.tsx`
- `web/app/(app)/opportunities/_components/opportunity-vehicle-block.tsx` (detail)

### Exit criteria

- [ ] `posted_at` populated on new Facebook ingests (verified in Supabase after ingest fix)
- [ ] **Listed** column visible on New-mode queue with correct timestamps for scraper leads
- [ ] Distinct from **Received** — tooltip documents both
- [ ] Sort by newest listed first available
- [ ] Manual submissions without source post time show honest empty/estimate badge (no fake timestamp)

---

## 45 — Dismiss opportunity with reason (queue right-side action)

**Reported:** 2026-07-08 (production New mode, `/opportunities`) — **no code change yet**

**Symptom:**

- No quick way to **pass/dismiss** a row from the queue without opening detail
- Right-side row actions today are only **View listing** (external link) and **Claim** (`opportunity-row-actions-new.tsx`)
- Workflow supports `passed` via `POST /app/opportunities/:id/status` on the **detail** page, but there is no reason capture and no one-click dismiss from the table

**Expected:** A **Dismiss** control on the right side of each queue row. Clicking opens a lightweight prompt (modal or popover) requiring the user to pick **why** before the row leaves the active queue.

### Product decisions (confirm at implementation)

**Dismiss behavior:**

- Row moves to a terminal/suppressed workflow state (likely `passed` or new `dismissed` — see below)
- Default queue views (`needs_action`, `mine`, `worth_a_look`, `all`) **exclude** dismissed rows
- Action is **audited** in `tav.opportunity_actions` with actor, timestamp, and selected reason

**Reason vocabulary (starter set — confirm with buyers):**

| Reason code | Label | Example use |
|-------------|-------|-------------|
| `wrong_vehicle` | Wrong vehicle type | Motorcycle, commercial, parts car |
| `bad_price` | Price out of range | Above ceiling / unrealistic |
| `bad_condition` | Condition concerns | Salvage, obvious issues in photos |
| `too_far` | Too far / wrong market | Outside buy radius |
| `duplicate` | Duplicate | Already working same VIN/listing |
| `not_interested` | Not interested | Generic pass |
| `other` | Other | Requires free-text note (min length?) |

**Status mapping options:**

| Option | Pros | Cons |
|--------|------|------|
| A (recommended) | Reuse `passed` + store `dismiss_reason` in action `metadata` | "Passed" may conflate buyer-contacted-pass vs queue-dismiss |
| B | Add `dismissed` to `MUTATABLE_WORKFLOW_STATUSES` + DB enum | Migration + filter updates |
| C | `archived` with reason metadata | Semantically muddy |

Recommend **A** for v1 unless buyers need a separate "contacted then passed" vs "never looked" distinction in reporting.

### Implementation sketch

1. **UI — queue row:** add Dismiss button to `OpportunityRowActionsNew` (icon + label; stop row click propagation).
2. **UI — reason picker:** `DismissOpportunityDialog` — radio list of reasons; optional note for `other`; Confirm disabled until reason selected.
3. **API:** either extend `POST /app/opportunities/:id/status` body with optional `reason` + `notes`, or add `POST /app/opportunities/:id/dismiss` that sets status + writes action atomically.
4. **Worker:** `opportunityWorkflow.ts` — validate reason code; write `OpportunityActionRecord` with `action: "status_changed"`, `metadata: { reason, previousStatus }`; enforce `canMutateWorkflow` (claim owner, assignee, or admin).
5. **List filters:** ensure `matchesNeedsAction` / default views exclude terminal statuses (`passed` already in `TERMINAL_WORKFLOW_STATUSES`).
6. **Optimistic UI:** remove row from table on success; invalidate tab counts.
7. **Admin/reporting (later):** filter by dismiss reason in a suppressed/closed view.

### Primary files

- `web/app/(app)/opportunities/_components/opportunity-row-actions-new.tsx`
- `web/app/(app)/opportunities/_components/opportunities-table-new.tsx`
- `web/app/(app)/opportunities/_components/opportunities-client-new.tsx` (mutation + cache invalidation)
- `web/lib/app-api/client.ts` (`updateOpportunityStatus` or new dismiss endpoint)
- `src/app/routes.ts` (`POST /app/opportunities/:id/status` or `/dismiss`)
- `src/persistence/opportunityWorkflow.ts`
- `docs/02-product/v2-opportunities.md` (closed/suppressed states §6)

### Exit criteria

- [x] Dismiss button visible on queue rows for users with mutate permission
- [x] Cannot dismiss without selecting a reason
- [x] Dismissed row disappears from **Needs action** / **All** default views immediately
- [x] `tav.opportunity_actions` row records reason + actor + timestamp
- [x] Detail page action history shows dismiss event
- [x] Tests: API validation (missing reason → 400), filter exclusion, permission gates

---

## 46 — Cox Y/M/M autofill for MMR evaluation

**Reported:** 2026-07-08 (production opportunity detail + MMR Lab) — **no code change yet**

**Symptom:**

- Listing-parsed year/make/model from Facebook titles (e.g. `2018 Kia Sportage FE` → make `kia`, model `sportage fe`) does not always match **Cox/Manheim catalog tokens** required for `POST /app/mmr/ymm`
- Buyers must manually hunt Y/M/M/S dropdowns on the Vehicle block or MMR Lab even when the listing already has usable identity
- MMR lookup fails or returns wrong trim when free-text model strings are not Cox-canonical (known pain: verbose trim in title, non-catalog makes)

**Expected:** On opportunity detail (and optionally MMR Lab prefill), **autofill** year/make/model/style inputs with the closest **Cox-ingestible** values so one click (or auto on load) can run MMR and return wholesale adjustments.

### What exists today (code review 2026-07-08)

| Piece | Status | File |
|-------|--------|------|
| Cox catalog dropdowns (Y/M/M/S) | ✅ Shipped on Vehicle block | `opportunity-vehicle-block.tsx`, `use-vehicle-catalog.ts` |
| Catalog API | ✅ `GET /app/mmr/catalog/years\|makes\|models\|styles` | `src/app/routes.ts` |
| `matchCatalogOption()` | ✅ Case-insensitive catalog match helper | `use-vehicle-catalog.ts` |
| Listing → Vehicle block initial values | ⚠️ Raw `opportunity.year/make/model/style` — **no catalog resolution** | `opportunity-vehicle-block.tsx` |
| MMR recompute from detail | ✅ `buildMmrRecomputeRequest` / `opportunity-valuation-block.tsx` | Uses saved vehicle fields |
| Title → Cox mapping | ❌ Not automated end-to-end | Parser in `src/sources/facebook.ts` ≠ Cox vocab |

### Implementation sketch

**Phase A — Catalog match on load (smallest win):**

1. When Vehicle block mounts (and catalog connected), for each of make/model/style:
   - Fetch catalog options for current year/make/model cascade
   - Run `matchCatalogOption(catalogMakes, opportunity.make)` etc.
   - If match found, pre-select canonical catalog value; badge "Auto-matched from listing" when different from raw parser output
2. If no catalog match, leave fields empty and show inline hint ("Pick make from Cox catalog — listing said 'sportage fe'")

**Phase B — Trim/style inference:**

1. Use `opportunity.trim` / title remainder + `cleanTrim` logic (already in `payloadAdapter.ts` for Apify detail mode) to suggest style
2. Optional: call `GET /app/mmr/catalog/styles?year&make&model` and fuzzy-match title tokens against style list (same pattern as MMR Lab item #17 approximate style)

**Phase C — One-click "Apply listing → Cox" + MMR:**

1. Button: **Use listing identity** — runs catalog match cascade, saves patch via existing `PATCH /app/opportunities/:id`, triggers MMR recompute
2. Wire into `opportunity-valuation-block.tsx` so MMR card can run immediately after autofill without separate save

**Phase D — MMR Lab prefill parity:**

1. Extend existing URL prefill (item 35) so `?year=&make=&model=` params use catalog-resolved tokens, not raw parser strings
2. Queue row action: "Open in MMR Lab" passes resolved Cox values when available

### Constraints (do not violate)

- Never round MMR adjustment dollars (see critical banner at top of this doc)
- Autofill is **best-effort** — badge when style/mileage/grade are inferred (`estimateFlags` pattern already exists)
- Failed catalog match must not block manual override
- Autofill must not silently save wrong Cox identity — show diff when canonical ≠ parsed (e.g. `sportage fe` → `Sportage`)

### Primary files

- `web/app/(app)/opportunities/_components/use-vehicle-catalog.ts` (`matchCatalogOption`, new `resolveListingToCatalog()`)
- `web/app/(app)/opportunities/_components/opportunity-vehicle-block.tsx`
- `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx`
- `web/app/(app)/mmr-lab/_components/build-mmr-recompute-request.ts`
- `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` (prefill)
- `src/apify/payloadAdapter.ts` (`cleanTrim` — consider shared export for title trim cleanup)
- `docs/07-buybox/MMR-LAB-ARCHITECTURE.md`

### Exit criteria

- [ ] Opening a lead with `2018 Kia Sportage FE` pre-fills Cox make/model dropdowns to catalog values without manual search
- [ ] MMR YMM lookup succeeds (or fails with clear "no catalog match") from autofill — not silent wrong trim
- [ ] User sees when autofill changed parser output vs Cox canonical (badge or inline diff)
- [ ] Manual override still works; autofill never locks fields
- [ ] Tests: `matchCatalogOption` edge cases + Vehicle block mount with mocked catalog responses

---

## Buyer feedback — 2026-07-09

Email from buyer (paraphrased). Map to items **47–53**. Overlaps with **43**, **45**, **46** called out per item.

| Email # | Ask | Item | Overlaps |
|---------|-----|------|----------|
| 1 | Flag deal: not a good lead, Title Issues, Dealer, etc. — filter out for everyone | **47** | **45** (dismiss w/ reason) |
| 2 | Enter VIN → year/make/model/(series) populate | **48** | **46** (listing→Cox catalog) |
| 3 | VIN cleared on save | **49** | — |
| 4 | Refresh valuation clears everything / returns nothing | **50** | item 38 refresh path |
| 5 | Expand workflow (Bad Lead, Purchased min; fuller list TBD) | **51** | **45/47** status mapping |
| 6 | Slow + double-click to execute (tabs + whole app) | **52** | **43** (tab latency) |
| 7 | Salesperson / Appraiser dropdown + admin CRUD | **53** | — |

---

## 47 — Flag bad lead / not a good lead (shared filter)

**Reported:** 2026-07-09 (buyer email #1)

**Symptom:**

- No way to mark a deal as a bad lead (not a good lead, Title Issues, Dealer, etc.) so **other buyers stop seeing it**
- Today closers can only pass/dismiss from detail workflow (limited statuses); queue has no shared “filter out for everyone” action with a reason vocabulary buyers asked for

**Expected:** One-click (or short dialog) to flag a lead with a required reason. Flagged leads leave default queue views for **all** users and remain auditable.

### Relationship to item 45

Item **45** already scopes “Dismiss with reason” on the queue row. **47** is the product vocabulary + shared-filter confirmation from buyers:

| Reason (buyer language) | Suggested code | Notes |
|-------------------------|----------------|-------|
| Not a good lead | `not_a_good_lead` | Generic pass |
| Title Issues | `title_issues` | Title/lien/brand problems |
| Dealer | `dealer` | Dealer listing / wholesale flip |
| _(from 45 starter set)_ | `wrong_vehicle`, `bad_price`, `bad_condition`, `too_far`, `duplicate`, `other` | Keep unless buyers reject |

Implement **45 + 47 together** as one dismiss/flag feature: same UI, expanded reason list, same “exclude from active views for everyone” behavior.

### Product decisions (confirm)

- Status: reuse `passed` + reason in `opportunity_actions.metadata` (item 45 option A), **or** add `bad_lead` as first-class status (aligns with item **51**)
- Queue views: `needs_action` / `mine` / `worth_a_look` / `all` exclude flagged rows; optional later “Suppressed / Bad leads” admin view
- Who can flag: claim owner, assignee, or admin (same as `canMutateWorkflow`)

### Primary files

- Same as item **45** (`opportunity-row-actions-new.tsx`, dismiss dialog, `opportunityWorkflow.ts`, list filters)
- `docs/02-product/v2-opportunities.md` — closed/suppressed states

### Exit criteria

- [x] Buyer can flag with at least: Not a good lead, Title Issues, Dealer (+ other agreed reasons)
- [x] Flagged row disappears from default queue views for **all** users (not just actor)
- [x] Action audited with reason + actor + timestamp
- [x] Cannot submit without a reason
- [x] Tests: filter exclusion + permission + missing reason → 400

---

## 48 — VIN entry populates Y/M/M/S + fresh MMR / Max buy

**Reported:** 2026-07-09 (buyer email #2) · **Reconfirmed:** 2026-07-09 screenshot — VIN `7MUCAAAG7NV022177` entered; Year `2021` from listing; Make/Model/Series still “Select…”; no auto valuation refresh.

**Shipped:** 2026-07-10 — VIN blur/save decodes via `POST /app/mmr/vin` → `hydrateVinAutofill` catalog Y/M/M/S → PATCH → Valuation block remounts on identity change for fresh MMR + Max buy.

**Should it autofill + value today?** **Yes** (after this ship). VIN save persists the VIN string (#49) and now also fills catalog identity + remounts valuation.

**Symptom (before fix):**

- Closer enters VIN, expects **year, make, model, and sometimes series** to fill and **MMR + Max buy** to update
- Vehicle block saved VIN as text only; Y/M/M/S stayed empty or listing-only until manual catalog picks
- Cox VIN MMR (`POST /app/mmr/vin`) already returned identity on the valuation path, but did **not** write back into Vehicle dropdowns or auto-trigger after VIN save

**Expected:**

1. Valid VIN on blur/save (or Decode) → Cox decode → Y/M/M/(S) filled with **catalog** values (“From VIN” badge when changed).
2. Same action → **fresh** MMR + Max buy on the Valuation block (not only after tribal “Refresh valuation”).
3. Y/M/M/S-only path still works without a VIN (product principle).

### Relationship to item 46

| Path | Source of identity | Item |
|------|--------------------|------|
| Listing title / parser → catalog match | Facebook/scraper YMM | **46** |
| VIN → Cox decode → catalog match + live valuation | User-entered VIN | **48** |

Ship **48** as VIN-driven; reuse `matchCatalogOption` / `resolveParsedVehicleFields` from **46** so both land on the same Cox tokens. Wire valuation remount/refresh after identity PATCH so Max buy/MMR stay current.

### Implementation (shipped)

1. On VIN blur/save (11–17 char valid): `decodeVinToVehicleSelection` → `POST /app/mmr/vin` + `hydrateVinAutofill`.
2. Set Vehicle block fields; “From VIN” status when filled; persist via existing Save → PATCH.
3. Detail client remounts Valuation block when vin/year/make/model/style/mileage change.
4. Failed decode: keep VIN + existing YMM, show inline error; still PATCH VIN if dirty (#49 / #50).

### Primary files

- `web/app/(app)/opportunities/_components/decode-vin-to-vehicle.ts`
- `web/app/(app)/opportunities/_components/opportunity-vehicle-block.tsx`
- `web/app/(app)/opportunities/_components/use-vehicle-catalog.ts`
- `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx` (valuation identity key)
- `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx` (auto-run after remount)
- `web/app/(app)/mmr-lab/_components/hydrate-vin-autofill.ts`
- `web/lib/app-api/client.ts` (`postMmrVin`)
- `src/app/routes.ts` (`POST /app/mmr/vin`)

### Exit criteria

- [x] Known-good VIN fills Year/Make/Model; Series when Cox provides trim/style
- [x] Values match Cox catalog options (dropdowns selected, not orphan free text)
- [x] After VIN save/decode, MMR + Max buy refresh to current results without requiring a separate manual hunt
- [x] Y/M/M/S-only edits still produce fresh valuation when identity is sufficient _(valuation remount key includes YMM)_
- [x] Failed decode does not wipe VIN, existing YMM, or last good valuation
- [x] Tests: mock VIN → fields + valuation triggered; invalid VIN → no silent clear

---

## 49 — VIN cleared on save (bug)

**Reported:** 2026-07-09 (buyer email #3) — **fixed 2026-07-09** (`fe50370`)

**Symptom (before fix):**

- User enters VIN on opportunity detail Vehicle block
- On **Save** (Vehicle block still has explicit Save — commit `4828361`), the VIN field **clears**

**Expected:** VIN remains visible and persisted after save; reload shows same VIN.

### Likely investigation areas (code review 2026-07-09)

| Layer | Check |
|-------|--------|
| PATCH body | `opportunity-vehicle-block.tsx` — `patch.vin = values.vin.trim() \|\| null` |
| Worker PATCH | `src/app/routes.ts` / opportunity patch handler — does VIN write to `normalized_listings`? |
| Response mapping | Detail remount / `patchRevision` — does GET omit `vin` or map null? |
| Catalog cascade | Y/M/M/S Save path (`4828361`) — does cascade reset wipe `values.vin`? |
| Controlled input | Local state reset from `opportunity.vin` after parent refresh with stale/null VIN |

### Fix direction

1. Reproduce with network tab: confirm PATCH includes `vin`, response/detail refetch returns `vin`.
2. If API drops VIN → fix persistence mapping.
3. If API OK but UI clears → fix local state / `key={patchRevision}` remount using stale props; preserve VIN across catalog clears.

### Primary files

- `web/app/(app)/opportunities/_components/opportunity-vehicle-block.tsx`
- `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx`
- Worker opportunity PATCH + `mapToOpportunityDetail` / listing columns
- Tests: vehicle block save round-trip keeps VIN

### Exit criteria

- [x] Enter VIN → Save → field still shows VIN
- [x] Hard refresh still shows VIN _(persisted via PATCH; client applies response before remount)_
- [x] Regression test: PATCH + remount does not clear VIN
- [x] No interaction with empty-string → null that re-seeds input as blank incorrectly

**Fix (2026-07-09):** `OpportunityDetailClientNew` keeps local `opportunity` state from PATCH responses and remounts form blocks from that copy — not stale SSR `initial`. Evaluate-on-open no longer overwrites local vehicle fields.

---

## 50 — Refresh valuation clears everything / returns nothing (bug)

**Reported:** 2026-07-09 (buyer email #4) — **fixed 2026-07-09** (`fe50370`)

**Symptom (before fix):**

- On opportunity detail Valuation block, **Refresh valuation** clears MMR / Max buy UI and ends with **empty / nothing** instead of refreshed numbers
- Related history: item **38** (Max buy refresh) and compact cards (item **33**); commit `ffbb88d` / `4e8281f` touched refresh + cache bypass

**Expected:** Refresh keeps prior summary visible (or loading overlay), then replaces with new MMR + Max buy results. On failure, show error and **retain last good result** (do not wipe to blank).

### Likely investigation areas

| Layer | Check |
|-------|--------|
| Loading state | `opportunity-valuation-block.tsx` — `setView({ kind: "loading" })` may unmount cards with no placeholder |
| Identity gate | Refresh runs but `identitySufficientForMmrAutoRun` fails after vehicle remount (VIN cleared — **49**) |
| `refresh_valuation` | VIN/YMM request flag + intel cache bypass; empty/error envelope handling |
| Max buy | Live evaluate fails → both cards blanked together |
| Session | `session === null` after refresh path resets MMR session |

### Fix direction

1. Reproduce with VIN present and with VIN missing (isolate **49** coupling).
2. Keep previous `view` / summary as `placeholderData` while refresh in flight; only replace on success.
3. On error: toast + restore last ok view; never leave permanent empty.
4. Ensure Refresh sends same identity (VIN or Y/M/M/S) that auto-run would use.

### Primary files

- `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx`
- `web/app/(app)/mmr-lab/_components/build-mmr-recompute-request.ts`
- `web/lib/app-api/client.ts` (MMR + maxbuy evaluate)
- `opportunity-valuation-block.test.tsx` (extend: refresh failure keeps prior; refresh success updates)

### Exit criteria

- [x] Refresh with valid identity returns MMR + Max buy (not blank)
- [x] During refresh, UI does not flash to empty with no recovery _(recomputing keeps prior cards)_
- [x] Failed refresh shows error and keeps last successful valuation
- [x] Still works when only VIN or only Y/M/M/S identity is present
- [x] Tests cover success + failure paths

**Fix (2026-07-09):** Refresh with a prior ok MMR result uses recomputing (not blank loading skeletons). On MMR/Max buy failure, restore prior view + toast instead of wiping.

---

## 51 — Expand workflow statuses (Bad Lead, Purchased, …)

**Reported:** 2026-07-09 (buyer email #5) — **full list TBD from buyer**

**Symptom:**

- Stepper today is roughly **Found → Working → Contacted → Appraised** (item **30**); mutatable statuses in Worker are limited (`contacted`, `purchased`/`bought`, `passed`, etc. — see `MUTATABLE_WORKFLOW_STATUSES`)
- Buyers want a richer pipeline. Off-the-cuff list:

```
Found → Working → Bad Lead → Contacted → Appraised →
Not Negotiable/Overpriced → Purchased → In Scheduling →
Delivered → @Auction → Sold
```

**Minimum for v1 (buyer):** **Bad Lead** + **Purchased** (Purchased may already exist as `purchased` / UI “Mark bought” — confirm label + visibility on queue/detail).

**Expected:** Workflow can represent at least Bad Lead and Purchased clearly; fuller enum after buyer provides final list.

### Product decisions (confirm before coding)

| Topic | Options |
|-------|---------|
| Bad Lead vs Passed | New status `bad_lead` **or** `passed` + reason (**45/47**). Prefer one model — don’t ship both without mapping. |
| Stepper vs status | Linear stepper may not fit branches (Bad Lead / Overpriced). Consider status dropdown + reason for terminal branches; keep stepper for happy path only. |
| Wait for final list? | Implement **Bad Lead + Purchased** now; add remaining statuses in a follow-up when buyer sends the real list. |

### Implementation sketch (minimum)

1. Confirm `purchased` is reachable from detail hero/workflow and labeled clearly (“Purchased” vs “Mark bought”).
2. Add `bad_lead` (or wire dismiss→`passed` with badge “Bad lead”) to Worker enum + DB check constraint / text column docs.
3. Exclude `bad_lead` / terminal from default queue views (same as **47**).
4. Update stepper/copy only for statuses we ship; don’t pretend full list exists in UI until confirmed.

### Primary files

- `src/persistence/opportunityWorkflow.ts` (`MutatableWorkflowStatus`, terminal set)
- `web/app/(app)/opportunities/_components/opportunity-workflow-stepper.tsx`
- `web/app/(app)/opportunities/_components/opportunity-workflow-block.tsx` / hero CTAs
- Supabase migration if DB constraint lists statuses
- `docs/02-product/v2-opportunities.md`

### Exit criteria

- [x] **Bad Lead** settable + excluded from default queues
- [x] **Purchased** clearly available and labeled
- [ ] Buyer’s fuller list documented as follow-up (do not invent statuses beyond minimum without confirmation)
- [x] Tests for new status transitions + terminal filter

---

## 52 — Double-click / whole-app action lag

**Reported:** 2026-07-09 (buyer email #6) — **queue tabs fixed 2026-07-09** (`e55015b`; same change set as **43**)

**Symptom (before fix):**

- Queue tabs (Needs action → Mine → Worth a look → All) feel **very slow**
- Actions often seem to need **two clicks** before they “execute”
- Buyer reports this pattern on the **entire app**, not only Opportunities

**Expected:** First click registers immediately (active tab / pressed state); data can load async. No double-click required.

### Relationship to item 43

Item **43** covers Opportunities tab switch latency (React Query `staleTime` / `placeholderData` / prefetch). **52** widens scope:

| Layer | Hypothesis |
|-------|------------|
| Perceived lag | Same as **43** — blank table while waiting → user clicks again |
| Double-click | `router.replace` + slow re-render; click target unmounts; first click “eaten” |
| App-wide | Shared shell / Next navigation / Auth session refetch / lack of optimistic UI on buttons |
| Overlay | Full-page loading states blocking pointer events |

### Fix direction

1. Ship **43** quick wins first (keepPreviousData, staleTime, tab loading indicator, prefetch).
2. Audit click handlers: ensure `onClick` sets local selected state **before** await/navigation.
3. Check app shell links (Next `<Link>` vs buttons) for full remounts.
4. If still app-wide: profile with Chrome Performance on tab switch + one detail action; document baseline.

### Primary files

- Item **43** files (`opportunities-client-new.tsx`, queue tabs, query keys)
- `web/components/app-shell/*` (nav click behavior)
- Any shared Button that waits on network before visual feedback

### Exit criteria

- [x] Single click switches tab selection immediately (optimistic `view` + item **43**)
- [x] No systematic double-click required on queue tabs (shell stays mounted via placeholderData)
- [x] Queue lag addressed on Opportunities; app-wide shell follow-up only if buyers still report after deploy
- [ ] Optional: global “pending” style on async buttons (disabled + spinner after first click)

**Fix (2026-07-09):** Same change set as **43** — root cause was unmounting the whole client (including tabs) when `query.data` went `undefined` on view change.

---

## 53 — Salesperson / Appraiser dropdown + admin CRUD

**Reported:** 2026-07-09 (buyer email #7)

**Symptom:**

- Salesperson and Appraiser on opportunity detail are **free-text** inputs (`opportunity-salesperson-appraisal-block.tsx`)
- Buyers will enter inconsistent names (“mess”) if left as text
- Need an **admin tool** to add/remove people from the lists

**Expected:** Both fields are dropdowns (or searchable combobox) fed from a managed directory. Admins can add/remove entries. Closers pick from the list only (or “Other” if product allows — default **list-only**).

### Implementation sketch

1. **Schema:** `tav.staff_directory` (or `salesperson_roster` / shared `directory_people` with `role` in `salesperson` \| `appraiser` \| both).
2. **API:** `GET /app/directory?type=salesperson|appraiser`; admin `POST/DELETE` under `/app/admin/...` or existing admin routes.
3. **UI — detail:** Replace text inputs with Select/Combobox bound to directory.
4. **UI — admin:** Simple list on `/admin` (or ops page) — add name, remove, maybe deactivate instead of hard delete for historical rows.
5. **Migration:** Existing free-text values — show as legacy option or require re-pick on next edit.

### Primary files

- `web/app/(app)/opportunities/_components/opportunity-salesperson-appraisal-block.tsx`
- `web/app/(app)/admin/` (new section or page)
- `src/app/routes.ts` + admin routes
- New Supabase migration for directory table
- PATCH opportunity still stores selected **name string** (or FK — prefer stable id + display name)

### Exit criteria

- [x] Salesperson and Appraiser are dropdowns populated from directory
- [x] Admin can add and remove (or deactivate) entries
- [x] Closer cannot free-type arbitrary strings (unless explicit Other is approved)
- [x] Historical opportunities with old free-text still display sensibly
- [x] Tests: API CRUD + block renders options

---

### Known issues (deferred)

- Apify `payloadAdapter` price/location fix — **deployed 2026-07-08** (`51db82eb`); monitor `tav.source_runs` for `processed > 0`
- Local uncommitted Apify `payloadAdapter` / `regionMap` WIP + `docs/04-operations/apify.md` — not part of Opportunities sprint; commit separately when ready
- UX backlog §4–7 — resume after **45/47** (or in parallel once flag/dismiss is clear)
- `handoff.md` production deploy dates stale — refresh after queue + detail fixes land in prod smoke
- Item **43** optional: measure p95 tab-switch latency in production after `e55015b`; Worker SQL push only if still slow
- Item **52** optional: global pending style on async buttons; app-wide shell lag only if buyers still report after queue fix

### Recently resolved (reference)

**Item 53 — Salesperson / Appraiser directory (2026-07-10)**  
`tav.staff_directory` seeded with buyer roster (`role = both` so the same names appear in Salesperson and Appraiser); detail dropdowns; Admin CRUD (deactivate/reactivate). Queue rows use real detail links for middle-click / open-in-new-tab.

**Item 45/47 — Flag/dismiss bad lead (2026-07-10)**  
Queue Flag action → reason dialog → `POST /app/opportunities/:id/dismiss` sets `bad_lead` with reason metadata; default views exclude suppressed statuses. Migration `0062_bad_lead_status`.

**Item 48 — VIN → Y/M/M/S + fresh MMR/Max buy (2026-07-10)**  
`decodeVinToVehicleSelection` on Vehicle blur/save; catalog fill via `hydrateVinAutofill`; Valuation remounts on identity key change.

**Items 43 + 52 — Queue tab latency / double-click (2026-07-09)** · `e55015b`  
Optimistic tab selection, 60s list `staleTime`, ok-only `placeholderData`, hover prefetch, tab spinner. Shell no longer unmounts on view change.

**Items 49 + 50 — VIN save wipe + Refresh valuation blank (2026-07-09)** · `fe50370` (+ `c374bf3`, `5ead1cd`)  
Detail client applies PATCH to local state; refresh keeps prior MMR/Max buy and restores on failure. Web-ci: during-render prop sync + `ApiResult` narrowing.

**Items 40–42 — Queue count parity + Received (2026-07-06)** · `6486776`  
Needs action / Mine badge vs table fixed; **Received** column + `received_desc` sort.

**Item 38 — Max buy refresh (2026-06-30)**  
Refresh valuation suppresses saved `maxbuySummary`, re-runs live Max buy, shows "Live evaluation".

**Item 39 — MMR confidence badge (2026-06-30)**  
Removed from detail Valuation card; remains in MMR Lab ResultBand.

---

## Previously active (complete — opportunity detail + MMR Lab)

| # | Item | Priority | Status |
|---|------|----------|--------|
| **34** | Opportunity detail E2E — blur-save + compact valuation assertions | Medium | [x] |
| **35** | MMR Lab URL prefill from opportunity detail (`?vin=` / YMM params) | Medium | [x] |

---

## Previously active (complete — MMR Lab polish)

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
| **31** | Opportunity detail — Vehicle block: vAuto-style dropdown fields | High | [x] |
| **32** | Opportunity detail — auto-save on blur (no per-block Save buttons) | High | [x] |
| **33** | Opportunity detail — compact Valuation cards (MMR + Max buy summary, not full ResultBand) | High | [x] |

---

## Opportunity detail page — layout & valuation tweaks

**Route:** `/opportunities/[id]` · **Spec:** [`02-product/opportunity-detail-redesign.md`](02-product/opportunity-detail-redesign.md)  
**Status:** Items 24–33 shipped on `main` (compact Valuation cards, blur-save, MMR Lab prefill). See exit criteria in **§33** below.

First shipped layout (Phases 1–5) is being refined. Hero workflow CTAs stay in the hero; only collapsible block order and block contents change below.

**Save UX (product direction — see item 32):** Do **not** keep explicit **Save / Reset** on every editable block long term. When a closer edits fields and **focuses out of the block** (clicks or tabs elsewhere on the page), that block should **auto-save** if dirty. Replaces the block-level Save pattern from the original redesign doc.

### Target block order (top → bottom)

| # | Block | Change |
|---|--------|--------|
| 1 | Hero | unchanged |
| 2 | **Salesperson / Appraisal Information** | **move up** — replaces Workflow’s current slot (position 2) |
| 3 | Vehicle | add subblock (see **26**) |
| 4 | ~~Listing~~ | **remove** (see **25**) |
| 5 | Valuation | **compact MMR + Max buy summary cards** (see **33**); adjustments on expand; full workbench stays on `/mmr-lab` |
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

- [x] Block order matches table above
- [x] Hero primary/secondary workflow actions unchanged
- [x] Workflow stepper + assignment/claim UI still works after move
- [x] No duplicate workflow UI introduced

---

## 25 — Remove Listing block

**Goal:** Drop the Listing collapsible block entirely — provenance/intake fields duplicated elsewhere (hero one-liner, provenance line, Vehicle region) and the block adds clutter without buyer value.

**Changes:**

- Remove `<CollapsibleBlock title="Listing">` and `OpportunityListingBlock` from the detail page.
- Optionally delete or retain `opportunity-listing-block.tsx` for reuse elsewhere (implementer’s call); page must not render it.

**Exit criteria:**

- [x] Listing block not visible on `/opportunities/[id]`
- [x] Hero still shows listing URL, source, provenance as today
- [x] Update E2E/UAT if they assert Listing block presence

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
- [x] Linked textbox sits on the same row as its checkbox (placement only — fields always editable)
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

- [x] Stepper shows Found → Working → Contacted → **Appraised**
- [x] Active step still resolves correctly for `purchased` / `bought` opportunities
- [x] Passed still maps to Contacted (not Appraised), same as today
- [x] Tests/E2E updated if they assert “Landed”

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

- [x] 8 fields render as `<select>` (or shared Select component), not text inputs
- [x] VIN + Odometer remain text inputs
- [x] Y/M/M/S cascade works with MMR catalog
- [x] Body Type / Engine / Transmission / Color dropdowns populated (source documented in PR)
- [x] Save/Reset/PATCH unchanged semantically
- [x] Tests updated for dropdown interaction + catalog mocks

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

- [x] No Save button on Contact, Vehicle, Salesperson/Appraisal, Title blocks (unless product keeps Reset)  
- [x] Editing then clicking outside the block persists via PATCH without manual Save  
- [x] Focus moving between fields **inside** the same block does not trigger save  
- [x] Valuation refresh still runs after vehicle identity saves  
- [x] E2E updated: blur-to-save instead of Save button click  

---

## 33 — Compact Valuation cards (MMR + Max buy summary)

**Goal:** Replace the embedded full MMR Lab `ResultBand` + live `MaxbuyEvaluationSection` stack on `/opportunities/[id]` with **two compact summary cards** — same visual density as the existing **Max buy (saved)** card. Closers get “what’s it worth?” and “what’s our max?” in two glances; heavy UI stays on `/mmr-lab`.

**Product direction (2026-06-27):** Item **27** shipped Cox lookup + adjustments on the detail page, but dropping the full 3-column `/mmr-lab` layout into a collapsible block reads as three stacked products (saved Max buy + full ResultBand + full Max buy evaluation). vAuto/Manheim MMR inspiration: **summary first, adjustments on demand** (“Close Details”), inline delta badges next to adjustment fields.

### Problem with current embedded UI

- **Saved Max buy card** — compact; works well.
- **Full `ResultBand`** — 3-column grid (Base MMR | adjustments form | blue summary panel); built for `/mmr-lab`, too tall for an appraisal block.
- **Full `MaxbuyEvaluationSection`** — duplicates Max buy when a saved verdict exists; economics/history/math always visible.

### Target UX (default / collapsed)

**MMR summary card** (mirror `SavedVerdictCard` pattern):

| Row | Content |
|-----|---------|
| Header | `MMR` + confidence badge (optional) |
| Hero | **Adjusted MMR** + wholesale range (e.g. `$23,000` · `$21,900 – $24,100`) |
| Secondary | Base MMR · Est. retail · Avg odometer · Avg condition (single line or small grid) |
| Action | **Adjust** or **Expand** — not six adjustment fields visible by default |

**Max buy summary card** (keep/enhance existing `SavedVerdictCard`):

- One card only — live evaluate **updates this card**; do not render a second full `MaxbuyEvaluationSection` below when summary suffices.
- **A–F deal grade** circle (Provisioning-style) derived from verdict + data strength.
- Recommended max buy hero, evaluated-at.
- Economics, segment history, explanation math, and action buttons → **expand / details** only.

**Block-level action:** Single **Refresh valuation** refreshes MMR + Max buy together (avoid duplicate refresh buttons). _Known gap: Max buy card may not update reliably — see item 38._

**Power users:** Full workbench on `/mmr-lab` (URL prefill from opportunity query params when linked externally).

### Progressive disclosure (expanded)

- **MMR adjustments** — vAuto-style inline panel: odometer / region / grade / color / build with delta chips (`+$710`, `−$480`); reuse Cox call path from `result-band.tsx` / `mmr-adjustments.ts` — **do not fork** lookup logic.
- **Max buy details** — `<details>` or second expand: economics grid, TAV segment history, explanation, Pass/Bid lower actions.

### What stays on `/mmr-lab` only

- Full 3-column `ResultBand` layout (unchanged on canonical page).
- Transactions table, historical/projected panels, sticky search panel.

### Bug fix bundled with this item

**MMR auto-run gate** in `opportunity-valuation-block.tsx` — `identitySufficientForAutoRun` currently requires **mileage + price** for YMM, which blocks MMR even though Cox and `/mmr-lab` do not require odometer for base/adjusted MMR at segment average.

Split gates:

| Surface | Sufficient identity |
|---------|---------------------|
| **MMR auto-run** | VIN **or** saved Y/M/M/S (series) |
| **Max buy auto-run** | Stricter — mileage + asking price (or existing MaxBuy rules); OK to skip live Max buy when only MMR identity is present |

Ref: `resolveLookupMileage` omits `?odometer=` when mileage undefined; MMR Lab `onYmmSubmit` sends Y/M/M/S only.

### Refines item 27

Item **27** exit criteria for “ResultBand visible on detail” remain met functionally; this item **replaces the embedded presentation** — summary cards + expand, not the full ResultBand grid. Update [`02-product/opportunity-detail-redesign.md`](02-product/opportunity-detail-redesign.md) §5 when this ships.

**Primary files:**

- `web/app/(app)/opportunities/_components/opportunity-valuation-block.tsx`
- New: `mmr-summary-card.tsx` (or inline in valuation block)
- Reuse: `SavedVerdictCard` pattern, adjustment sub-panel extracted from `result-band.tsx`
- **Do not remove** full `ResultBand` from `web/app/(app)/mmr-lab/`

**Exit criteria:**

- [x] Default Valuation view shows compact **MMR summary card** + compact **Max buy summary card** (no 3-column ResultBand)
- [x] MMR adjustments available via expand only; Cox recompute behavior unchanged
- [x] No duplicate Max buy UI (saved card + full evaluation section) in collapsed state
- [x] One **Refresh valuation** at block level (MMR + Max buy together)
- [x] MMR auto-runs on saved VIN or saved Y/M/M/S **without** requiring odometer
- [x] Max buy live auto-run still respects mileage/price rules (placeholder card when MMR-only identity)
- [x] `/mmr-lab` ResultBand unchanged
- [x] Tests + E2E updated for compact layout and split auto-run gates

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

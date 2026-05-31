# UI Improvements Backlog

**Status:** In progress — Phases 0–3 shipped on Opportunities (New mode); see [NEXT_STEPS.md](../NEXT_STEPS.md)  
**Last updated:** 2026-05-31  
**Owner:** UX / product  
**Related:** [V2 Opportunities](v2-opportunities.md) · [06-platform UX spec (pending)](../06-platform/README.md) · **[Implementation checklist → NEXT_STEPS.md](../NEXT_STEPS.md)**

---

## Problem

The web app works but reads like a **developer console**: dense tables, internal jargon, ops-focused navigation, and form-like workflow panels. Buyers and finders need an interface that answers **“what should I do next?”** without reading footnotes or knowing backend concepts.

This doc captures proposed UI changes before any build work. Use it to prioritize, estimate, and link to future FRs / UX spec in `docs/06-platform/`.

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[—]` deferred / rejected

---

## Design decisions

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| UX-D001 | **Keep spreadsheet-style rows** as the queue layout (both modes) | Expect **1,000+ leads**; card grids do not scale — too crowded, hard to scan, compare, and sort at volume | 2026-05-30 |
| UX-D002 | Improve readability **inside table rows**, not by switching layout | Color, compact visuals, column chooser, pagination, and filters — without sacrificing density | 2026-05-30 |
| UX-D003 | **Ship new UI alongside classic** — user can switch between them | Do not replace the current design in one cut; let the team opt in, compare, and fall back during rollout | 2026-05-30 |

---

## Classic vs new interface

**Yes — this is possible.** The current layout stays as **Classic**. Improved UX ships as **New**. A toggle lets each user pick which they use.

Both modes share the same API and data; only presentation and interaction change. Both keep spreadsheet rows (UX-D001).

### How it could work

| Piece | Approach |
|-------|----------|
| **Toggle location** | Top bar (near theme toggle) or user menu — e.g. “Interface: Classic / New” |
| **Default** | **Classic** until new UI is validated; then consider defaulting new users to **New** |
| **Persistence** | `localStorage` first (fast, no backend); optional later: column on `tav.users` so preference follows the account |
| **Scope** | Start with **Opportunities** only; expand to Home/nav/workflow once the pattern works |
| **Implementation** | Same pattern as `ThemeToggle` + `next-themes` — React context or URL segment that selects component tree (`OpportunitiesClientClassic` vs `OpportunitiesClientNew`) |
| **Maintenance** | Classic frozen except bugfixes; new work lands in **New** until a planned deprecation (if ever) |

### Tradeoffs to accept

- **Two code paths** to maintain for a while (classic components stay until cutover).
- **Testing** — smoke both modes on Opportunities changes that touch shared logic.
- **Not forever** — goal is to prove **New**, then retire Classic when the team agrees (optional; no forced deadline in v1).

| Item | Description | Status |
|------|-------------|--------|
| 8.1 | Define **Classic** = today’s Opportunities UI (current table, copy, workflow panel) — no regressions when toggle is Classic | [x] |
| 8.2 | Define **New** = backlog items in §1–4, §7 applied to Opportunities first | [~] Partial — §2–3 on Opportunities; §1 tabs + §4 workflow pending |
| 8.3 | **Interface toggle** in app shell (Classic / New) | [x] |
| 8.4 | Persist choice in `localStorage`; restore on load | [x] |
| 8.5 | Document toggle in UAT runbook so testers try both | [x] |
| 8.6 | (Optional) Sync preference to `tav.users` via API | [ ] |
| 8.7 | (Optional) Admin-only force-new flag for staged rollout | [ ] |

---

## At a glance — suggested Phase 1

Highest impact for least backend work. Good first slice if we pick one UX milestone.

| # | Change | Effort | API change? | Status |
|---|--------|--------|-------------|--------|
| 0 | **Classic / New toggle** + keep current UI as Classic (§8) | S–M | No (optional user pref later) | [x] |
| 1 | Tabbed/filtered Opportunities views — **New mode only** | M | Yes — filters + pagination on `GET /app/opportunities` | [x] |
| 2 | Plain-language labels + hide ops pages from buyer nav — **New mode only** | S | No | [~] Labels done (Opportunities); nav Phase 6 |
| 3 | **Better table rows** — **New mode only**; Classic unchanged | M | Yes — pagination; optional sort params | [x] |
| 4 | Simplified workflow panel — **New mode only** | M | No | [x] |

---

## 1. Lead with “what should I do?” not “here is the data”

**Today:** `/opportunities` opens with a dense table and a “Queue summary” card (`Total shown`, `Leads`, `Near misses`, `Manual`). That reads like a monitoring dashboard, not a buyer workspace.

**Goal:** Default view answers buyer questions first.

| Item | Description | Status |
|------|-------------|--------|
| 1.1 | **“Needs action” view** — unassigned, newly submitted, or expiring claims | [x] New mode |
| 1.2 | **“Mine” view** — assigned or claimed by the signed-in user | [x] New mode |
| 1.3 | **“Worth a look” view** — strong spread vs wholesale value, not stale | [x] New mode |
| 1.4 | Tabs or segmented controls at top of queue (instead of one flat list) | [x] New mode |
| 1.5 | Hide or collapse advanced columns by default; show on demand | [x] New mode column picker |
| 1.6 | Replace “Queue summary” stat line with human copy (e.g. “3 need you · 12 new today”) | [x] New mode |

---

## 2. Replace internal language with team language

**Today:** UI uses engineering terms: *Near miss*, *MMR*, *Spread*, *Ingest Monitor*, *VIN / MMR Lab*, region keys like `dallas_tx`, type values like `manual_submission`.

**Goal:** Same data, labels buyers already use. Technical terms in tooltips for power users.

| Today | Proposed label | Status |
|-------|----------------|--------|
| Near miss | “Almost a deal” / “Worth reviewing” | [x] New mode |
| MMR | “Wholesale value” (tooltip: MMR) | [x] New mode |
| Spread | “Room to make” / “Under or over market” | [x] New mode |
| Ingest Monitor | Hide from buyer nav; keep for admin/ops | [ ] Phase 6 |
| VIN / MMR Lab | “Value a vehicle” or admin-only | [ ] Phase 6 |
| Claim opportunity | “I’m working this” | [x] New mode |
| Manual submission | “Submitted by team” | [x] New mode |
| Region keys (`dallas_tx`) | “Dallas”, “Lubbock”, etc. | [x] New mode |
| Score | “Deal score” with short explanation on hover | [x] New mode |
| Status values (`reviewed`, `contacted`) | Sentence-case, buyer-friendly labels | [x] New mode |

| Item | Description | Status |
|------|-------------|--------|
| 2.1 | Glossary pass on all page titles, headers, and table columns | [x] Opportunities New mode |
| 2.2 | Tooltips on retained technical terms (MMR, near miss, etc.) | [x] New mode |
| 2.3 | Rewrite page intro copy (e.g. Opportunities header) for finders/closers, not engineers | [x] New mode |

---

## 3. Make the table scannable at 1,000+ rows

**Today:** Opportunities table exposes ~11 columns: Vehicle, Type, Badges, Price, MMR, Spread, Score, Assignee, Claimed by, Status, Region, Last seen. Feels like a raw export; list is capped at 50 with no pagination.

**Goal:** Stay **spreadsheet-first** — dense, sortable, filterable — but easier to read and act on at high volume. No card grid (see UX-D001).

| Item | Description | Status |
|------|-------------|--------|
| 3.1 | **Server-side pagination** (page size 25–50, total count, next/prev) | [x] New mode (+ classic-list fallback when Worker unpaginated) |
| 3.2 | **Server-side sort** — default e.g. spread desc or score desc; user-chosen column sort | [x] New mode sort dropdown |
| 3.3 | **Column visibility picker** — show/hide columns; save preference per user | [x] `localStorage` |
| 3.4 | **Sensible default columns** — hide low-priority fields (Region, Last seen) until expanded | [x] |
| 3.5 | **Deal signal in Spread column** — color + arrow (e.g. green “$2,400 under”) not plain number | [x] |
| 3.6 | **Compact Vehicle cell** — YMM on one line; badges as small chips inline, not a whole column | [x] |
| 3.7 | Merge **Type + Badges** into one “Signal” column where possible | [x] Inline under Vehicle |
| 3.8 | **Row hover + selected state** — clear highlight; single-click opens preview sheet | [x] |
| 3.9 | **Quick actions column** — icon buttons: View listing, Claim (when eligible) | [x] |
| 3.10 | **Sticky header** on scroll so column labels stay visible | [x] |
| 3.11 | Optional **density toggle** — comfortable vs compact row height (same layout) | [x] |
| 3.12 | **Virtual scroll** only if needed after pagination — avoid rendering 1,000 DOM rows at once | [ ] |
| 3.13 | **Listing photos** — small thumbnail in Vehicle column only if it doesn’t widen rows; otherwise skip | [—] |
| 3.14 | ~~Card layout / card-table toggle~~ | [—] Rejected — UX-D001 |

---

## 4. Make workflow feel like steps, not a form panel

**Today:** Workflow panel uses uppercase section headers, six metadata rows (Claim expires, Last evaluated by…), assignee `<select>`, row of status buttons, separate note textarea. Accurate but admin-form aesthetic.

**Goal:** Guided progression through the deal, with audit details available but not dominant.

| Item | Description | Status |
|------|-------------|--------|
| 4.1 | **Progress stepper:** Found → Assigned → Working → Contacted → Bought / Passed | [x] New mode |
| 4.2 | **One primary action per state** (e.g. unclaimed → “Start working this”) | [x] New mode |
| 4.3 | Collapse audit metadata into “Details” or “History” accordion | [x] New mode |
| 4.4 | **Inline note on status change** — “Mark contacted” prompts for callback notes | [ ] |
| 4.5 | Friendlier assignee picker (avatars / names, not `displayName (role)` in raw select) | [ ] |
| 4.6 | Show claim countdown prominently after claim (“Your 24h window · expires Tue 3pm”) | [x] New mode |
| 4.7 | Visual distinction when another user has claimed (collision) — banner + disabled actions | [x] New mode |
| 4.8 | Replace uppercase micro-headers (`ASSIGNMENT`, `WORKFLOW`) with sentence case | [x] New mode |

---

## 5. Split the app by role, not by backend module

**Today:** Nav treats every surface equally: Dashboard, Opportunities, Ingest Monitor, MMR Lab, Historical, Admin. Buyers and finders mostly need Opportunities + submit.

**Goal:** Default experience matches job; ops tools stay available but secondary.

| Item | Description | Status |
|------|-------------|--------|
| 5.1 | **Buyer nav:** Opportunities, Submit a listing, My work | [ ] |
| 5.2 | **Admin / ops nav:** Ingest, MMR Lab, Historical, Admin under “More tools” or separate section | [ ] |
| 5.3 | **Role-based landing** — closers → My queue; admins → lighter ops overview | [ ] |
| 5.4 | Hide Ingest Monitor from non-admin roles | [ ] |
| 5.5 | Hide or restrict Admin / Integrations by role | [ ] |
| 5.6 | Rename **Dashboard** → **Home** with action-oriented tiles (see §7) | [ ] |

---

## 6. Reduce “you need instructions to use this” moments

**Today:** Footer copy explains interaction: “Click a row for a quick preview. Double-click or use the preview link…” — signal that the model isn’t self-evident.

**Goal:** Obvious affordances; no manual required.

| Item | Description | Status |
|------|-------------|--------|
| 6.1 | Single click opens side panel with clear **Open full page** and **View listing** buttons | [~] New preview sheet |
| 6.2 | Remove reliance on double-click for primary flows | [~] New mode footer + quick actions |
| 6.3 | **Sticky action bar** on mobile when a row is selected | [ ] |
| 6.4 | **Empty states with examples** — “Submit your first listing” with sample, not bare “No opportunities yet” | [ ] |
| 6.5 | First-run hints or optional tour for submit → assign → claim (dismissible) | [ ] |
| 6.6 | External listing link opens in new tab with clear icon on every opportunity surface | [x] New table quick action |

---

## 7. Small polish that adds up

Lower effort, still noticeable across the shell.

| Item | Description | Status |
|------|-------------|--------|
| 7.1 | Soften or hide loud **PRODUCTION** env badge for normal `@texasautovalue.com` users | [ ] |
| 7.2 | Keep env badge for staging / local / admin | [ ] |
| 7.3 | Replace uppercase micro-headers site-wide (`QUEUE SUMMARY`, etc.) with sentence case | [~] New Opportunities queue/table headers |
| 7.4 | **Home** page: 3 tiles — “X deals need you”, “Submit a listing”, “Recent activity” | [ ] |
| 7.5 | Move charts / KPIs behind **Analytics** or secondary section on Home | [ ] |
| 7.6 | Success feedback beyond toasts (inline confirmation, claim timer) | [ ] |
| 7.7 | Sidebar: show nav labels below `xl` breakpoint (icon-only rail is cryptic) | [ ] |
| 7.8 | Consistent spacing and hierarchy on detail page vs preview sheet | [ ] |

---

## Cross-page notes

| Page | Current feel | Direction |
|------|--------------|-----------|
| `/opportunities` | Data table + ops summary | Primary buyer workspace — spreadsheet at scale (§1, §3, §4) |
| `/opportunities/[id]` | Detail + workflow form | Same workflow improvements as preview sheet |
| `/dashboard` | KPIs, charts, system status | Reposition as Home / Analytics for buyers; ops dashboard for admins |
| `/ingest` | Engineering monitor | Admin-only; rename if kept in nav |
| `/mmr-lab` | Internal valuation tool | Admin or power-user; simpler naming if exposed |
| `/historical` | Data exploration | Secondary; not day-one buyer path |
| `/admin` | Integrations console | Admin-only |

---

## Open questions (decide before build)

| ID | Question | Default |
|----|----------|---------|
| UX-001 | Card view vs table? | **Decided: table only** (UX-D001) |
| UX-002 | Filters and pagination — API or client-only? | **API required** at 1,000+ rows; client filter on 50 rows is not enough |
| UX-003 | Listing photos in table — thumbnail column or skip? | Skip unless tiny thumbnail fits without hurting scan speed |
| UX-004 | Role-based nav — hide items or show disabled with tooltip? | Hide for cleaner buyer UI |
| UX-005 | Rename wholesale value in UI only, or update API field labels too? | UI only; API stays `mmrValue` |
| UX-006 | When to default new users to **New** vs **Classic**? | Classic until UAT sign-off on New |
| UX-007 | Store interface preference in `localStorage` only, or `tav.users`? | `localStorage` v1; DB if preference must follow device |

---

## How to update

1. Check `[ ]` → `[~]` when design or implementation starts.
2. Check `[~]` → `[x]` only after verify in staging or production.
3. Large scope changes → add FR IDs in `docs/06-platform/02-functional-requirements.md` when that doc exists.
4. Link shipped PRs in the table below.

### Shipped log

| Date | Item | PR / notes |
|------|------|------------|
| 2026-05-31 | §8 Classic/New toggle | Phase 0 — `InterfaceProvider`, top-bar toggle |
| 2026-05-31 | §3 Table at scale | Phase 3 — New `OpportunitiesTableNew` |
| 2026-05-31 | §2 Plain language | Phase 2 — `opportunities-labels.ts` |
| 2026-05-31 | §1 API views | Phase 1 — Worker `view=` + pagination (UI tabs pending Phase 4) |
| 2026-05-31 | §1 queue tabs | Phase 4 — New mode tabs, summary line, per-tab empty states |
| 2026-05-31 | New mode deploy compat | Schema tolerance + classic-list fallback when Worker returns array shape |

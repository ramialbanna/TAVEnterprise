# Opportunities — Team UAT

**Status:** In progress  
**Last updated:** 2026-05-31  
**Environment:** Production — [https://tav-enterprise.vercel.app/opportunities](https://tav-enterprise.vercel.app/opportunities)  
**API reference:** [app-api.md § Opportunities](../03-api/app-api.md)

Buyer workflow shipped in Phases 5–7 (read queue, manual submit, assign, claim, status, notes, audit history). **UX Phases 0–7** add a **Classic / New** interface toggle (panels icon, next to theme). Default is **Classic** — production UI frozen except bugfixes. **New** mode ships buyer-first nav, queue tabs, guided workflow, Home tiles, and polish through Phase 7. Run this checklist in **both** modes before sign-off.

---

## Goal

Confirm the team can run day-one acquisition work in `/opportunities` without engineering in the loop:

1. See real leads and reviewable near-misses (east / `dallas_tx` data).
2. Submit a listing URL manually.
3. Assign a closer (admin).
4. Claim a 24-hour working window (closer).
5. Update status and add notes.
6. See actions in history; catch claim/evaluate collisions between two users.

**Pass:** All P0 scenarios checked with no P1 blockers.  
**Fail:** Any P0 scenario cannot be completed, or data is missing with no workaround.

---

## Preflight (engineering / Rami)

| Check | How | Target (2026-05-26) |
|-------|-----|------------------------|
| Web app loads | Open `/opportunities` while signed in | 200, queue renders |
| Worker API | `GET /app/opportunities` via app (queue summary counts) | `Total shown` > 0 |
| East inventory | Supabase `normalized_listings` where `region = dallas_tx` | ~2.6k listings |
| Leads in DB | `tav.leads` count | ~49 rows |
| Worker version | Production deploy includes near-miss filter | `tav-aip-production` ≥ 2026-05-26 |

**UAT testers (required):** At least **two** `@texasautovalue.com` Google accounts.

- First login **auto-creates** `tav.users` with role `closer`.
- **One account must be `admin`** for assign/reassign scenarios. After both users have signed in once, promote one user (replace email):

```sql
UPDATE tav.users
SET role = 'admin'
WHERE email = 'your-admin@texasautovalue.com';
```

- Optional third account as **viewer** (read-only): `UPDATE tav.users SET role = 'viewer' WHERE email = '...';`

**Do not** use `automation@texasautovalue.com` for human UAT unless intentional.

---

## Roles in tests

| Role | Can |
|------|-----|
| **admin** | Assign / unassign any opportunity; claim; status; notes |
| **closer** | Claim (if unassigned or assignee); status/notes when assignee or active claim owner |
| **viewer** | List + detail only; no mutations |

---

## Interface toggle (UX Phases 0–7)

| Step | Expected |
|------|----------|
| Open any app page while signed in | Top bar shows panels icon (left of theme toggle) |
| Click panels icon → **Classic** | Check mark on Classic; `/opportunities` uses classic table (50-row list, original footer copy) |
| Click panels icon → **New** | Check mark on New; queue tabs, “Your day at a glance”, plain-language headers |
| Reload browser | Last choice persists (`localStorage` key `tav.interface`) |

**Record:** Classic OK? _____ · New OK? _____

---

## New mode — navigation & Home (UX Phase 6)

| Step | User | Expected |
|------|------|----------|
| Switch to **New**, open `/dashboard` | A | **Home** with three tiles (deals need you, submit, my work) + Analytics link |
| Open **Analytics** | A | KPI charts load; Classic users redirected to `/dashboard` if they hit this URL in Classic |
| Sidebar (buyer) | A | Home, Opportunities, Submit listing, My work, Analytics — no Ingest/MMR/Admin |
| **More tools** (admin only) | Admin | Ingest, Value a vehicle, Historical, Admin grouped under collapsible section |
| Closer opens `/ingest` directly | B | Redirected to `/opportunities` (ops URLs blocked in New for non-admin) |

**Record:** Home tiles OK? _____ · Ops guard OK? _____

---

## New mode — queue & polish (UX Phases 3–5, 7)

| Step | User | Expected |
|------|------|----------|
| Open `/opportunities` | A | Tabs: Needs action · Mine · Worth a look · All; summary line under “Your day at a glance” |
| Single-click a row | A | Preview sheet with **View listing** + **Open full page** (no double-click required) |
| Empty **Mine** tab (if none assigned) | B | Friendly empty state + link to Needs action |
| Dismiss **Quick start** tour | A | Tour hides; reload keeps it dismissed |
| **Claim** from row hand icon | B | Toast + inline banner with countdown; preview workflow stepper updates |
| Listing link | A | External-link icon on vehicle column and in preview |

**Record:** New queue OK? _____ · Claim feedback OK? _____

---

## P0 scenarios

Use two browsers (or normal + incognito) for **User A (admin)** and **User B (closer)**.

### 1 — Queue loads

| Step | User | Expected |
|------|------|----------|
| Sign in | A | Lands on app shell |
| Open `/opportunities` | A | Table loads; summary shows leads / near misses / manual counts |
| Single-click a row | A | Preview sheet opens (vehicle, price, MMR, badges) |
| Open full detail | A | `/opportunities/:id` shows valuation, vehicle, workflow panel |

**Record:** Lead count in summary: _____

---

### 2 — Manual submit

| Step | User | Expected |
|------|------|----------|
| Click **Submit listing** | A | Dialog opens |
| Paste a real marketplace URL, region **Dallas TX** | A | |
| Submit (optional: assign User B as closer) | A | Success toast; row appears as **Manual submission** |
| Refresh list | A | New row visible; `submittedBy` shows finder name |

**Record:** Listing URL used (internal): _____ · Opportunity id: _____

---

### 3 — Admin assign

| Step | User | Expected |
|------|------|----------|
| Open detail for an **unassigned lead** | A (admin) |
| Assign closer = User B | A | Toast success; assignee name on detail |
| Action history | A | `Closer assigned` (or reassigned) event |

| Step | User | Expected |
|------|------|----------|
| Unassign (clear assignee) | A | Assignee cleared; history updated |

---

### 4 — Claim + 24h window

| Step | User | Expected |
|------|------|----------|
| Open unclaimed opportunity | B (closer) |
| **Claim** | B | Toast “claimed for 24 hours”; claim owner + expiry shown |
| Same opportunity | A (different user) | Warning that B claimed it (preview or detail) |
| B tries claim again | B | Still owner until expiry |

**Record:** Claim expiry time shown: _____

---

### 5 — Status update

| Step | User | Expected |
|------|------|----------|
| As claim owner or assignee, set status **Reviewed** → **Contacted** | B | Toast success; status on detail |
| History | B | `Status: … → …` entries |

| Step | User | Expected |
|------|------|----------|
| Set status **Passed** on a test row | B | Row still visible in list (closed filter later); history shows Passed |

---

### 6 — Notes

| Step | User | Expected |
|------|------|----------|
| Add note “Seller wants callback Tuesday” | B | Toast success; note in history |
| Reload detail | B | Note persists |

---

### 7 — Evaluate collision (optional P0)

| Step | User | Expected |
|------|------|----------|
| User B opens detail first (records evaluate) | B | |
| User A opens same detail | A | Message that B evaluated at timestamp |

---

## P1 scenarios (note failures, do not block sign-off)

- [ ] **Near miss** row visible with **Near miss** badge; asking price ≤ MMR (overpriced pass-grade hidden after 2026-05-26 filter).
- [ ] **Open listing** link opens external marketplace URL.
- [ ] **Viewer** cannot claim, assign, or change status (buttons disabled or API 403).
- [ ] Preview sheet workflow actions match detail page.
- [ ] Mobile/narrow layout usable (table scroll, dialog usable).

---

## Sign-off

| Tester | Role tested | Date | P0 pass? | Notes |
|--------|-------------|------|----------|-------|
| | admin | | ☐ | |
| | closer | | ☐ | |
| | closer #2 | | ☐ | |

**Issues log** (copy rows as needed):

| # | Severity | Scenario | What happened | Screenshot / id |
|---|----------|----------|---------------|-----------------|
| 1 | P0 / P1 | | | |

When P0 is green, update [NEXT_STEPS.md](../NEXT_STEPS.md): mark Team UAT `[x]` and log date in **Recent log**.

---

## After UAT

- File P0 bugs as issues or fix in-place before V2.5.
- Proceed to **Do now #2** — V2.5 doc gate ([06-platform](../06-platform/README.md)).
- Optional: deploy latest Vercel `main` if Opportunities page copy still shows old “next phase” text.

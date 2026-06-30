# Opportunity detail page redesign

**Status:** Shipped — items 24–35 on `main` (2026-06-29); compact valuation cards, blur-save, block reorder  
**Route:** `/opportunities/[id]`  
**Goal:** Dense, vAuto-inspired **block workspace** — grouped collapsible sections, two-column field grids, compact MMR + Max buy summary cards (full workbench on `/mmr-lab`).

**Reference:** vAuto Appraisal UI (layout inspiration only — not a feature-for-feature copy).  
**Companion:** [`NEXT_STEPS_LEAD_TO_DEAL.md`](../NEXT_STEPS_LEAD_TO_DEAL.md) · [`MMR-LAB-ARCHITECTURE.md`](../07-buybox/MMR-LAB-ARCHITECTURE.md) · [`v2-opportunities.md`](v2-opportunities.md)

---

## Summary

| Decision | Choice |
|----------|--------|
| Layout | Single main column; **two columns inside blocks** for field grids; **no sticky sidebar** |
| Blocks | **Collapsible**, **all open by default** |
| Queue entry | **Single click → full page**; **retire preview sheet** |
| Workflow stepper | **One strip:** Found → Working → Contacted → **Appraised** |
| Appraised | **Bought only** (formerly “Landed”) |
| Passed | **Secondary action button** (not a step); maps to Contacted in stepper |
| Primary actions | **Hero** (claim, listing, workflow CTAs) |
| Valuation | **Compact MMR + Max buy summary cards**; adjustments on expand; `/mmr-lab` for full workbench |
| Max buy card | **A–F deal grade** circle + recommended max buy; details on expand |
| Save UX | **Auto-save on blur** per block (no per-block Save buttons) |
| Listing block | **Removed** — provenance in hero + Vehicle additional info |
| Badges | **Hero only** |
| Evaluate on open | **Keep silent** audit (`POST …/evaluate`) — no UI |
| Next deal shortcut | **Later** (not v1) |
| Mobile | **Desktop-first** v1; blocks stack on small screens |

---

## What we are replacing

Current `/opportunities/[id]` (`OpportunityDetailClientNew`) stacks:

1. Hero card  
2. `MaxbuyLiveCard` (manual form; often disabled)  
3. 4-step workflow strip (`OpportunityWorkflowStepper`)  
4. Sparse 2-column cards (Valuation + Vehicle)  
5. 5-step workflow panel + notes + collapsed history (`OpportunityWorkflowPanelNew`)

**Problems this redesign addresses:**

- Too much vertical whitespace; cards feel empty when data is missing  
- **Duplicate workflow UI** (4-step strip + 5-step panel)  
- Max buy and MMR are disconnected from MMR Lab  
- Preview sheet duplicates partial detail; full page should be the workspace  
- Primary actions split between hero and workflow panel  

**Remove in v1:**

- `OpportunityPreviewSheetNew` from queue row click flow  
- Standalone `MaxbuyLiveCard` evaluate form as the default valuation UX  
- Duplicate workflow stepper (`OpportunityWorkflowStepper` 4-step strip)  
- Separate sparse Valuation / Vehicle cards (replaced by named blocks below)  

---

## Page structure (top → bottom)

```
┌─────────────────────────────────────────────────────────────┐
│  HERO — title, one-liner, badges, primary actions           │
├─────────────────────────────────────────────────────────────┤
│  ▼ Workflow — stepper, assignment/claim, status actions     │
├─────────────────────────────────────────────────────────────┤
│  ▼ Vehicle — editable identity fields (2-col grid)          │
├─────────────────────────────────────────────────────────────┤
│  ▼ Listing — intake/provenance (manual-entry parity)        │
├─────────────────────────────────────────────────────────────┤
│  ▼ Valuation — miniature MMR Lab + Max buy (combined)     │
├─────────────────────────────────────────────────────────────┤
│  ▼ Seller / listing notes — raw text                        │
├─────────────────────────────────────────────────────────────┤
│  ▼ Notes — add note + recent notes                          │
├─────────────────────────────────────────────────────────────┤
│  ▶ History — collapsed; full audit trail                    │
└─────────────────────────────────────────────────────────────┘
```

Each `▼` block uses a collapsible panel pattern (chevron header, vAuto-style). All blocks **open by default** on first load.

---

## Block specifications

### 1. Hero

**Purpose:** Orientation + **all primary actions** in one place.

**Content:**

- Back link → `/opportunities`  
- Title (e.g. `2022 Honda Civic`)  
- Vehicle one-liner: YMM · asking price · mileage · source  
- **Badges / signals only here** (Manual, First seen, Mileage unknown, etc.) — do not duplicate in other blocks  
- Provenance line optional in hero or Listing block (prefer Listing for long metadata; hero keeps one-liner only)

**Actions (confirmed set):**

| Action | When shown |
|--------|------------|
| Open listing | `listingUrl` present |
| I'm working this / Renew 24h window | Claim eligible (admin/closer) |
| Mark contacted | Working step + can mutate |
| Mark bought | Contacted step + can mutate |
| Mark passed | Secondary; Contacted step + can mutate |

Use existing `getPrimaryWorkflowAction` / `getSecondaryWorkflowActions` logic; render in hero instead of buried in workflow panel.

**Not in hero v1:** Next deal → (deferred).

---

### 2. Workflow

**Purpose:** Deal progress, assignment, claim state, collision warnings.

**Stepper (single strip):**

```
Found → Working → Contacted → Landed
```

| Step | Maps from current status / claim |
|------|----------------------------------|
| Found | No assignee, not claimed |
| Working | Assigned and/or active claim |
| Contacted | `contacted`, `negotiating`, `reviewed` |
| Landed | `purchased` / `bought` only |

**Passed:** Secondary button in hero/workflow — **not** a step. Stepper behavior after Pass — **TBD later** (no spec change until decided).

**Inside this block (not separate):**

- Status badge  
- Assignment: assigned closer name  
- Claim: working by, claimed at, claim expires, countdown for claim owner  
- Collision banner (another user working / reviewed)  
- Admin: assign closer dropdown + Save (existing behavior from `OpportunityWorkflowPanelNew`)  

**Remove:** Second 5-step strip (`WORKFLOW_STEPS` with Assigned as visible step). Assignment remains as **data** inside workflow block; Assigned is not a buyer-facing step label.

**Silent evaluate on open:** Keep `recordEvaluation` POST on mount — no UI feedback.

---

### 3. Vehicle

**Purpose:** vAuto-style vehicle identity — **all fields editable**.

**Fields (2-column grid inside block):**

| Field | Required | Notes |
|-------|----------|-------|
| VIN | — | Drives MMR VIN lookup when present |
| Odometer | — | mi; MMR adjustment |
| Year | * | |
| Make | * | |
| Model | * | |
| Series | — | Maps to trim/style where applicable |
| Body Type | — | |
| Engine | — | |
| Transmission | — | |
| Color | — | Sync with MMR color adjustment |

**Edit / save behavior (recommended — pending eng review):**

Use **block-level Save**, not auto-save on every blur:

1. **Why:** Avoids accidental Cox/MMR API calls; clearer for closers; matches vAuto “save appraisal” mental model.  
2. **On Save — valuation-affecting fields** (VIN, odometer, year, make, model, series, region if moved here, color):  
   - Persist to opportunity/listing record (new API — see [Data & API gaps](#data--api-gaps))  
   - Refresh miniature MMR Lab state  
   - Re-run Max buy if verdict missing or inputs changed  
3. **On Save — non-valuation fields** (body type, engine, transmission): persist only; no MMR recompute until wired.  
4. **Audit:** Log vehicle field changes in action history.  
5. **Unsaved changes:** Warn on navigate away if block is dirty.

**Alternative rejected for v1:** Auto-save on blur — too easy to trigger expensive lookups accidentally.

---

### 4. Listing

**Purpose:** Intake and provenance — **parity with manual submit fields** where data exists.

**Fields (read-only default for scraper rows; editable where product allows later):**

| Field | Source |
|-------|--------|
| Listing URL | `listingUrl` — link + copy |
| Source | facebook, craigslist, autotrader, cars_com, offerup |
| Region | Internal key → human label (`dallas_tx` → Dallas) |
| Asking price | `price` |
| Submitted by | `submittedBy` |
| Entry method | manual / scraper / import |
| First seen | `firstSeenAt` |
| Last seen | `lastSeenAt` |
| Seen count | `seenCount` |
| Assignee at submit | From manual submit if captured |

Align labels with `manual-submit-form.tsx` and `ManualOpportunitySubmissionSchema` (`listingUrl`, `source`, `region`, `year`, `make`, `model`, `style`, `price`, `mileage`, `sellerNotes`, `submitterNotes`). Vehicle YMM/mileage/price may **display here as read-only reference** or only in Vehicle block — implementer should avoid duplicate editable copies (Vehicle block is canonical for YMM/mileage edits).

---

### 5. Valuation (MMR + Max buy summary)

**Purpose:** Combined valuation block with **compact summary cards** — adjusted MMR and Max buy verdict at a glance. Replaces the old `MaxbuyLiveCard`-only surface and the interim full embedded `ResultBand`. Full MMR Lab workbench stays on `/mmr-lab`.

**Default (collapsed) — two side-by-side summary cards:**

| Card | Content |
|------|---------|
| **MMR** | Adjusted MMR hero + wholesale range; secondary line (base, est. retail, avg odo, avg condition); **no confidence badge** on detail (item 39) |
| **Max buy** | A–F grade circle, recommended max buy hero, evaluated-at (or dashed placeholder when MMR identity exists but mileage/price missing for YMM Max buy) |

**Progressive disclosure:**

- **MMR → Adjust** — inline adjustment panel (odometer, region, grade, color, build options) with delta chips; Cox recompute via shared `MmrAdjustmentsPanel` / `mmr-adjustments.ts` (same path as MMR Lab — do not fork).
- **Max buy → Details** — economics grid, TAV segment history, explanation math, Pass/Bid actions (`MaxbuyEvaluationSection`), only when live evaluation data exists.

**Block-level actions:**

- **Refresh valuation** — refreshes MMR + Max buy together. _Known gap (item 38): Max buy card may keep showing **saved** `maxbuySummary` instead of a live re-evaluate — see [`NEXT_STEPS.md`](../NEXT_STEPS.md)._

**Auto-run gates (split):**

| Surface | Sufficient identity |
|---------|---------------------|
| MMR | VIN **or** saved Y/M/M/S (series); odometer not required |
| Max buy | VIN **or** Y/M/M/S + mileage + asking price |

**Implementation:**

- `OpportunityValuationBlock` orchestrates lookup + recompute.
- `mmr-summary-card.tsx`, `maxbuy-summary-card.tsx` — compact cards on detail page only.
- Reuse: `build-mmr-recompute-request.ts`, `build-mmr-lab-maxbuy-request.ts`, `apply-maxbuy-result.ts`.
- Do **not** embed full `ResultBand` on detail page; do **not** remove `ResultBand` from `/mmr-lab`.

**Also show (if not redundant with MMR):**

- Deal score / grade from opportunity scoring (`finalScore`, `grade`) — sub-row under MMR or in hero badges  

---

### 6. Seller / listing notes

**Purpose:** Raw listing text (vAuto “Condition notes” pattern).

**Content:**

- Large read/write textarea  
- Prefill from manual `sellerNotes` or scraped listing description when available  
- Max length 2000 (match manual submit schema)  
- Save with block-level Save or inline Save button  

---

### 7. Notes (workflow)

**Purpose:** Closer-added context during deal work.

- Textarea + Save note  
- Show **3 most recent** `note_added` actions inline  
- Same permissions as today (`canMutateWorkflow`)  

---

### 8. History

**Purpose:** Full audit trail — **collapsed by default**.

- `OpportunityActionHistory` with all `actions`  
- Assignment, claim, status changes, evaluate, notes  

---

## Queue integration

| Today | After |
|-------|-------|
| Row click → preview sheet | Row click → `/opportunities/[id]` |
| “Open full page” in sheet | Removed with sheet retirement |

**E2E updates needed:** `web/e2e/opportunities.spec.ts` — replace preview sheet assertions with navigation to detail page.

**Optional:** Middle-click / icon on row still opens external listing URL (existing row actions if kept).

---

## Layout & visual rules

- **Desktop-first:** Use horizontal space; 2-column grids inside Vehicle, Listing, and Valuation blocks  
- **No fixed right rail** — summary numbers live inside Valuation block  
- **Collapsible headers:** Blue/neutral header bar + chevron (brand tokens from existing TAV UI, not vAuto colors)  
- **Density:** Reduce `space-y-6` gaps; target vAuto-like information density without clutter  
- **Mobile v1:** Single column stack; collapsible blocks unchanged; no sticky action bar  

---

## Data & API gaps

New or extended backend work likely required:

| Need | Notes |
|------|-------|
| `PATCH /app/opportunities/:id` (or `/vehicle`, `/listing-notes`) | Persist Vehicle block + seller notes edits |
| Store MMR Lab session on opportunity | Adjustments, last lookup payload, timestamps |
| Store Max buy snapshot on opportunity | Already partially via `maxbuySummary` |
| Vehicle extended fields | body type, engine, transmission — may need DB columns or JSON metadata on listing |
| Action history for field edits | New action type e.g. `fields_updated` or reuse metadata on existing types |

**Existing endpoints unchanged:** claim, assign, status, notes, evaluate, get detail.

---

## Out of scope / later

- **Passed** stepper behavior after Mark passed  
- **Next deal →** navigation shortcut  
- Preview sheet (retired, not redesigned)  
- Customer block (vAuto middle column — not wanted)  
- Multi-provider valuation stack (Black Book, KBB, etc.)  
- Cost breakdown / disposition Retail vs Wholesale (vAuto right rail)  
- Remember collapsible block state per user  
- Mobile sticky action bar  

---

## Implementation phases (suggested)

### Phase 1 — Shell & workflow ✅

- [x] New page layout with collapsible block components  
- [x] Hero with consolidated actions  
- [x] Single workflow block (4-step stepper + assignment)  
- [x] Remove duplicate stepper + old Valuation/Vehicle cards  
- [x] Queue: row click → full page; remove preview sheet  

### Phase 2 — Vehicle & listing blocks ✅

- [x] Vehicle block UI (2-col grid)  
- [x] Listing block (manual-entry parity, read-only v1 if PATCH not ready)  
- [x] Seller/listing notes block (placeholder; editable in Phase 4)  

### Phase 3 — Valuation block ✅

- [x] Extract miniature MMR Lab embedded component  
- [x] Wire stored session + auto-run Max buy on load  
- [x] Remove standalone `MaxbuyLiveCard` from detail page  

### Phase 4 — Persist edits ✅

- [x] PATCH API for vehicle + notes  
- [x] Save button + dirty state + history entries  
- [x] Vehicle save → MMR/Max buy refresh  

### Phase 5 — Polish ✅

- [x] Loading/error states per block  
- [x] E2E + UAT doc updates  
- [x] Empty states when VIN/mileage missing  

### Acceptance criteria (Phase 5)

- [x] Valuation block shows a loading skeleton while MMR/Max buy run, an error retry state on failure, and an empty-state prompt when VIN/YMM+mileage are missing
- [x] Vehicle + Seller notes blocks show a persistent inline error banner on save failure and disable Save while pending
- [x] Vehicle/seller-notes save calls `router.refresh()` so the server-rendered detail re-fetches and the Valuation block re-mounts + re-runs MMR/Max buy
- [x] E2E spec covers detail page: collapsible blocks, vehicle edit + save, valuation auto-run, insufficient-identity empty state
- [x] Mock helpers updated to serve PATCH `/opportunities/:id` + MMR/Max buy valuation responses

---

## Acceptance criteria (v1)

- [x] Single click on queue row opens full detail page (no preview sheet)  
- [x] One workflow stepper: Found → Working → Contacted → **Appraised**  
- [x] Hero contains Open listing + claim + workflow CTAs  
- [x] All blocks collapsible, open by default; Listing block removed  
- [x] Vehicle block: vAuto-style catalog dropdowns + blur-save  
- [x] Valuation: compact MMR + Max buy summary cards; MMR auto-run without odometer  
- [x] Blur-save on Contact, Vehicle, Salesperson/Appraisal, Title blocks  
- [x] Notes block + collapsed History block  
- [x] No duplicate workflow steppers on page  
- [x] Silent evaluate-on-open still fires  

---

## Discovery log

Requirements gathered 2026-06-24 via structured Q&A:

- Layout: two columns inside blocks, no sidebar  
- Blocks: collapsible, all open  
- Max buy: saved verdict else auto-run  
- Workflow: Found → Working → Contacted → Landed; Passed secondary; Landed = bought  
- Hero: title, one-liner, badges, primary actions  
- Listing block: manual entry fields including source, URL, provenance  
- Valuation: full MMR Lab field set + Max buy; miniature MMR Lab component  
- Preview sheet: retire; single click → full page  
- Vehicle edits: **recommended block-level Save** with MMR/Max buy refresh on valuation fields  

---

## Files likely touched (implementation reference)

| Area | Current files |
|------|----------------|
| Page route | `web/app/(app)/opportunities/[id]/page.tsx` |
| Detail client | `web/app/(app)/opportunities/_components/opportunity-detail-client-new.tsx` |
| Hero | `opportunity-detail-hero.tsx` |
| Workflow | `opportunity-workflow-panel-new.tsx`, `opportunity-workflow-stepper.tsx` |
| Max buy | `web/components/maxbuy/maxbuy-live-card.tsx` |
| MMR Lab | `web/app/(app)/mmr-lab/_components/*` |
| Queue | `opportunities-client-new.tsx`, `opportunity-preview-sheet-new.tsx` |
| Manual submit parity | `manual-submit-form.tsx`, `src/manual/manualSubmissionSchema.ts` |
| API | `src/app/routes.ts`, new PATCH handler |
| E2E | `web/e2e/opportunities.spec.ts` |

---

## UAT checklist (v1)

Manual verification steps before marking the redesign generally available.

### Layout & navigation
- [ ] Single click on a queue row opens the full detail page (no preview sheet)
- [ ] All blocks collapsible; open by default; History starts collapsed
- [ ] Desktop layout fills the width; mobile stacks blocks

### Hero & workflow
- [ ] Hero shows title, one-liner, badges, Open listing + claim + workflow CTAs
- [ ] One workflow stepper: Found → Working → Contacted → Landed
- [ ] Passed is a secondary action; Landed = bought
- [ ] Silent evaluate-on-open still fires (no UI)

### Vehicle block
- [ ] vAuto-style 2-column editable grid; Region read-only
- [ ] Save disabled until dirty; Reset restores initial values
- [ ] Save persists via PATCH and shows "Saved" toast
- [ ] Save failure shows inline error banner

### Seller notes block
- [ ] Textarea seeded from saved notes; Save enabled when dirty
- [ ] Empty notes persist as null; trim on save

### Valuation block
- [ ] Auto-runs MMR + Max buy on load when no saved verdict and identity sufficient
- [ ] Shows saved verdict card when one exists; "Run fresh lookup" re-runs
- [ ] Loading skeleton during fetch; error retry on failure
- [ ] Insufficient-identity prompt when VIN/YMM+mileage missing
- [ ] Vehicle save (VIN/mileage/YMM) re-mounts block and re-runs MMR/Max buy

### Listing & notes & history
- [ ] Listing block shows provenance parity fields
- [ ] Notes block adds closer notes; History shows full audit trail incl. `fields_updated`

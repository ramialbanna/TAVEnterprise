# Opportunity detail page redesign

**Status:** Requirements confirmed (discovery 2026-06-24)  
**Route:** `/opportunities/[id]`  
**Goal:** Replace the current sparse single-column layout with a dense, vAuto-inspired **block workspace** — grouped collapsible sections, two-column field grids inside blocks, and MMR Lab + Max buy integrated into one valuation surface.

**Reference:** vAuto Appraisal UI (layout inspiration only — not a feature-for-feature copy).  
**Companion:** [`NEXT_STEPS_LEAD_TO_DEAL.md`](../NEXT_STEPS_LEAD_TO_DEAL.md) · [`MMR-LAB-ARCHITECTURE.md`](../07-buybox/MMR-LAB-ARCHITECTURE.md) · [`v2-opportunities.md`](v2-opportunities.md)

---

## Summary

| Decision | Choice |
|----------|--------|
| Layout | Single main column; **two columns inside blocks** for field grids; **no sticky sidebar** |
| Blocks | **Collapsible**, **all open by default** |
| Queue entry | **Single click → full page**; **retire preview sheet** |
| Workflow stepper | **One strip:** Found → Working → Contacted → **Landed** |
| Landed | **Bought only** |
| Passed | **Secondary action button** (not a step); stepper UX when passed — **TBD later** |
| Primary actions | **Hero** (claim, listing, workflow CTAs) |
| Valuation | **One block:** miniature **MMR Lab** + **Max buy** |
| Max buy on open | Show **saved verdict** if present; otherwise **auto-run on page load** |
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

### 5. Valuation (MMR Lab + Max buy)

**Purpose:** Single combined block — miniature MMR Lab UI plus Max buy verdict. Replaces current `MaxbuyLiveCard` + empty Valuation card.

**MMR fields (match vAuto / MMR Lab `result-band.tsx`):**

**Inputs / adjustments:**

- Model  
- Trim  
- Odometer  
- Region  
- CR Grade  
- Color  
- Include build options (toggle)  

**Actions / links:**

- Close Details (collapse adjustment sub-panel)  
- View transactions (MMR Lab transactions table — compact or link to full MMR Lab with context)  

**Output metrics:**

- Base MMR  
- Avg Odometer  
- Avg CR Grade  
- Adjusted MMR (+ range)  
- Est retail value (+ range)  
- Per-field adjustment deltas (odometer, grade, color, region, build options) where available  

**Max buy (same block, below or beside MMR summary):**

- Show **stored verdict** from `maxbuySummary` / last evaluation when present  
- If no verdict: **auto-run on page load** (when identity sufficient: VIN or YMM + mileage + asking price + region)  
- “Adjust inputs” toggle reveals compact re-run form (optional v1.1 — can ship read-only auto-run first)  

**Implementation approach:**

- Extract shared pieces from `mmr-lab-client.tsx`, `result-band.tsx`, `maxbuy-evaluation-section.tsx` into a **`OpportunityValuationBlock`** (or `MmrLabEmbedded`) used on detail page only  
- Reuse: `mmr-adjustments.ts`, `build-mmr-recompute-request.ts`, `build-mmr-lab-maxbuy-request.ts`, debounced recompute  
- Persist MMR session + adjustments on the opportunity (stored data — team confirmed MMR Lab data model is ready)  
- Do **not** fork Cox call logic — same proxy → worker → intel worker chain as MMR Lab  

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

### Phase 1 — Shell & workflow

- New page layout with collapsible block components  
- Hero with consolidated actions  
- Single workflow block (4-step stepper + assignment)  
- Remove duplicate stepper + old Valuation/Vehicle cards  
- Queue: row click → full page; remove preview sheet  

### Phase 2 — Vehicle & listing blocks

- Vehicle block UI (2-col grid)  
- Listing block (manual-entry parity, read-only v1 if PATCH not ready)  
- Seller/listing notes block  

### Phase 3 — Valuation block

- Extract miniature MMR Lab embedded component  
- Wire stored session + auto-run Max buy on load  
- Remove standalone `MaxbuyLiveCard` from detail page  

### Phase 4 — Persist edits

- PATCH API for vehicle + notes  
- Save button + dirty state + history entries  
- Vehicle save → MMR/Max buy refresh  

### Phase 5 — Polish

- Loading/error states per block  
- E2E + UAT doc updates  
- Empty states when VIN/mileage missing  

---

## Acceptance criteria (v1)

- [ ] Single click on queue row opens full detail page (no preview sheet)  
- [ ] One workflow stepper: Found → Working → Contacted → Landed  
- [ ] Hero contains Open listing + claim + workflow CTAs  
- [ ] All blocks collapsible, open by default  
- [ ] Vehicle block shows vAuto-style fields in 2-column grid  
- [ ] Listing block shows manual-submit parity fields (URL, source, region, provenance, sighting)  
- [ ] Valuation block combines MMR Lab fields + Max buy; auto-runs Max buy when no saved verdict  
- [ ] Notes block + collapsed History block  
- [ ] No duplicate workflow steppers on page  
- [ ] Silent evaluate-on-open still fires  
- [ ] Desktop layout uses width; no empty twin cards for Valuation/Vehicle  

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

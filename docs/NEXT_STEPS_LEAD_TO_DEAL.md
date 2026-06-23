# Lead-to-Deal Flow — Improvement Suggestions

**Last updated:** 2026-06-22 · **Audience:** Engineering + Product · **Companion:** [NEXT_STEPS.md](./NEXT_STEPS.md)

> **Design principle:** The average user of this app is an auto dealership buyer or closer — not a tech-savvy person. Every screen should be readable in under 5 seconds, every primary action should be obvious, and the path from "I see a listing" to "I bought this" should feel like a single straight line, not a maze of tabs and panels.

---

## How the flow works today (30-second recap)

1. Leads enter via scraper ingest or manual URL submission at `/opportunities/submit`.
2. They land in `/opportunities` — a tabbed table (Needs action / Mine / Worth a look / All) sorted by spread.
3. Clicking a row opens a preview sheet on the right; double-click opens the full detail page.
4. On the detail page, the user clicks "I'm working this" to claim a 24h window.
5. Then "Mark contacted" → "Mark bought" (or "Mark passed") via buttons in a workflow panel lower on the page.
6. MaxBuy is embedded as an advisory card — the user must manually submit the form to see a recommendation; it doesn't gate or streamline the deal.
7. There is no in-app capture of buy price. "Bought" just flips a status; actual purchase data lives in `purchase_outcomes` fed by external import.

---

## The 9 problems (in priority order)

### 1. The table is overwhelming — 9 columns on a small screen

**What's wrong:** The default view shows Vehicle, Asking price, Wholesale value, Room to make, Deal score, Assignee, Working by, Status, and Actions — all at once. On a laptop or tablet, this means horizontal scrolling. On a phone, it's nearly unusable. The "sort by" dropdown and "columns" gear are power-user features that confuse non-technical buyers.

**Suggestion:**
- Cut the default columns to **4**: Vehicle, Asking price, Room to make (spread), and one combined "Status" cell that shows either the claim owner or the MaxBuy verdict.
- Make the row itself the primary affordance — a single tap opens the deal. Remove the separate hand-icon "I'm working this" button from the row; move claiming into the detail page where there's room to explain it.
- Replace the "Columns" gear and "Compact/Comfortable" toggle with a single "Simple / Detailed" toggle. Simple = 4 columns; Detailed = current 9. Default to Simple.
- On mobile, render rows as **cards** (vehicle title, price, spread, status pill) instead of a horizontally-scrolling table.

### 2. Two step models on the same page — confusing

**What's wrong:** The detail page shows a compact 4-step strip (Found → Working → Contacted → Outcome) *and* a 5-step panel below it (Found → Assigned → Working → Contacted → Bought/Passed). A user looking at both wonders why "Assigned" appears in one but not the other.

**Suggestion:**
- Pick **one** model. For non-technical users, 4 steps is the right number: **New → Working → Contacted → Done** (where Done = Bought or Passed).
- Remove the separate compact stepper. The panel's pill strip is enough.
- Hide the "Assigned" step from the UI — assignment happens behind the scenes (admin action or auto-on-claim). The buyer doesn't need to see it as a separate phase.

### 3. MaxBuy is advisory friction — not a decision aid

**What's wrong:** On the detail page, MaxBuy shows as a form the user has to fill out and submit. After the MMR Lab work, MaxBuy already has everything it needs (VIN, mileage, asking price from the listing). Forcing the user to click "Evaluate" is a needless step — and many won't bother, defeating the purpose.

**Suggestion:**
- **Auto-run MaxBuy** when the detail page opens (we already fire a silent `evaluateOpportunity` call; extend it to produce the MaxBuy snapshot). Show the verdict immediately as a card: "Buy up to $X · $Y under ask" or "Pass — over budget by $Z".
- Keep a "Re-evaluate" button for when the user edits mileage or asking price, but don't make the first run manual.
- If MaxBuy says **PASS**, surface that prominently (red badge on the hero) — don't bury it in a card halfway down the page.

### 4. No buy price capture — the deal has no closing moment

**What's wrong:** "Mark bought" just flips a status. There's no moment where the closer enters what they actually paid, where they bought it from, or any deal terms. That data enters the system later via external import — meaning the dashboard's performance metrics are always delayed and disconnected from the in-the-moment decision.

**Suggestion:**
- When the user clicks "Mark bought", show a **small modal** with three fields:
  1. **Actual purchase price** (prefilled with asking price — editable)
  2. **Source / auction** (prefilled from listing source — editable)
  3. **Notes** (optional, prefilled with any existing workflow notes)
- A single "Confirm purchase" button closes the deal. This writes a row to `purchase_outcomes` immediately (or a staging table that the import reconciles with) so dashboards update in real time.
- Keep it to 3 fields. Don't turn it into a full deal-entry form — that belongs in a separate accounting flow.

### 5. The hero doesn't show the next action

**What's wrong:** The hero card at the top of the detail page only shows a primary button for claiming. Once claimed, the next actions ("Mark contacted", "Mark bought") live further down the page in the workflow panel. A user who claims and then scrolls away won't see what to do next without scrolling back down.

**Suggestion:**
- The hero's primary button should always reflect **the next action**:
  - Unclaimed → "I'm working this"
  - Claimed → "Mark contacted"
  - Contacted → "Mark bought" (primary) + "Mark passed" (secondary)
  - Bought/Passed → show the outcome ("Bought for $X" or "Passed") with no button
- This mirrors what `getPrimaryWorkflowAction` already computes — just surface it in the hero, not only in the panel.

### 6. No "next deal" flow — dead-end after action

**What's wrong:** After a buyer marks a deal as contacted or bought, they're left on the same detail page. To get to the next deal, they have to hit back, wait for the list to load, find the next row, and click it. This is tedious when working through a queue of 20+ leads.

**Suggestion:**
- After a status change, show a **"Next deal →"** button in the success toast or inline banner. Clicking it navigates to the next opportunity in the active queue view (the list already knows the order).
- Optionally, add keyboard shortcuts: `J` = next, `K` = previous (power-user feature, but cheap to add).

### 7. Inconsistent MaxBuy triggering

**What's wrong:** MaxBuy fires automatically (background) after manual listing submission, so the list row shows a MaxBuy badge. But opening the detail page doesn't auto-run it — the user has to manually submit the form. And on the MMR Lab page, it's a separate flow entirely. Three surfaces, three behaviors.

**Suggestion:**
- Standardize: **MaxBuy auto-runs whenever a deal is opened** (detail page or preview sheet) and the listing has enough identity (VIN or YMM + mileage). The list-row badge already proves this works for the post-submission case.
- Remove the manual form from the detail page's default state. Show the verdict card. If the user wants to tweak inputs (different mileage, different asking price), expose a "Adjust inputs" toggle that reveals the form.

### 9. Manual submit Y/M/M/S is free-text — error-prone and slow

**What's wrong:** On `/opportunities/submit`, Year, Make, Model, and Style / trim are plain `<Input>` text boxes with placeholders like "2020", "toyota", "camry", "se". A buyer typing manually can fat-finger "Toyta", miscapitalize, or enter a trim the catalog doesn't recognize — and the system accepts it silently. This is the same problem the MMR Lab page already solved with cascading Year → Make → Model → Style dropdowns backed by `/mmr-lookup` catalog endpoints.

**Suggestion:**
- Replace the four free-text inputs on the manual submit form with the **same dependent-dropdown cascade** already shipped on `/mmr-lab` (`apply-ymm-cascade.ts` + the `/mmr-lookup/years/{year}/makes/{make}/models` and `…/trims` endpoints). Selecting a year loads makes; selecting a make loads models; selecting a model loads trims/styles.
- Reuse the existing "pin recent years at top" behavior from MMR Lab so 2022–2026 appear first.
- **Parse-then-match fallback:** the existing "Parse listing" button auto-fills Y/M/M/S from the scraped URL. With dropdowns, a parsed make/model string has to match a catalog option. Decide between exact-match (strictest), case-insensitive / whitespace-normalized match, or "no match → leave as free-text override with a warning pill". Fuzzy match is the user-friendly default; exact match is the strictest.
- Keep the option to type manually when the catalog is missing the vehicle (rare) — a "Vehicle not in catalog? Type manually" toggle that reveals the old free-text fields.

### 8. Silent "evaluate" side-effect

**What's wrong:** Opening the detail page silently fires `evaluateOpportunity` — a POST that records the user looked at the deal. There's no visible feedback, and the word "evaluate" is confusing because it sounds like it's running MaxBuy (it's not — it's just an audit log entry).

**Suggestion:**
- Either remove the silent call (if the audit value is low) or rename it internally and keep it silent. Don't use the word "evaluate" for it anywhere user-facing.
- The visible "evaluate" action in the UI should mean MaxBuy, full stop. Aligning vocabulary reduces confusion.

---

## Changes grouped by page / surface

Each improvement from above, re-sorted by where in the app the change lands. Use this as the per-page review checklist.

### A. `/opportunities` — the queue list page

Files: `opportunities-table-new.tsx`, `table-preferences.ts`, `opportunities-client-new.tsx`, `opportunities-mobile-action-bar.tsx`, `opportunity-row-actions-new.tsx`, `opportunity-badges-new.tsx`, `opportunities-empty-state-new.tsx`, `opportunities-labels.ts`, `empty-state-new.ts`

| # | Change | What it looks like on this page |
|---|--------|--------------------------------|
| 1 | Simplify the table to 4 columns + mobile cards | Default view drops from 9 columns to **Vehicle · Asking price · Room to make · Status**. "Columns" gear and "Compact/Comfortable" toggle replaced by a single **Simple / Detailed** toggle (Simple = 4 cols, Detailed = current 9). On mobile widths, rows render as stacked **cards** (title, price, spread, status pill) instead of a horizontally-scrolling table. |
| 1 (cont.) | Row is the primary affordance | Remove the hand-icon "I'm working this" button from each row (`opportunity-row-actions-new.tsx`). A single tap/click on the row opens the deal. Claiming moves to the detail page only. |
| 6 | "Next deal →" entry point | After a buyer returns from acting on a deal, the queue keeps their scroll position and the previously-acted row is dimmed/marked. (The actual "Next deal →" button lives on the detail page — see §C — but it navigates back into this list's ordering.) |
| 8 | Vocabulary cleanup | Any "evaluate" copy on this page (badges, tooltips in `opportunities-labels.ts`) is renamed so "evaluate" only ever means MaxBuy. The silent audit call is not user-facing here. |

### B. `/opportunities/submit` — manual listing submission

Files: `manual-submit-dialog.tsx`, `manual-submit-form.tsx`, `submit/page.tsx`, reuses `apply-ymm-cascade.ts` and `/mmr-lookup` catalog endpoints from `mmr-lab`

| # | Change | What it looks like on this page |
|---|--------|--------------------------------|
| 9 | Y/M/M/S dropdowns (first implementation target) | Replace the four free-text `<Input>` boxes (Year, Make, Model, Style / trim) with the same **dependent-dropdown cascade** already shipped on `/mmr-lab`: selecting a year loads makes, make loads models, model loads trims. Pin recent years (2022–2026) at the top. Add a "Parse listing" → catalog-match path (exact, case-insensitive, or fuzzy — TBD) with a "Vehicle not in catalog? Type manually" fallback that reveals the old free-text fields. Reuses `apply-ymm-cascade.ts` and `/mmr-lookup/years/{year}/makes/{make}/models` + `…/trims`. |
| 7 | Standardize MaxBuy triggering | Confirm the post-submit background MaxBuy run still fires and badges the new row in the queue. No new UI on this page — it's the reference behavior the detail page (§C) should match. |
| 8 | Vocabulary cleanup | If the submit success message says "evaluating", reword to "running MaxBuy" so vocabulary matches the rest of the app. |

### C. `/opportunities/[id]` — the deal detail page (largest set of changes)

Files: `opportunity-detail-client-new.tsx`, `opportunity-detail-hero.tsx`, `opportunity-detail-interface-client.tsx`, `opportunity-workflow-panel-new.tsx`, `opportunity-workflow-stepper.tsx`, `workflow-steps.ts`, `maxbuy-live-card.tsx`, `maxbuy-evaluate-form.tsx`, `opportunityWorkflow.ts`, `routes.ts`, new buy-price modal component

| # | Change | What it looks like on this page |
|---|--------|--------------------------------|
| 2 | Collapse to one 4-step model | Delete the compact `OpportunityWorkflowStepper` strip (Found → Working → Contacted → Outcome). Keep only the workflow panel's pill strip. Hide the "Assigned" step from the UI — assignment stays admin/backend-only. Update `workflow-steps.ts` so the buyer-facing model is **New → Working → Contacted → Done**. |
| 3 | Auto-run MaxBuy on page open | Extend the existing silent `evaluateOpportunity` call (or replace it — see #8) so it returns a MaxBuy snapshot synchronously. Render the verdict immediately as a card in `maxbuy-live-card.tsx`: **"Buy up to $X · $Y under ask"** or **"Pass — over budget by $Z"**. The manual `maxbuy-evaluate-form.tsx` is hidden by default; expose it via an "Adjust inputs" toggle. |
| 3 (cont.) | Prominent PASS badge | If MaxBuy says PASS, surface a **red badge on the hero** (`opportunity-detail-hero.tsx`), not just in the MaxBuy card. |
| 4 | Buy price modal on "Mark bought" | When the user clicks "Mark bought", open a small modal with 3 fields: **Actual purchase price** (prefilled from asking price), **Source / auction** (prefilled from listing source), **Notes** (optional). One "Confirm purchase" button writes a row to `purchase_outcomes` (or staging table). New modal component; new mutation in `opportunityWorkflow.ts`. |
| 5 | Hero shows the next action | The hero's primary button reflects the current next action, not just "I'm working this": Unclaimed → "I'm working this" · Claimed → "Mark contacted" · Contacted → "Mark bought" (primary) + "Mark passed" (secondary) · Bought/Passed → outcome text, no button. Reuse `getPrimaryWorkflowAction`. |
| 6 | "Next deal →" after status change | After a status change (contacted / bought / passed), show a **"Next deal →"** button in the success toast or an inline banner. Clicking it navigates to the next opportunity in the active queue view's order. Optional `J` / `K` keyboard shortcuts. |
| 7 | Standardize MaxBuy on detail open | Same as #3 above — MaxBuy auto-runs whenever this page opens (and the listing has VIN or YMM + mileage). Manual form is hidden behind "Adjust inputs". This makes detail-page behavior match the post-submit background behavior on `/opportunities/submit`. |
| 8 | Fix the silent "evaluate" call | Either remove the silent `evaluateOpportunity` audit POST, or rename it internally and keep it silent. No user-facing copy on this page should say "evaluate" unless it means MaxBuy. |

### D. `/mmr-lab` — separate MaxBuy surface (consistency only)

Files: `mmr-lab/page.tsx`, `mmr-lab/_components/maxbuy-evaluation-section.tsx`

| # | Change | What it looks like on this page |
|---|--------|--------------------------------|
| 7 | Standardize MaxBuy triggering | Today this page runs MaxBuy as a separate flow. Align the verdict card UI and the "Adjust inputs" toggle pattern with the detail page (§C) so all three surfaces — submit, detail, MMR Lab — behave the same way. No behavioral change to the MMR Lab lookup itself. |

### E. Shared / cross-cutting (no single page)

Files: `src/persistence/opportunityWorkflow.ts`, `src/app/routes.ts`, `opportunities-labels.ts`, `empty-state-new.ts`

| # | Change | What it looks like |
|---|--------|--------------------|
| 2 | Simplified status model | Decide (open question #5) whether `reviewed` and `negotiating` stay as settable API statuses for admin/power users but are hidden from default UI, or are removed entirely. Update `opportunityWorkflow.ts` and `routes.ts` accordingly. |
| 4 | Buy price persistence | New mutation in `opportunityWorkflow.ts` (or a staging-table write) to capture actual purchase price, source, and notes at deal close. |
| 8 | Vocabulary alignment | Sweep `opportunities-labels.ts` and `empty-state-new.ts` for any "evaluate" copy that doesn't mean MaxBuy and reword. |

---

## Suggested implementation order

Each item below is independently shippable. The order prioritizes the biggest user-facing wins first.

| # | Improvement | Effort | Impact |
|---|-------------|--------|--------|
| 9 | Y/M/M/S dropdowns on manual submit | Small–Medium | High — first implementation target; reuses MMR Lab cascade + catalog endpoints already in prod |
| 3 | Auto-run MaxBuy on detail page open | Medium | High — removes the biggest friction point |
| 5 | Hero shows next action (not just claim) | Small | High — every buyer sees this every time |
| 1 | Simplify the table: 4 columns + mobile cards | Medium | High — the list is the front door |
| 4 | Buy price modal on "Mark bought" | Medium | High — closes the feedback loop |
| 6 | "Next deal" flow after status change | Small | Medium — speeds up queue processing |
| 2 | Collapse to one 4-step model | Small | Medium — reduces confusion |
| 7 | Standardize MaxBuy triggering | Small | Medium — consistency win |
| 8 | Fix "evaluate" naming / silent call | Trivial | Low — cleanup |

> **Note on #9:** Slotted first because you flagged it as the first thing to implement. The dropdown cascade and `/mmr-lookup` catalog endpoints already exist and are proven on `/mmr-lab`, so the work is mostly porting `apply-ymm-cascade.ts` into the manual submit form and deciding the parse-then-match fallback behavior (see open question #6 below).

---

## Files most affected

| Concern | Files |
|---------|-------|
| Manual submit Y/M/M/S dropdowns (#9) | `manual-submit-form.tsx`, reuses `mmr-lab/_components/apply-ymm-cascade.ts`, `/mmr-lookup` catalog endpoints |
| List table (columns, mobile cards) | `web/app/(app)/opportunities/_components/opportunities-table-new.tsx`, `table-preferences.ts` |
| List client (tabs, summary, claim) | `opportunities-client-new.tsx` |
| Detail page layout + hero | `opportunity-detail-client-new.tsx`, `opportunity-detail-hero.tsx` |
| Workflow panel + stepper | `opportunity-workflow-panel-new.tsx`, `opportunity-workflow-stepper.tsx`, `workflow-steps.ts` |
| MaxBuy embedded card | `web/components/maxbuy/maxbuy-live-card.tsx`, `maxbuy-evaluate-form.tsx` |
| Status model + transitions | `src/persistence/opportunityWorkflow.ts`, `src/app/routes.ts` |
| Buy price capture (new) | `src/persistence/opportunityWorkflow.ts` (new mutation), new modal component |
| Empty states + copy | `empty-state-new.ts`, `opportunities-labels.ts` |

---

## Open questions to resolve before building

1. **Buy price capture**: Should it write directly to `purchase_outcomes`, or a new staging table that the CSV import reconciles with? (Avoids double-counting if the same purchase arrives via import later.)
2. **Auto-MaxBuy on detail open**: The background evaluate after manual submit already exists. Can we reuse that code path, or do we need a dedicated "evaluate on view" endpoint that returns the snapshot synchronously?
3. **Mobile cards on the list**: Do we want a separate card component, or a responsive CSS transform of the existing table? (Card component is cleaner; CSS transform is less code.)
4. **"Next deal" navigation**: Should it use the server-side ordering (spread_desc etc.) or the client's current view? The client already has the page cached, so client-side "next" is faster but may skip newly-arrived leads.
5. **Simplified status model**: If we collapse to 4 steps, do we keep `reviewed` and `negotiating` as settable statuses in the API (for power users / admin) but hide them from the default UI? Or remove them entirely?
6. **Manual submit Y/M/M/S parse-then-match (#9)**: When "Parse listing" auto-fills from a scraped URL, how should a parsed make/model string match a catalog dropdown option? Exact match (strictest, may fail on "Toyota" vs "TOYOTA"), case-insensitive / whitespace-normalized match, or fuzzy match? And when there's no match, do we block submit, allow a free-text override with a warning pill, or silently accept? This decides the fallback UX before building.

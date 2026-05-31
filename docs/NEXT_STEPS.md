# Next Steps — UX Rollout

**Last updated:** 2026-05-31 · **Start at Phase 4** · Implement one phase per PR unless asked otherwise.

> **Fresh chat prompt:**  
> Read `docs/NEXT_STEPS.md` and implement **UX Phase 4** only. Follow Rules and Key files. Do not change Classic behavior. Run verify commands before done. Check off completed items in this file.

**Legend:** `[x]` done · `[~]` in progress · `[ ]` not done

---

## Context (read first)

**TAV-AIP** — internal buyer app for Texas Auto Value. Next.js in `web/`; API is a Cloudflare Worker in `src/` (proxied via `web/app/api/app/*`). Primary page: **`/opportunities`** (lead queue + assign/claim/status/notes).

**This project:** Ship a **New** UI alongside today's **Classic** UI. User toggles between them. Default **Classic**. New mode gets friendlier copy, better table, queue tabs, workflow UX — **still spreadsheet rows** (1,000+ leads; no card grid).

| Rule | Detail |
|------|--------|
| Classic | Current UI — **frozen** except bugfixes |
| New | All improvements below — fork components, don't mutate Classic |
| Layout | Table only in both modes |
| Scope | One phase at a time; complete Exit criteria before next phase |

### Key files

| Area | Path |
|------|------|
| Opportunities page | `web/app/(app)/opportunities/page.tsx` |
| Client / table / sheet | `web/app/(app)/opportunities/_components/*` |
| App shell / nav / theme | `web/components/app-shell/*` (`theme-toggle.tsx` = pattern for interface toggle) |
| API client (web) | `web/lib/app-api/client.ts`, `schemas.ts`, `server.ts` |
| Worker list handler | `src/app/routes.ts` → `GET /app/opportunities` |
| Worker query logic | `src/persistence/opportunities.ts` |
| Worker tests | `test/opportunities.test.ts` |
| API contract | `docs/03-api/app-api.md` |

**Existing list API** (Classic uses today): `GET /app/opportunities?limit=&source=&region=&type=&grade=&status=` — extend in Phase 1, don't break Classic callers.

### Verify (run after each phase)

```bash
cd web && pnpm lint && pnpm typecheck && pnpm test
cd .. && npm run lint && npm run typecheck && npm test
```

### New-mode labels (Phase 2 — use a central map, Classic unchanged)

| Internal | UI label |
|----------|----------|
| Near miss | Almost a deal |
| MMR | Wholesale value (tooltip: MMR) |
| Spread | Room to make |
| Claim | I'm working this |
| Manual submission | Submitted by team |
| `dallas_tx` etc. | Dallas, Lubbock, … |
| Score | Deal score |

More rationale (optional): [ui-improvements-backlog.md](02-product/ui-improvements-backlog.md)

---

## Progress

| Phase | Focus | Status |
|-------|--------|--------|
| **0** | Toggle + code split | [x] |
| **1** | API pagination, sort, filters | [x] |
| **2** | Plain-language copy | [x] |
| **3** | Table at scale | [x] |
| **4** | Queue tabs | [ ] |
| **5** | Workflow panel | [ ] |
| **6** | Role-based shell | [ ] |
| **7** | Polish + UAT | [ ] |

**Current phase:** 4

---

## Phase 0 — Foundation

No API changes. **Exit:** toggle works; Classic identical to production.

- [x] Extract current UI → `OpportunitiesClientClassic` (+ table, preview sheet, workflow panel)
- [x] `InterfaceProvider`: `classic` \| `new`, default `classic`; persist in `localStorage`
- [x] Toggle in top bar or user menu
- [x] `page.tsx` renders Classic or New from preference
- [x] Stub `OpportunitiesClientNew` (may copy Classic initially)
- [x] Tests: preference + both modes render
- [x] Note in `docs/05-process/opportunities-uat.md`

---

## Phase 1 — API for scale

Worker + web types. Classic keeps `limit=50` unchanged. **Exit:** New mode gets paged/sorted/filtered lists.

- [x] `GET /app/opportunities`: `offset`, `total`; keep backward-compatible response for Classic
- [x] `sort=spread_desc|score_desc|last_seen_desc`
- [x] `view=needs_action|mine|worth_a_look|all` (+ claim-expiring / assigned logic in Worker)
- [x] Tests in `test/opportunities.test.ts`
- [x] Update `web/lib/app-api` + `docs/03-api/app-api.md`
- [x] New client only uses new params

---

## Phase 2 — Plain language

Web only. **Exit:** New copy; Classic unchanged.

- [x] `web/lib/copy/opportunities-labels.ts`
- [x] New table headers, badges, status labels, region names, page intro
- [x] Tooltips where technical terms remain

---

## Phase 3 — Table at scale

New mode only; needs Phase 1. **Exit:** scannable table at volume.

- [x] Pagination UI (25–50 per page)
- [x] Column sort UI where API supports
- [x] Colored spread / deal signal; compact Vehicle + merged Signal column
- [x] Column picker + defaults (hide Region, Last seen); sticky header
- [x] Row hover/selected; single-click → preview sheet
- [x] Quick actions: View listing, Claim
- [x] Optional density toggle

---

## Phase 4 — Queue views

Needs Phases 1 + 3. **Exit:** tabs drive filtered lists + human summary line.

- [ ] Tabs: Needs action · Mine · Worth a look · All → `view=` param
- [ ] Summary: e.g. “3 need you · 12 new today”
- [ ] Empty states per tab

---

## Phase 5 — Workflow panel

Fork `OpportunityWorkflowPanelNew`. **Exit:** guided actions; Classic panel untouched.

- [ ] Stepper: Found → Assigned → Working → Contacted → Bought/Passed
- [ ] One primary action per state; claim countdown; collision banner
- [ ] Details accordion for audit metadata; sentence-case headers
- [ ] Preview sheet: View listing + Open full page; no double-click reliance
- [ ] Mobile sticky action bar when row selected

---

## Phase 6 — Role-based shell

New mode app-wide. **Exit:** buyer-first nav; ops under More tools.

- [ ] Buyer nav: Opportunities, Submit listing, My work
- [ ] Ops: Ingest, MMR Lab, Historical, Admin — hide from non-admin
- [ ] Home tiles; KPIs → Analytics; softer env badge; sidebar labels on smaller screens

---

## Phase 7 — Polish + UAT

- [ ] Empty states, optional tour, listing icons, inline claim feedback
- [ ] E2E: Classic unchanged; New happy path
- [ ] UAT both modes → `docs/05-process/opportunities-uat.md`
- [ ] Optional: pref on `tav.users`; virtual scroll; retire Classic

---

## Shipped log

| Date | Phase | PR / notes |
|------|-------|------------|
| 2026-05-31 | 0 | Classic/New toggle, code split, stub New client |
| 2026-05-31 | 1 | Paginated opportunities API; New client uses spread sort + total |
| 2026-05-31 | 2 | Plain-language labels map; New table, badges, preview sheet, page intro |
| 2026-05-31 | 3 | Server pagination, sort, column picker, spread signal, quick actions |

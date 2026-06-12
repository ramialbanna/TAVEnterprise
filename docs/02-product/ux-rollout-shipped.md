# UX Rollout — Shipped (Archived)

**Completed:** 2026-05-31 · **Classic UI retired on `main`:** 2026-06 (TAV-WF P9)

This doc preserves the completed Opportunities UX rollout. Active work lives in [NEXT_STEPS.md](../NEXT_STEPS.md).

---

## What shipped

Phases 0–7 delivered the **New** buyer experience: paginated opportunities API, plain-language copy, table at scale, queue tabs, guided workflow panel, role-based shell, polish, and E2E/UAT checklist.

| Phase | Focus | Status |
|-------|--------|--------|
| **0** | Toggle + code split | Done |
| **1** | API pagination, sort, filters | Done |
| **2** | Plain-language copy | Done |
| **3** | Table at scale | Done |
| **4** | Queue tabs | Done |
| **5** | Workflow panel | Done |
| **6** | Role-based shell | Done |
| **7** | Polish + UAT | Done |

**Retired:** Classic UI toggle and `OpportunitiesClientClassic` — `/opportunities` now renders New mode only.

**Optional follow-ups (not scheduled):** persist interface preference on `tav.users`; virtual scroll for 1,000+ rows.

---

## Key files (reference)

| Area | Path |
|------|------|
| Opportunities page | `web/app/(app)/opportunities/page.tsx` |
| New client / table / sheet | `web/app/(app)/opportunities/_components/*` |
| App shell / nav | `web/lib/app-shell/nav-new.ts` |
| Worker list handler | `src/app/routes.ts` → `GET /app/opportunities` |
| UAT checklist | `docs/05-process/opportunities-uat.md` |

---

## Shipped log

| Date | Phase | Notes |
|------|-------|-------|
| 2026-05-31 | 0 | Classic/New toggle, code split, stub New client |
| 2026-05-31 | 1 | Paginated opportunities API |
| 2026-05-31 | 2 | Plain-language labels map |
| 2026-05-31 | 3 | Server pagination, sort, column picker, spread signal |
| 2026-05-31 | 4 | Queue tabs, human summary line |
| 2026-05-31 | 5 | New workflow panel stepper |
| 2026-05-31 | 6 | Role-based New shell |
| 2026-05-31 | 7 | Empty states, tour, e2e, UAT doc |
| 2026-06 | — | Classic retired; YMM-first MaxBuy (TAV-WF P9) |

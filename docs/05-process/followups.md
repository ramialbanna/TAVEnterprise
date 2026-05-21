# Follow-ups

Current open follow-ups only. The consolidated checklist lives in
[NEXT_STEPS.md](../NEXT_STEPS.md). Historical completed items were archived at
`docs/archive/2026-05-mvp/followups-legacy.md`.

## Product / Data

- [ ] Build a true sell-through metric once acquisition persistence writes
      bought-but-not-yet-sold inventory rows before resale. Until then,
      `/app/kpis` must not surface `sellThroughRate` as a product KPI.
- [ ] Confirm the first scheduled stale sweep wrote a `tav.cron_runs` row and
      that `GET /app/system-status` reports a real `staleSweep.lastRunAt`.

## MMR / Cox

- [ ] Keep monitoring production Cox catalog/YMMT behavior from PR #50 and add
      targeted follow-ups for estimated mileage/style badges, cost inputs, and
      UI refinement.
- [ ] Add `cox.environment` or equivalent to `GET /app/system-status` so the
      dashboard can show Cox runtime state from configuration instead of static
      operator copy.
- [ ] Confirm `pnpm test:contract` against staging after Cox production cutover.

## Web

- [ ] Recheck local `web` dev setup after populating `web/.env.local`
      (`APP_API_BASE_URL`, `APP_API_SECRET`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
      `AUTH_GOOGLE_SECRET`).
- [ ] Decide whether `web-ci` should run `next build` before `pnpm typecheck`
      when `typedRoutes` is enabled on a clean checkout.
- [ ] Add dashboard e2e error-state scenarios when the regression value is worth
      the mock-state plumbing.

## Ops / Cleanup

- [ ] Handle staging-strip cleanup in a separate PR. Do not mix it with this
      docs/local-cleanup PR.
- [ ] Review orphaned recommendation code after `/mmr-lab` removal of the legacy
      recommendation surface.
- [ ] Keep RuFlo / claude-flow autopilot disabled unless there is an explicit
      governance decision to reintroduce it.

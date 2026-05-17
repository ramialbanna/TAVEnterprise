# Web Frontend Strategy v2 — Reconciliation Note

Date: 2026-05-12
Status: Advisory only. Does **not** supersede the approved frontend spec
(`docs/superpowers/specs/2026-05-11-web-frontend-design.md`) or the implementation
plan (`docs/superpowers/plans/2026-05-11-web-frontend.md`). Those remain the
sources of truth.

Reviewed input: `~/Downloads/web-frontend-strategy-v2-2026-05-12.md` (Perplexity
second-opinion strategy note).

---

## 1. Summary of the external recommendation

The note is a post-release execution update, not a re-scope. Its conclusions:

- Continue executing the approved `/web` v1 plan; do **not** pivot to the
  expanded roadmap.
- Keep the current auth model: Auth.js Google OIDC, domain-restricted to
  `texasautovalue.com`, no role model.
- Build only the four approved v1 live-data pages: KPI Dashboard, VIN/MMR Lookup
  Lab, TAV Historical Data, Admin / Integrations.
- Defer: Cloudflare Access role middleware / L1–L5 dashboards, Sale-Week
  dashboard, commission dashboard, SSE, Buy Box UI, and Acquisition-Entry
  workflows — none have a shipped frontend contract or the product semantics
  they need.
- Anchor all frontend work to the shipped five-endpoint `/app/*` contract
  (ADR 0002, `docs/APP_API.md`), not pre-release assumptions.
- Do not surface a top-level sell-through KPI; do not emphasize the raw
  per-region `sell_through_rate` passthrough until acquisition-time outcome rows
  exist.
- Suggested delivery order: shared API client/parser layer → KPI Dashboard →
  VIN/MMR Lookup Lab → TAV Historical Data → Admin / Integrations → polish/QA.

## 2. Does it confirm our current direction?

Yes. Every strategic conclusion above already matches the approved spec and the
shipped backend state:

- Four-page v1 scope — already the spec's scope (§8).
- Auth.js Google OIDC domain gate, no roles — already implemented
  (`web/lib/auth.ts`, `web/lib/env.ts` `ALLOWED_EMAIL_DOMAIN`).
- Server-side proxy is the only holder of `APP_API_BASE_URL` / `APP_API_SECRET`
  — already the pattern (`web/lib/env.ts` server-only schema; proxy route).
- Top-level `sellThroughRate` removed — already done (APP_API.md Round 5,
  2026-05-11).
- Five `/app/*` endpoints live on staging + prod — already true.

No change of direction is implied. Treat the note as confirmation, not a new
mandate.

## 3. Corrections to endpoint / table / field names

The external note uses markdown-stripped identifiers (underscores dropped). The
correct names from `docs/APP_API.md` and the codebase:

| In the strategy note | Correct identifier |
|---|---|
| `POST /app/mmrvin` | `POST /app/mmr/vin` |
| `appkpis` | `GET /app/kpis` |
| `tav.voutcomesummaryglobal` | `tav.v_outcome_summary_global` (migration 0041) |
| (per-region rollup) | `tav.v_outcome_summary` |
| `tav.cronruns` | `tav.cron_runs` (migration 0042) |
| `purchaseoutcomes` | `tav.purchase_outcomes` |
| `APPAPIBASEURL` / `APPAPISECRET` | `APP_API_BASE_URL` / `APP_API_SECRET` |
| `HYBRIDBUYBOXENABLEDtrue` | `HYBRID_BUYBOX_ENABLED=true` (backend hint only; no UI) |
| `missingReason: neverrun` | `missingReason: "never_run"` |
| `sellthroughrate` / `sell-through` | column `sell_through_rate` (inside `byRegion` rows) |

Also a shape correction: KPI fields are **not** flat on the response. The
contract nests them as `data.outcomes.value.{ totalOutcomes, avgGrossProfit,
avgHoldDays, lastOutcomeAt, byRegion }`, with `data.outcomes.missingReason` and
sibling `data.leads` / `data.listings` blocks that degrade independently. KPI
cards bind to `outcomes.value.*`; each region row in `byRegion` is the
`tav.v_outcome_summary` row passed through verbatim (so it still carries raw
`sell_through_rate`, `last_outcome_at`, etc.).

The five shipped endpoints, verbatim: `GET /app/system-status`, `GET /app/kpis`,
`GET /app/import-batches`, `GET /app/historical-sales`, `POST /app/mmr/vin`.

## 4. What changes in the active plan

Nothing material. The approved spec and implementation plan stand as-is. This
note adds only:

- A naming-accuracy reminder (table above) — use the underscored identifiers and
  the nested KPI shape; ignore the note's mangled forms.
- Confirmation that no scope expansion is authorized at this time.

If any future edit to the spec or plan is wanted off the back of this note, that
is a separate, explicitly-approved change — not implied here.

## 5. What remains deferred

Out of scope for v1, unchanged by this note:

- Cloudflare Access role middleware / L1–L5 role-aware dashboards.
- Sale-Week dashboard.
- Commission dashboard.
- SSE / streaming page updates (current `/app/*` is request/response only).
- Buy Box UI (backend `HYBRID_BUYBOX_ENABLED` hint exists; no app-page contract).
- Acquisition-Entry workflows — also the prerequisite for any meaningful
  sell-through metric (blocked on persisting acquisition-time
  `tav.purchase_outcomes` rows; tracked in `docs/followups.md`).

Each of these requires a shipped backend/app-API contract and/or product
semantics that do not exist yet; revisit only after a formal Phase 2 approval.

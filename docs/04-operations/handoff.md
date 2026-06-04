# TAV-AIP Handoff

Current durable handoff for the next engineering session.

For the living task checklist, see [NEXT_STEPS.md](../NEXT_STEPS.md).

**Active UAT:** [Opportunities team UAT](../05-process/opportunities-uat.md) on production `/opportunities`.

## 1. What This Is

TAV-AIP is the Texas Auto Value acquisition intelligence platform. It ingests marketplace listings, normalizes and dedupes inventory, values vehicles through Cox/Manheim MMR, and exposes an authenticated internal web app.

## 2. Topology

```text
Apify / authorized caller
  -> Cloudflare main Worker
  -> Supabase + KV
  -> intelligence Worker for Cox/Manheim MMR
  -> Next.js web app
```

Important routes:

- `POST /ingest`, `POST /apify-webhook`
- `GET /app/ingest-runs`, `GET /app/ingest-runs/:id`
- `POST /app/mmr/vin`, `POST /app/mmr/ymm`
- `GET /app/mmr/catalog/*`
- `GET /admin/valuations/contract-probe`
- `GET /app/opportunities`, `GET /app/opportunities/:id` (v2 buyer queue — Phase 5)
- `POST /app/opportunities/manual`, `POST /app/opportunities/:id/assign`, `/claim`, `/evaluate` (Phase 6)
- `GET /app/me`, `GET /app/users` (identity + closer picker)

## 3. Four-Concept Rule

Keep these separate:

1. Raw Listing
2. Normalized Listing
3. Vehicle Candidate
4. Lead

Any change that collapses two of them needs an architecture review first.

## 4. Run Locally

### Local-only env files

| File | Used by | Template | Gitignored |
|------|---------|----------|------------|
| `.dev.vars` | main Cloudflare Worker | `cp .dev.vars.example .dev.vars` | yes (root `.gitignore`) |
| `web/.env.local` | Next.js web app | `cp web/.env.example web/.env.local` | yes (`web/.gitignore`) |

Never commit real secret values. Templates stay in `.dev.vars.example` and `web/.env.example`.

**Worker (`.dev.vars`)** — see `src/types/env.ts` and `.dev.vars.example` for the full list. Secrets include Supabase, ingest HMAC, Cox/Manheim, admin/app API, intel worker, Apify. Non-secret flags (`HYBRID_BUYBOX_ENABLED`, `MANHEIM_LOOKUP_MODE`, `INTEL_WORKER_URL`, `APIFY_WEBHOOK_ENABLED`) default in `wrangler.toml [vars]` and can be overridden locally.

**Web (`web/.env.local`)** — server-only vars validated by `web/lib/env.ts`:

- `APP_API_BASE_URL` — Worker origin only (proxy appends `/app`)
- `APP_API_SECRET` — Bearer for `/app/*`
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — Auth.js
- `ALLOWED_EMAIL_DOMAIN` — defaults to `texasautovalue.com`

Root Worker:

```bash
npm install
cp .dev.vars.example .dev.vars   # fill secrets before npm run dev
npm run lint
npm run typecheck
npm test
npm run dev
```

Web:

```bash
cd web
pnpm install
cp .env.example .env.local         # fill secrets before pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm dev
```

## 5. Deploy

**Web (Vercel):** auto-deploys on push to `main` (builds `web/` only).

**Workers (Cloudflare):** manual for production. Staging may auto-deploy via `.github/workflows/deploy-staging.yml` when GitHub `CLOUDFLARE_*` secrets are set.

```bash
# Production main Worker (use this — not bare npm run deploy)
npx wrangler deploy --env production

# Intelligence Worker (only when that code changed)
npm run deploy:intelligence
```

`wrangler.toml` pins `account_id` for Rami's Cloudflare account. Authenticate once with `npx wrangler login`.

Do not assume a merge auto-deploys production Workers.

## 6. Secrets

Secret names only. Values never belong in docs, issues, PRs, logs, or screenshots.

- `APP_API_SECRET`
- `ADMIN_API_SECRET`
- `WEBHOOK_HMAC_SECRET`
- `APIFY_TOKEN`
- `APIFY_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTEL_WORKER_SECRET`
- `INTEL_SERVICE_SECRET`
- `MANHEIM_API_VENDOR`
- `MANHEIM_GRANT_TYPE`
- `MANHEIM_SCOPE`
- `MANHEIM_CLIENT_ID`
- `MANHEIM_CLIENT_SECRET`
- `MANHEIM_TOKEN_URL`
- `MANHEIM_MMR_URL`

Ask Rami for secret **values** through the approved secure channel. Docs list names only.

## 7. Production State

As of **2026-05-23** (verified: Supabase migrations, Worker deploy, Vercel build):

### Deployed surfaces

| Surface | Name / URL | Last known deploy |
|---------|------------|-------------------|
| Main Worker (prod) | `tav-aip-production` → `https://tav-aip-production.rami-1a9.workers.dev` | **2026-05-23** — version `efda0005` (Phase 7 status/notes) |
| Main Worker (staging) | `tav-aip-staging` → `https://tav-aip-staging.rami-1a9.workers.dev` | GitHub Actions on push to `main` (when secrets configured) |
| Intelligence Worker (prod) | `tav-intelligence-worker-production` | unchanged by Phase 7 |
| Intelligence Worker (staging) | `tav-intelligence-worker-staging` | — |
| Web app | `https://tav-enterprise.vercel.app` (Vercel, Auth.js + `/api/app/*` proxy) | **2026-05-23** — commit `f5e73ec` pushed to `main` (Vercel auto-deploy) |
| Database | Supabase (`tav` schema) | migrations **0045–0048** applied 2026-05-23 |

Production Worker config (`wrangler.toml`): `MANHEIM_LOOKUP_MODE=worker`, `APIFY_WEBHOOK_ENABLED=true`, intel service binding active.

### Shipped product surfaces

- Dashboard, **Opportunities** (`/opportunities`), **Ingest Monitor** (`/ingest`), **VIN/MMR Lab** (`/mmr-lab`), Historical Data, Admin/Integrations.
- `GET /app/opportunities` + detail API live (buyer queue — Phase 5).
- `POST /app/opportunities/manual` + submit dialog on `/opportunities` (Phase 6 Slice B, 2026-05-22).
- `POST /app/opportunities/:id/assign`, `/claim`, `/evaluate` + assignment UI (Phase 6 Slice C, 2026-05-23).
- `POST /app/opportunities/:id/status`, `/notes` + workflow UI (Phase 7, 2026-05-23).
- `GET /app/opportunities/:id` includes `actions[]` audit history (Phase 7).
- Migrations `0045`–`0048` applied to Supabase (`users`, `manual_opportunity_submissions`, `opportunity_workflow`, `opportunity_actions`, Phase 7 status/notes).
- `GET /app/me`, `GET /app/users` for identity and closer picker.
- `GET /app/ingest-runs` + detail API live (powers Ingest Monitor).
- Cox/Manheim catalog + YMM valuation via intelligence Worker (Storefront `/mmr-lookup/*`, `/mmr/search/*`).
- Legacy Manheim `/valuations/*` is not provisioned for this account.

### Not shipped yet

- Phase 8 code complete (all four Apify tasks mapped); west/south/ok schedules enabled per soak — see [apify-phase8-regions.md](apify-phase8-regions.md).
- Near-miss reason-code filter and valuation snapshots index (v2 polish — see [v2-opportunities](../02-product/v2-opportunities.md)).

### Apify / ingest

| Task | Region map | Schedule status |
|------|------------|-----------------|
| `tav-tx-east` (`nccVufFs2grLH4Qsj`) | `dallas_tx` | **Live** — production `source_runs` show ~5‑min `facebook`/`dallas_tx` runs through 2026-05-21 |
| `tav-tx-west` (`vk7OijnAOOo8V1ekc`) | `lubbock_tx` | Code live (0049); enable schedule `KD49MXipQmFUEiIRc` for soak |
| `tav-tx-south` (`MWtcjZFWqJrnYChgp`) | `san_antonio_tx` | Mapped; enable schedule `6yk59JRahCfbTy2h8` after west soak |
| `tav-ok` (`Xpq656NgueqfXDHvU`) | `oklahoma_city_ok` | Code live (0050); enable schedule `0qdlWHsaojVZxEb1s` after south soak |

Recent production runs are completing but often show **`created_leads = 0`** — expected at current yield (~0.26% of processed listings) and small batch sizes. See [diagnostics.md](diagnostics.md) and the [2026-05-21 snapshot](apify-production-diagnosis-2026-05-21.md).

`source_runs` status mix (2026-05-21): ~1155 `completed`, 2 `truncated`, 11 `running` (stuck rows worth watching).

### Schema / migrations

- Repo migrations **0043** (valuation miss observability) and **0044** (`source_runs.status = truncated`) are reflected in `supabase/schema.sql`.
- **0044 applied to Supabase** on 2026-05-20; `truncated` rows already present.
- **0045–0049 applied to Supabase** on 2026-05-23:
  - `0045` — `tav.users` (identity)
  - `0046` — `tav.manual_opportunity_submissions`
  - `0047` — `tav.opportunity_workflow`, `tav.opportunity_actions`
  - `0048` — `reviewed` status + `status_changed` / `note_added` audit actions (Phase 7)
  - `0049` — `lubbock_tx` region key + buy-box coverage (Phase 8 west soak)
- Supabase migration registry records `users`, `manual_opportunity_submissions`, and `opportunity_workflow` as timestamped entries (2026-05-23).
- Migrations **0040–0043** objects exist in the live DB but are **not recorded** in Supabase's migration registry (registry jumps `0039` → timestamped `source_runs_status_truncated`). Hygiene-only gap — objects match repo.

### Cron / stale sweep

- `tav.cron_runs` exists; latest `stale_sweep` run **2026-05-21 06:01 UTC** (`status=ok`, `detail.updated=108` on one row).
- `GET /app/system-status` should surface `staleSweep.lastRunAt` — confirm in UI when touching ops follow-ups.

### Leads snapshot

- `tav.leads`: 16 total, 15 created in the last 7 days — pipeline has created leads historically, but **recent east-TX runs are not adding new ones**.

## 8. Repo and Branch State

GitHub `main` (as of **2026-05-23**): **`73dbe6d`** — *chore: pin Cloudflare account_id in wrangler.toml*

Recent commits on `main`:

| Commit | Summary |
|--------|---------|
| `73dbe6d` | Pin `account_id` in `wrangler.toml` (multi-account deploy fix) |
| `1a4b936` | Fix Vercel build — `app-user-headers.ts` session null guard |
| `cf76a9c` | Phase 6 — manual submit, assign/claim/evaluate, workflow tables, UI |
| `e4ec4cc` | Docs: Phase 5 complete |
| `5975d1e` | Phase 5 read-only Opportunities queue |

On `main` today:

- Phases 0–7 shipped (ingest monitor, opportunities queue, manual submit, assign/claim, status/notes).
- `docs/NEXT_STEPS.md`, `docs/tools.md`, and updated handoff/roadmap/v2-opportunities are **on GitHub `main`** (Phase 7 docs updated locally 2026-05-23).
- Phase 8 (region expansion) is next.

Local workspace notes:

- Known untracked artifact: `web/package-lock.json` (local npm; CI uses `pnpm-lock.yaml`) — do not commit.
- Handoff email may still reference `docs/INDEX.md`, `final-handoff-checklist.md`, etc. — use `docs/README.md` + `NEXT_STEPS.md` as the live spine.

Branch hygiene:

- Do not delete breach/evidence branches until reviewed deliberately.
- Delete local-only `feat/issue-45-manheim-valuations` and `recovery/issue-45-implementation` after v2 has safely started from clean `main`.

## 9. Known Issues

- Staging-strip cleanup is intentionally a separate PR. Do not mix it with docs cleanup.
- `.dev.vars.example` documents Cox client_credentials as the default path; legacy Manheim password-grant fields remain commented for rollback.
- Historical archive files may contain old Make.com, UAT, or staging language; treat files under `archive/2026-05-doc-consolidation/` as historical.
- `AGENTS.md` may regenerate local claude-mem context; do not stage it as product work.
- 11 `source_runs` rows stuck in `running` — investigate if they predate the truncated-status fix.
- Supabase migration registry missing formal entries for repo migrations 0040–0043 (objects live; registry out of sync).

## 10. Breach Pointer

RuFlo / claude-flow autopilot caused unauthorized commits and PR merge activity on 2026-05-17. It should remain disabled. Do not recreate a RuFlo topic note or operational workflow. Use the breach session note / memory as incident history only.

## 11. Doc Map

- `docs/NEXT_STEPS.md` - living checklist (phases, follow-ups, PR order).
- `README.md` - repo overview and quickstart.
- `CLAUDE.md` - agent operating rules.
- `docs/01-architecture/system-overview.md` - architecture and data model.
- `docs/04-operations/runbook.md` - production operations.
- `docs/04-operations/diagnostics.md` - production ingest/lead diagnostics index (living).
- `docs/04-operations/apify-production-diagnosis-2026-05-21.md` - Phase 4 detailed snapshot.
- `docs/02-product/roadmap.md` - roadmap and v2 direction.
- `docs/06-platform/README.md` - v2/v3 buying-side platform control docs.
- `docs/03-api/app-api.md` - app API.
- `docs/03-api/manheim-cox.md` - Cox/Manheim notes.
- `archive/2026-05-doc-consolidation/` - historical MVP artifacts.

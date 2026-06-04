# TAV-AIP

TAV-AIP is Texas Auto Value's internal acquisition intelligence platform. It ingests marketplace inventory, normalizes listings, dedupes and suppresses stale records, looks up MMR valuations, and exposes an authenticated buyer/admin web app.

The important product rule is the four-concept boundary:

1. Raw Listing
2. Normalized Listing
3. Vehicle Candidate
4. Lead

Do not collapse those concepts. The separation keeps source replay, dedupe, valuation, buyer workflow, and purchase outcomes clean.

## Current Topology

```text
Apify / authorized source
  -> Cloudflare Worker (/ingest, /app/*, /admin/*)
  -> Supabase Postgres + Cloudflare KV
  -> tav-intelligence-worker for MMR/Cox calls
  -> Next.js web app in /web
```

Key runtime pieces:

- `src/` - main Cloudflare Worker, ingestion, app/admin APIs, auth, persistence, valuation client.
- `workers/tav-intelligence-worker/` - service-bound Worker that owns Cox/Manheim credentials and valuation calls.
- `web/` - Next.js App Router dashboard with Auth.js and same-origin `/api/app/*` proxy.
- `supabase/` - schema and migrations.
- `docs/` - current architecture, runbook, roadmap, ADRs, and handoff.
- `archive/` - historical specs, audits, and superseded docs (outside `docs/` for leaner agent context).

## Active Docs

- [docs/README.md](docs/README.md) - documentation map and current source-of-truth index.
- [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) - living checklist of what to do next.
- [docs/tools.md](docs/tools.md) - MCP and external tools reference for agents.
- [docs/04-operations/handoff.md](docs/04-operations/handoff.md) - next-developer state, branch/PR map, known issues.
- [docs/04-operations/diagnostics.md](docs/04-operations/diagnostics.md) - production ingest and lead-creation diagnostics.
- [docs/01-architecture/system-overview.md](docs/01-architecture/system-overview.md) - architecture and data model.
- [docs/04-operations/runbook.md](docs/04-operations/runbook.md) - production operations, deploy, smoke checks, rollback.
- [docs/02-product/roadmap.md](docs/02-product/roadmap.md) - current roadmap and v2 direction.
- [docs/02-product/v2-opportunities.md](docs/02-product/v2-opportunities.md) - active v2 Opportunities product spec.
- [docs/03-api/app-api.md](docs/03-api/app-api.md) - app API contract.
- [docs/03-api/manheim-cox.md](docs/03-api/manheim-cox.md) - Cox/Manheim integration notes.
- [archive/README.md](archive/README.md) - historical MVP plans, specs, handoffs, staging/UAT notes, and retired scripts.

## Local Setup

Two local-only env files — never commit real values:

| File | Used by | Template |
|------|---------|----------|
| `.dev.vars` | Cloudflare Worker (`npm run dev` / wrangler) | `cp .dev.vars.example .dev.vars` |
| `web/.env.local` | Next.js web app (`pnpm dev`) | `cp web/.env.example web/.env.local` |

Both are gitignored. Secret values belong only in Cloudflare, Vercel, GitHub secrets, or these local files.

Root Worker:

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in secrets
npm run lint
npm run typecheck
npm test
npm run dev
```

Web app:

```bash
cd web
pnpm install
cp .env.example .env.local       # fill in secrets
pnpm lint
pnpm typecheck
pnpm test
pnpm dev
```

Do not commit `.dev.vars`, `web/.env.local`, live tokens, exported secrets, screenshots containing secrets, or vendor response payloads with licensed values.

## Verification

Before claiming a code change is done:

```bash
npm run lint
npm run typecheck
npm test
```

Run integration/e2e gates when the touched area requires them:

```bash
npm run test:int
cd web && pnpm test:e2e
```

For `/mmr-lab` work, also run:

```bash
cd web && pnpm test -- mmr-lab app-api
cd web && pnpm test:e2e -- mmr-lab
```

## Deployment

Production deploys are manual. There is no auto-deploy-on-merge contract for Workers in this cleanup state.

Main Worker:

```bash
npm run deploy
```

Intelligence Worker:

```bash
npm run deploy:intelligence
```

Verify production after deploy with `/health` and the relevant admin/app smoke route. See [docs/04-operations/runbook.md](docs/04-operations/runbook.md).

## Secrets

Secret values belong only in Cloudflare, GitHub secrets, Vercel, or local `.dev.vars`.

Common names:

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

Never print, log, commit, or paste secret values into GitHub, Obsidian, or PR bodies.

## MMR / Cox Status

Issue #45 / PR #50 uses the production-proven Cox Storefront path:

- catalog: `/wholesale-valuations/vehicle/mmr-lookup/*`
- YMMT valuation: `/wholesale-valuations/vehicle/mmr/search/*`

Legacy Manheim `/valuations/*` is not the chosen path for this account. It was classified as not provisioned during production probing.

## Automation Guardrail

RuFlo / claude-flow autopilot caused unauthorized commits and a PR merge on 2026-05-17. Keep it disabled. Do not recreate `.claude-flow`, `.swarm`, or a RuFlo MCP/autopilot configuration without an explicit governance decision.

## Contributing

Before major changes:

1. Read [CLAUDE.md](CLAUDE.md).
2. Read [docs/04-operations/handoff.md](docs/04-operations/handoff.md).
3. Check current PRs/issues.
4. Keep diffs scoped.
5. Run the verification loop.

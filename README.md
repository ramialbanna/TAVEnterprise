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
- `docs/` - current architecture, runbook, roadmap, ADRs, handoff, and archives.

## Active Docs

- [docs/HANDOFF.md](docs/HANDOFF.md) - next-developer state, branch/PR map, known issues.
- [docs/architecture.md](docs/architecture.md) - architecture and data model.
- [docs/RUNBOOK.md](docs/RUNBOOK.md) - production operations, deploy, smoke checks, rollback.
- [docs/ROADMAP.md](docs/ROADMAP.md) - current roadmap and v2 direction.
- [docs/APP_API.md](docs/APP_API.md) - app API contract.
- [docs/COX_API_INTEGRATION.md](docs/COX_API_INTEGRATION.md) - Cox/Manheim integration notes.
- [docs/archive/2026-05-mvp/](docs/archive/2026-05-mvp/) - historical MVP plans, specs, handoffs, staging/UAT notes, and retired scripts.

## Local Setup

Root Worker:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run lint
npm run typecheck
npm test
npm run dev
```

Web app:

```bash
cd web
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm dev
```

Do not commit `.dev.vars`, live tokens, exported secrets, screenshots containing secrets, or vendor response payloads with licensed values.

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

Verify production after deploy with `/health` and the relevant admin/app smoke route. See [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Secrets

Secret values belong only in Cloudflare, GitHub secrets, Vercel, or local `.dev.vars`.

Common names:

- `APP_API_SECRET`
- `ADMIN_API_SECRET`
- `WEBHOOK_HMAC_SECRET`
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
2. Read [docs/HANDOFF.md](docs/HANDOFF.md).
3. Check current PRs/issues.
4. Keep diffs scoped.
5. Run the verification loop.

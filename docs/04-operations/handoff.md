# TAV-AIP Handoff

Current durable handoff for the next engineering session.

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

- `POST /ingest`
- `POST /app/mmr/vin`
- `POST /app/mmr/ymm`
- `GET /app/mmr/catalog/*`
- `GET /admin/valuations/contract-probe`
- Planned v2: `GET /app/opportunities`, `GET /app/opportunities/:id`

## 3. Four-Concept Rule

Keep these separate:

1. Raw Listing
2. Normalized Listing
3. Vehicle Candidate
4. Lead

Any change that collapses two of them needs an architecture review first.

## 4. Run Locally

Root Worker:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run dev
```

Web:

```bash
cd web
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm dev
```

## 5. Deploy

Deploys are manual.

```bash
npm run deploy
npm run deploy:intelligence
```

Do not assume a merge auto-deploys Workers.

## 6. Secrets

Secret names only. Values never belong in docs, issues, PRs, logs, or screenshots.

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

## 7. Branch and PR State

As of 2026-05-18:

- `main` includes the #45 live Cox/Manheim catalog + YMM valuation work.
- `main` includes the missing-mileage and first-catalog-style estimate fixes.
- V2 starts from the Opportunities direction in `docs/02-product/v2-opportunities.md`.
- Cox/Manheim uses Storefront `/mmr-lookup/*` and `/mmr/search/*`.
- Legacy `/valuations/*` is not provisioned for this account.
- Do not delete breach/evidence branches until reviewed deliberately.
- Keep local-only `feat/issue-45-manheim-valuations` and `recovery/issue-45-implementation` until v2 has safely started from clean `main`; after that, delete them as local cleanup.

## 8. Known Issues

- Staging-strip cleanup is intentionally a separate PR. Do not mix it with docs cleanup.
- `.dev.vars.example` still documents password-grant legacy fields because live code still supports that mode.
- Historical archive files may contain old Make.com, UAT, or staging language; treat files under `docs/archive/2026-05-doc-consolidation/` as historical.
- `AGENTS.md` may regenerate local claude-mem context; do not stage it as product work.

## 9. Breach Pointer

RuFlo / claude-flow autopilot caused unauthorized commits and PR merge activity on 2026-05-17. It should remain disabled. Do not recreate a RuFlo topic note or operational workflow. Use the breach session note / memory as incident history only.

## 10. Doc Map

- `README.md` - repo overview and quickstart.
- `CLAUDE.md` - agent operating rules.
- `docs/01-architecture/system-overview.md` - architecture and data model.
- `docs/04-operations/runbook.md` - production operations.
- `docs/02-product/roadmap.md` - roadmap and v2 direction.
- `docs/06-platform/README.md` - v2/v3 buying-side platform control docs.
- `docs/06-platform/18-new-developer-handoff.md` - clean new-developer handoff.
- `docs/06-platform/19-v2-implementation-index.md` - ordered v2 docs/PR sequence.
- `docs/03-api/app-api.md` - app API.
- `docs/03-api/manheim-cox.md` - Cox/Manheim notes.
- `docs/archive/2026-05-doc-consolidation/` - historical MVP artifacts.

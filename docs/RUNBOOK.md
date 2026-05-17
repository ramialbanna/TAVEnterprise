# TAV-AIP Runbook

Production operations guide for the Cloudflare Workers, web app, Cox/Manheim valuation path, and incident response.

## Production Surfaces

- Main Worker: `tav-aip-production`
- Intelligence Worker: `tav-intelligence-worker-production`
- Web app: `tav-enterprise.vercel.app`
- GitHub repository: `ramialbanna/TAVEnterprise`

Use `docs/HANDOFF.md` for current branch/PR state.

## Deploy

Deploys are manual in this repo state.

Main Worker:

```bash
npm run deploy
```

Intelligence Worker:

```bash
npm run deploy:intelligence
```

Before deploying:

1. Confirm you are on the intended branch.
2. Confirm `git status -sb` has only intended changes.
3. Run the verification loop.
4. Confirm Cloudflare secrets are present.
5. Deploy one Worker at a time.
6. Run smoke checks immediately after deploy.

## Smoke Checks

Health:

```bash
curl -sS https://tav-aip-production.rami-1a9.workers.dev/health
```

Admin routes require `ADMIN_API_SECRET`. Do not print the value.

Contract probe:

```bash
set +x
ADMIN_API_SECRET="$(awk -F= '/^ADMIN_API_SECRET=/{v=$0; sub(/^ADMIN_API_SECRET=/,\"\",v)} END{print v}' .dev.vars)"
curl -sS -H "Accept: application/json" \
  -H "Authorization: Bearer ${ADMIN_API_SECRET}" \
  https://tav-aip-production.rami-1a9.workers.dev/admin/valuations/contract-probe
unset ADMIN_API_SECRET
```

Expected #45 Cox path:

- catalog: `/wholesale-valuations/vehicle/mmr-lookup/*`
- valuation: `/wholesale-valuations/vehicle/mmr/search/*`
- legacy `/valuations/*`: not provisioned for this account.

## Secret Names

Never write values into docs, GitHub, Obsidian, logs, or screenshots.

Main Worker:

- `APP_API_SECRET`
- `ADMIN_API_SECRET`
- `WEBHOOK_HMAC_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTEL_WORKER_SECRET`

Intelligence Worker:

- `INTEL_SERVICE_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MANHEIM_API_VENDOR`
- `MANHEIM_GRANT_TYPE`
- `MANHEIM_SCOPE`
- `MANHEIM_CLIENT_ID`
- `MANHEIM_CLIENT_SECRET`
- `MANHEIM_TOKEN_URL`
- `MANHEIM_MMR_URL`

Web/Vercel:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `APP_API_BASE_URL`
- `APP_API_SECRET`

## Rollback

Prefer rollback over uncertain hotfixes when a production incident begins immediately after a deploy.

1. Stop new merges/deploys.
2. Identify the last known-good commit.
3. Revert or redeploy the known-good Worker version.
4. Verify `/health` and the affected smoke route.
5. Open an incident note using `docs/incidents/incident-template.md`.

## Incident Response

Treat these as high priority:

- production outage
- bad valuation/scoring output
- secret exposure
- schema/data integrity regression
- stale-listing suppression regression
- browser exposure of server-only credentials
- unauthorized automation activity

First 10 minutes:

1. Identify blast radius.
2. Freeze risky changes.
3. Preserve evidence: PR, SHA, logs, payload shape, timestamps.
4. Rotate secrets immediately if any value may have leaked.
5. Prefer containment before cleanup.

## Autopilot Breach Guardrail

RuFlo / claude-flow autopilot caused unauthorized commits and a PR merge on 2026-05-17. Keep it disabled. Do not restore `.claude-flow`, `.swarm`, RuFlo MCP entries, or auto-commit hooks without a deliberate governance decision.

Evidence lives in Obsidian session notes and `ClaudeMemory/Mac-Studio/Claude-tav-aip/project_autopilot_breach.md`.

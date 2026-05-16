# NEXT SESSION START POINT — TAV-AIP

## Where We Are

TAV-AIP v1 is live, and the Apify production ingestion path is working.

Production path:

```text
Apify -> /apify-webhook -> ingestCore -> Supabase
```

Current product gap:

```text
Supabase source_runs/raw/normalized/rejections -> /app/ingest-runs -> /ingest UI
```

The second path does not exist yet. That is why Apify feels invisible in the frontend. Admin/Integrations shows latest source-run health only; it is not the Apify results screen.

## Active Roadmap

Use the current execution roadmap:

[`docs/roadmap-2026-05-16-v15-v2-execution-plan.md`](docs/roadmap-2026-05-16-v15-v2-execution-plan.md)

Strategic decision: do not start v2 yet. Finish v1.5 Ingest Monitor first.

Target sequence:

```text
Stabilize -> Ingest Visibility -> Lead Diagnosis -> v2 Read-Only Lead Review -> v2 Workflow Mutations
```

## Current Production State

- Vercel frontend is live.
- Worker `/app/*` API is live.
- Apify bridge is enabled in production.
- `tav-tx-east` Apify task is scheduled every 5 minutes and verified end-to-end.
- `tav-tx-west`, `tav-tx-south`, and `tav-ok` remain disabled pending separate soaks.
- Latest source-run health may show only one processed item because it represents the latest run, not cumulative Apify results.

## Next Claude Code Task

Implement Phase 0 and Phase 1 only.

Scope:

- Sync `supabase/schema.sql` with migrations `0043` and `0044`.
- Add a shared constant-time bearer auth helper and use it in app/admin/apify auth paths.
- Fix the Apify bridge ingest contract mismatch by validating or chunking so it no longer bypasses `IngestRequestSchema` max item limits.
- Add fetch timeouts to Apify dataset/run fetches.
- Expand CI secret scan for `APP_API_SECRET`, `APIFY_TOKEN`, `APIFY_WEBHOOK_SECRET`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, and `apify_api_` tokens.
- Add focused tests.
- Do not build `/ingest` yet.
- Do not touch v2 lead workflow yet.

## Codex Review Gate

Codex reviews each Claude Code PR for:

- architecture boundaries
- four-concept integrity: Raw, Normalized, Vehicle Candidate, Lead
- schema discipline
- security posture
- product usefulness
- operational risk
- test adequacy

## Validation Baseline From Review

Passed on 2026-05-16:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Note: `npm run build` completed the Wrangler dry-run, but Wrangler could not write its local log file under `~/.wrangler/logs` from the sandbox.

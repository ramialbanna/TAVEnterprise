# 0001 — Drop Make.com from target ingestion architecture

Status: accepted (2026-05-09)

## Context

The v0 TAV-AIP design (see `docs/PROJECT_SPEC.md`, marked legacy 2026-05-09) routed Apify scraper output through a Make.com scenario, which then posted normalized items to the Cloudflare Worker `/normalize` endpoint with a bearer token (`NORMALIZER_SECRET`).

Since v1, the Worker has exposed `POST /ingest` (HMAC-SHA256 signed via `x-tav-signature`, Zod-validated, batch loop). Recent operational documents — `docs/architecture.md`, `docs/RUNBOOK.md`, `docs/staging-smoke-2026-05-09.md`, `docs/session-handoff-2026-05-09.md`, `docs/followups.md` — make no reference to Make.com. The 2026-05-09 production cutover (`MANHEIM_LOOKUP_MODE=worker`, intel-prod Service-Binding-only) has no Make.com dependency.

A small number of legacy docs (`PROJECT_SPEC.md`, `MANHEIM_INTEGRATION.md`, `DEAL_SCORE.md`) still describe Make.com as the integration bus, creating ambiguity for future sessions.

## Decision

Make.com is **not** part of the target TAV-AIP architecture.

The target ingestion path is:

```
Apify (or any authorized caller)
   ↓ HMAC-SHA256 signed POST (header: x-tav-signature: sha256=<hmac>)
Cloudflare Worker  POST /ingest
   ↓
src/auth/hmac.ts → src/validate.ts (Zod) → src/sources/<platform>.ts → ...
```

- HMAC secret: `WEBHOOK_HMAC_SECRET` (Cloudflare secret, Worker-only).
- No middleman scenario, no bearer-token `/normalize` endpoint, no Make ops budget.
- `tav.source_runs.run_id` continues to receive the Apify run id from the caller.

If a Make.com scenario is later discovered still posting to `/ingest` in production, it is treated as a deprecated caller — it must already conform to the HMAC contract — and is to be migrated to a direct Apify webhook. No new Make.com flows are to be added.

## Consequences

Positive:
- One fewer SaaS dependency, one fewer failure surface, one fewer auth scheme to maintain.
- Removes ~1,600 Make ops/hour budget concern documented in legacy spec.
- Tighter contract: only HMAC-signed callers can ingest.
- Simpler deployment: no Make scenario blueprint to keep in sync.

Negative / risk:
- Direct Apify → Worker requires Apify webhook integration discipline (HMAC signing of the request body); no visual scenario fallback for one-off transformations.
- Existing Make-only operational runbooks are now stale — must be removed or banner-tagged on encounter.

Operational:
- Legacy docs that still reference Make.com are tagged or banner-marked rather than deleted, to preserve historical context.
- Any active Make scenario discovered in production must be inventoried and either retired or confirmed as a temporary deprecated caller.

## Alternatives considered

1. **Keep Make.com as integration bus.** Rejected — extra SaaS, extra bearer-token surface, extra ops cost, and current production already runs without it.
2. **Replace Make with a Cloudflare Queue / Durable Object orchestrator.** Deferred — direct Apify webhook is sufficient for v1; revisit if ingestion fan-out grows beyond a single endpoint.
3. **Mixed mode (Apify direct + Make for some flows).** Rejected — undermines the "one HMAC-signed ingestion contract" invariant and makes auditing harder.

## References

- `docs/architecture.md` §1, §3.2
- `CLAUDE.md` §2 (four-concept rule)
- `docs/PROJECT_SPEC.md` (legacy banner, 2026-05-09)
- `docs/MANHEIM_INTEGRATION.md` (trigger note updated 2026-05-09)
- `docs/DEAL_SCORE.md` (Make-vs-Postgres choice resolved to Worker, 2026-05-09)

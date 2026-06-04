# Engineering Review and Execution Plan — TAV-AIP

**Prepared:** 2026-05-04  
**Author:** Principal Engineering Review (Claude Code)  
**Repo:** `ramialbanna/TAV-VAIP` (branch: `main`)  
**Status:** Pre-implementation bootstrap phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Map](#2-current-architecture-map)
3. [File-by-File Review](#3-file-by-file-review)
4. [Integration Review](#4-integration-review)
5. [Database Review](#5-database-review)
6. [Data Pipeline Review](#6-data-pipeline-review)
7. [Scalability Review](#7-scalability-review)
8. [Security Review](#8-security-review)
9. [Observability Review](#9-observability-review)
10. [Testing Review](#10-testing-review)
11. [Top Risks](#11-top-risks)
12. [Detailed Executable Roadmap](#12-detailed-executable-roadmap)
13. [Concrete Implementation Tasks](#13-concrete-implementation-tasks)

---

## 1. Executive Summary

TAV-AIP (Texas Auto Value Acquisition Intelligence Platform) is currently in a **structured bootstrap phase**. No application code has been written yet. The repository contains:

- Comprehensive architectural documentation (`docs/architecture.md`) describing the full target system
- CI/CD workflows already wired for GitHub Actions (CI, staging deploy, PR review)
- Claude Code project conventions, subagent definitions, and verification loop protocols
- Placeholder files for PRODUCT_SPEC.md and SECURITY.md
- No `package.json`, no `src/` directory, no `supabase/` schema

The architecture design is **sound and enterprise-ready**. The four-concept separation (Raw Listing → Normalized Listing → Vehicle Candidate → Lead) is the correct spine. The planned module boundaries, retry strategy, DLQ pattern, and stale-detection approach are all appropriate. The existing conventions documentation would be unusually mature for a project at this stage — that is a genuine asset.

The critical risk is not architectural debt. It is the **distance between the documented design and zero lines of production code**. Every phase of the roadmap below moves that needle. The plan respects the "build the MVP with the enterprise data model" directive from `docs/architecture.md §24`.

The first executable milestone is: one Facebook listing flows end-to-end from Apify payload through `POST /ingest` to an active row in `tav.v_active_inbox`. Everything in the plan is ordered to reach that milestone safely.

---

## 2. Current Architecture Map

### 2.1 What Exists Today

| Layer | Status |
|---|---|
| CI/CD workflows | Wired (`.github/workflows/`) |
| Project conventions | Complete (`CLAUDE.md`, `.claude/rules/`, subagent defs) |
| Architecture documentation | Complete (`docs/architecture.md`) |
| Environment template | Partial (`.dev.vars.example` — missing vars from arch §17) |
| Application code (`src/`) | **Does not exist** |
| Database schema (`supabase/`) | **Does not exist** |
| `package.json` / `tsconfig.json` / `wrangler.toml` | **Does not exist** |
| Tests (`test/`) | **Does not exist** |

### 2.2 Target Architecture (from `docs/architecture.md`)

```
Apify Scraper (Facebook, Craigslist, AutoTrader, Cars.com, OfferUp)
        ↓  (HMAC-signed POST /ingest)
Cloudflare Worker  ← single HTTP surface, TypeScript strict
        ↓
tav.raw_listings        (untouched payload, audit layer)
        ↓
src/sources/<platform>.ts  (per-platform adapter, VIN-tolerant)
        ↓
tav.normalized_listings   (cleaned record with freshness fields)
        ↓
tav.vehicle_candidates    (fuzzy identity rollup across sources)
        ↓
tav.duplicate_groups      (confidence-scored groupings, no merging)
        ↓
Stale Score Engine        (0–100 score, 6 freshness statuses)
        ↓
Manheim MMR Valuation     (VIN or YMM fallback, KV-cached)
        ↓
Buy-Box Scoring           (weighted formula, rule-based, no ML yet)
        ↓
tav.leads                 (buyer-facing work items)
        ↓
Assignment / Locking      (region → capacity → priority → specialty)
        ↓
tav.lead_actions          (full audit trail)
        ↓
tav.purchase_outcomes     (closes the feedback loop)
        ↓
Buy-Box Learning Layer    (rules updated from real purchases)
```

### 2.3 External Services

| Service | Role | Auth Method |
|---|---|---|
| Apify | Facebook Marketplace scraper | Webhook push to Worker |
| Supabase (Postgres) | Primary database | Service role key (Worker-only) |
| Cloudflare Workers | Compute + HTTP surface | Wrangler deploy |
| Cloudflare KV | Valuation cache, DLQ overflow | KV binding in Worker |
| Manheim MMR API | Vehicle valuation | OAuth2 client credentials |
| Twilio | SMS alerts | Account SID + auth token |
| GitHub Actions | CI + staging deploy | Secrets: CF token, Claude OAuth |

### 2.4 Data Flow Summary

Ingest path: Apify POST → HMAC verify → Zod validate → raw persist → per-source adapter → normalized persist → identity key → vehicle candidate upsert → stale score → MMR valuation → lead score → lead gate → lead create or filtered_out.

Failure path: retry (250ms/1000ms/4000ms) → dead_letters table or KV DLQ → alert.

Worker routes: `GET /health`, `POST /ingest`, `POST /admin/replay-dlq` (future), `GET /admin/source-health` (future).

---

## 3. File-by-File Review

### 3.1 `CLAUDE.md`

**Purpose:** Tier-1 project memory. Loaded on every Claude session. Governs architecture rules, code style, verification loop, subagent delegation, and the four-concept rule.

**What looks good:**
- Four-concept rule is crystal clear with explicit anti-patterns listed.
- "Never silently drop a listing" is stated as a hard invariant.
- Stale detection is correctly called out as v1 scope, not v2.
- Verification loop (lint → typecheck → test → integration test) is mandatory.
- Facebook VIN-absence is acknowledged explicitly.

**Problems / risks:**
- The `@docs/` references (e.g., `@docs/architecture.md`) use an `@`-prefix notation that is not wired to any import resolver. These are informal references, not actual import aliases. That is fine for documentation purposes, but if any tooling ever tries to resolve them it will fail.
- CLAUDE.md references `CHANGELOG.md` and `CONTRIBUTING.md` as part of the repo layout (architecture.md §2), but neither file exists yet.

**Recommended changes:**
- Add CHANGELOG.md (can be empty stub) before the first commit with a real feature.
- Add CONTRIBUTING.md (stub pointing to CLAUDE.md conventions).

---

### 3.2 `docs/architecture.md`

**Purpose:** Canonical long-form architecture reference. Covers end-to-end flow, repo layout, routes, adapters, validation, dedupe, stale logic, valuation, buy-box, scoring, lead workflow, data model, persistence, observability, security, env vars, deployment, and implementation order.

**What looks good:**
- The 15-step implementation order (§18) is actionable and ordered correctly.
- The stale score formula (§7) is specific enough to implement directly.
- The MMR KV cache key strategy (§8) is well-defined.
- The buy-box weight formula (§10) is directly implementable.
- The ADR format (§21) and MVP acceptance criteria (§22) are useful gates.
- Anti-patterns section (§20) explicitly bans the most common mistakes.

**Problems / risks:**
- `docs/.dev.vars.example` only has placeholder scaffolding. The actual env vars documented in architecture.md §16 (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_HMAC_SECRET`, Manheim vars, Twilio vars, etc.) are NOT present in the file. This is a bootstrapping gap — any developer setting up locally will not know what to fill in.
- `NormalizedListingInput` type in §4 is missing `vin?: string`. It should be optional; its absence for Facebook must be tolerated everywhere. If it is never added to the type, downstream VIN-handling code will have no way to carry a VIN from sources that provide one (Craigslist, AutoTrader, Cars.com).
- The `NORMALIZER_SECRET` env var appears in `.dev.vars.example` but is not explained in architecture.md §16 or used anywhere in the documented design. Its purpose needs clarification before code is written.

**Recommended changes:**
- Update `.dev.vars.example` to list every env var from architecture.md §16 as `replace_me` placeholders.
- Add `vin?: string` to `NormalizedListingInput` documented in §4.
- Clarify or remove `NORMALIZER_SECRET` (likely a route-auth secret; document its use).

---

### 3.3 `docs/.dev.vars.example`

**Purpose:** Local development environment template. Should mirror every env var the Worker needs.

**What looks good:**
- Correctly marked as local-only. Placeholders are `replace_me`.
- `CLAUDE_CODE_OAUTH_TOKEN` is included (needed for Claude PR review workflow).

**Problems / risks:**
- Missing all application env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_HMAC_SECRET`, `NORMALIZER_SECRET`, all Manheim vars, all Twilio vars, `ALERT_WEBHOOK_URL`, `ALERT_TO_NUMBER`.
- Has `APP_ENV` and `LOG_LEVEL` as generic placeholders which are not in architecture.md — confirm whether these are actually needed.
- `CLAUDE_CODE_OAUTH_SCOPES` is listed but not defined anywhere; likely unused.

**Recommended changes:**
- Replace the current content entirely with the full variable list from architecture.md §16, all set to `replace_me`.

---

### 3.4 `docs/PRODUCT_SPEC.md`

**Purpose:** Business context, goals, users, core flows, non-goals, acceptance criteria.

**Current state:** Placeholder — two sentences pointing elsewhere.

**Risk:** Without a product spec, there is no canonical definition of who the buyers are, what the four regions are, what "active inbox" means to an operator, or what success looks like for the MVP. This makes it harder to validate whether implementation decisions are correct.

**Recommended changes:**
- Expand before Phase 3. Minimum viable content: four regions, buyer role definition, what "lead" means to a TAV buyer, what success looks like for the MVP (one sentence per metric), known non-goals.

---

### 3.5 `docs/SECURITY.md`

**Purpose:** Threat model, data handling, access controls, secret management, incident response.

**Current state:** Placeholder pointing to architecture.md §§15–17.

**Risk:** The security model lives only in architecture comments. No explicit threat model, no RLS plan written out, no secret rotation procedure.

**Recommended changes:**
- Expand in Phase 1. Minimum: threat model table, secret rotation procedure, list of public vs. private endpoints, planned RLS role definitions.

---

### 3.6 `docs/RUNBOOK.md`

**Purpose:** Operational procedures: CI/CD wiring, incident response, rollback, recovery.

**What looks good:**
- Staging deploy checklist is complete and actionable.
- Incident severity classification (SEV-1/2/3) is well-defined.
- TAV-specific incident classes (VIN/pathology, inventory state, reason codes, secret/config) are correctly identified.
- Rollback guidance is explicit.

**Problems / risks:**
- Section on "recovery validation" correctly requires green CI + health check + manual re-test, but there are no operational runbook entries for the actual application once it exists (e.g., how to replay the DLQ, how to drain a stale detection backlog, how to reprocess a source run).

**Recommended changes:**
- Add application runbook section after each major phase ships: DLQ replay procedure, source-run reprocess procedure, manual stale-score recalculation procedure.

---

### 3.7 `docs/identity.md`

**Purpose:** Canonical "what this project is and is not" document.

**What looks good:**
- "Build the MVP with the enterprise data model" is the correct directive.
- The anti-patterns list ("Not done" section) will prevent the most common shortcuts.
- The first milestone sentence is a useful acceptance test: one listing end-to-end.

**Problems / risks:** None. This file is complete and correct.

---

### 3.8 `.github/workflows/ci.yml`

**Purpose:** Verification loop on push/PR. Runs lint, typecheck, unit tests, and conditional integration tests.

**What looks good:**
- Gracefully skips Node steps when `package.json` is absent.
- Integration tests are triggered only when relevant paths are touched.
- Secret scan is always-on.
- TAV gates (no-VIN-required, v_active_inbox semantics, reason-code centralization) are always-on.

**Problems / risks:**
- Secret scan pattern (`SUPABASE_SERVICE_ROLE_KEY|WEBHOOK_HMAC_SECRET|...`) only catches known secret names. A developer who names a secret differently (e.g., `SUPABASE_KEY`) would not be caught.
- The reason-code centralization gate uses `::warning::` not `::error::`. Warnings do not fail CI. This should be an error once `src/scoring/reasonCodes.ts` exists.
- Integration tests require `npm run test:int` but no environment variables are injected at CI time for Supabase or Manheim. Integration tests will need a test Supabase project or a mocked adapter.

**Recommended changes:**
- Upgrade reason-code centralization gate to `::error::` once the source file exists.
- Add CI environment secrets for `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (pointing to a dedicated test project) before integration tests are wired.

---

### 3.9 `.github/workflows/deploy-staging.yml`

**Purpose:** Wrangler deploy to Cloudflare staging on push to main, gated by `staging` environment reviewer.

**What looks good:**
- Runs lint, typecheck, and tests before deploying.
- Polls `/health` after deploy.
- Gracefully skips when Cloudflare secrets are not configured.

**Problems / risks:**
- Runs with `environment: staging` but CI does not have that gate — a broken main can be manually approved into staging. The deploy workflow should add `needs: [verify]` once CI is stable.
- `deploy-staging.yml` does not pin the Wrangler version in `wrangler-action@v3`. Wrangler major version bumps can change deploy behavior silently.

**Recommended changes:**
- Add `needs: [verify]` (referencing the CI job) once CI is stable.
- Pin Wrangler action to a specific minor version (e.g., `cloudflare/wrangler-action@v3.14.0`).

---

### 3.10 `.github/workflows/pr-review.yml`

**Purpose:** Runs parallel reviewer subagents on every non-draft PR.

**What looks good:**
- Reviewer instruction includes the TAV BLOCKER list (Facebook VIN, four-concept conflation, silent drops, service-role key, stale suppression, missing indexes, v_active_inbox semantics).
- Uses `claude-code-action@v1`.

**Problems / risks:**
- Requires `CLAUDE_CODE_OAUTH_TOKEN` which is documented but may not yet be configured.
- If the token is absent, the workflow will fail visibly on every PR. This could be wrapped in an `if: env.CLAUDE_CODE_OAUTH_TOKEN != ''` check.

**Recommended changes:**
- Add a prerequisite check step that skips gracefully if `CLAUDE_CODE_OAUTH_TOKEN` is absent (similar to how staging deploy handles missing Cloudflare secrets).

---

### 3.11 `.claude/hooks/post-edit-verify.sh`

**Purpose:** Post-edit hook. Runs fast syntax + secret leak guard after every file edit.

**Current state:** File exists but content was not reviewed (no application code yet to verify against). Assumed to contain basic syntax check and secret-leak guard per `docs/verification/loop.md §Hook integration`.

**Recommended changes:**
- Verify the hook is executable (`chmod +x`) and actually runs the described checks before application code lands.

---

### 3.12 `docs/followups.md`

**Purpose:** Scope-creep capture log. Items noticed during implementation but deferred.

**What looks good:**
- Three example items already logged (trim extraction, CONCURRENTLY index on dedupe keys, single-flight protection for Manheim token refresh).
- These are real gaps that need to be addressed. They are captured correctly.

**Recommended changes:**
- None. This file is working as designed.

---

## 4. Integration Review

### 4.1 Apify / Facebook Marketplace

**Current implementation:** Not implemented. Architecture defined in `docs/architecture.md §§3–5`.

**Required environment variables:**
- `WEBHOOK_HMAC_SECRET` — used to verify Apify's inbound webhook signature.

**Failure modes:**
- Apify sends malformed JSON → Zod validation fails → reason code `schema_drift` → `tav.schema_drift_events`.
- Apify sends items with no YMM-extractable title → reason code `missing_ymm` → `tav.filtered_out`.
- Apify never sends anything → no-listing-30-min alert fires.
- HMAC mismatch → 401 response, no write.

**Retry strategy:**
- Worker returns 2xx after processing (not after each item). Apify does not retry on 2xx. Item-level retries are internal (Supabase write retry).

**Rate limits / scaling:** Apify can send hundreds of items per webhook call. The Worker must process batch items in a loop. Cloudflare Worker has a 30-second CPU time limit per request — batch processing must be bounded. Recommendation: process up to 500 items per call; any overflow should be queued.

**Security concerns:**
- HMAC verification must happen before any processing. Any code path that processes payload before HMAC check is a critical vulnerability.

**Recommended improvements:**
- Add explicit batch size cap (max 500 items per call) with overflow reason code.
- Log `run_id` and `source` on every ingest call for correlation.

---

### 4.2 Supabase (Postgres)

**Current implementation:** Not implemented. Schema fully specified in `docs/architecture.md §12`. DDL not yet written.

**Required environment variables:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Failure modes:**
- Connection timeout → retry (250ms/1000ms/4000ms) → dead_letters.
- Schema constraint violation → reason code written to `filtered_out`, processing continues.
- Service role key expired or revoked → all writes fail → DLQ flood → SEV-1 alert.

**Retry strategy:** 3 attempts, exponential backoff. After 3 failures, write to `tav.dead_letters` or KV fallback `dlq:<source>:<fingerprint>:<ts>`.

**Rate limits / scaling:** Supabase free tier: 500 MB, ~50 connections. Pro: 8 GB, ~200 connections. Cloudflare Workers use connection pooling via Supabase's REST API (PostgREST) or direct Postgres via a pooler. At 1,000 listings/day initial volume, the free tier is fine. At 10,000+ listings/day or 100+ concurrent buyers, move to Pro + pgBouncer.

**Security concerns:**
- Service role key bypasses RLS entirely. It must never leave the Worker. No dashboard, no Make.com, no AppSheet flow should use it.
- Future dashboard will need separate `anon` key + RLS policies.

**Recommended improvements:**
- Use Supabase's `@supabase/supabase-js` v2 with `createClient(url, serviceRoleKey)` — keep client instantiation in `src/persistence/supabase.ts` only.
- Add connection health check at Worker startup (test query on `GET /health`).

---

### 4.3 Cloudflare Workers

**Current implementation:** Not implemented. `wrangler.toml` does not exist.

**Required configuration:**
- `wrangler.toml`: Worker name, KV namespace binding (`TAV_KV`), env vars (reference only; actual values via secrets).
- GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**Failure modes:**
- Wrangler deploy fails due to TypeScript error → staging workflow fails, no deploy.
- Worker CPU timeout (30s) on large batches → partial processing, partial writes.
- KV write failure → valuation cache miss (acceptable — non-blocking path).

**Rate limits / scaling:** Workers free tier: 100,000 requests/day. Paid: unlimited. At 10 Apify runs/day × 500 items = 5,000 requests/day — well within free tier. KV has 1,000 writes/day on free tier; valuation cache writes could exceed this at scale — plan for paid KV.

**Security concerns:**
- Secrets must be set via `wrangler secret put`, not stored in `wrangler.toml`.
- `wrangler.toml` must not contain any `vars` block with sensitive values.

**Recommended improvements:**
- Create `wrangler.toml` in Phase 0 with environment separation (`[env.staging]` and `[env.production]`).
- Document KV namespace IDs in wrangler.toml after creation.

---

### 4.4 Manheim MMR API

**Current implementation:** Not implemented. Interface specified in `docs/architecture.md §8`.

**Required environment variables:**
- `MANHEIM_CLIENT_ID`
- `MANHEIM_CLIENT_SECRET`
- `MANHEIM_USERNAME`
- `MANHEIM_PASSWORD`
- `MANHEIM_TOKEN_URL`
- `MANHEIM_MMR_URL`

**Failure modes:**
- Token refresh fails → all MMR calls fail → reason code `mmr_failed` → valuation confidence `NONE` → scoring continues without valuation.
- MMR returns no result for YMM → reason code `mmr_no_data` → confidence `NONE`.
- Rate limit hit → 429 response → retry with backoff → eventual `mmr_failed`.

**Retry strategy:** Same 3-attempt pattern. Token is cached in KV under `manheim:token` with `expires_in − 60s` TTL. Single-flight protection needed for concurrent token refreshes (tracked in `docs/followups.md`).

**Rate limits / scaling:** Manheim API has undocumented rate limits. At 1,000 listings/day with a 24h VIN cache and 7d YMM cache, actual API calls should be well below any limit. At 10,000+ listings/day, monitor the hit rate.

**Security concerns:**
- Manheim credentials are OAuth2 client credentials + password grant. These are the most sensitive external secrets in the system. Rotate periodically.
- Token must never be logged. `src/valuation/manheim.ts` must sanitize all log output.

**Recommended improvements:**
- Build a mock Manheim adapter behind an env flag (`MANHEIM_MOCK=true`) for local development and CI.
- Add single-flight protection (`Promise` deduplication) on token refresh.

---

### 4.5 Twilio (SMS Alerts)

**Current implementation:** Not implemented. Referenced in `docs/architecture.md §14`.

**Required environment variables:**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `ALERT_TO_NUMBER`
- `ALERT_WEBHOOK_URL`

**Failure modes:**
- Twilio auth failure → alert silently dropped (bad). Must log the failure.
- Alert flood — all errors trigger Twilio → billing spike.

**Recommended improvements:**
- Add alert rate limiting: no more than one SMS per alert type per 15-minute window.
- Separate `ALERT_WEBHOOK_URL` (for Slack/webhook-based alerts) from Twilio SMS for critical SEV-1 only.
- Consider using a webhook-first alert strategy (Slack webhook, free) with Twilio as escalation only.

---

### 4.6 Make.com / Zapier

**Current implementation:** Not in scope for v1. Architecture explicitly excludes service role key from Make/Zapier.

**Risk:** If any automation is built in Make.com that directly calls Supabase with the service role key, that is a SEV-1 security violation. Document this explicitly in SECURITY.md.

---

## 5. Database Review

### 5.1 Current State

`supabase/schema.sql` does not exist. No migrations exist. The schema is fully specified in `docs/architecture.md §12`.

### 5.2 Required Tables

Based on `docs/architecture.md §12`:

| Table | Purpose | Key Fields |
|---|---|---|
| `tav.source_runs` | Scraper run telemetry | `id`, `source`, `region`, `run_id`, `scraped_at`, `item_count`, `status` |
| `tav.raw_listings` | Untouched inbound payload | `id`, `source`, `source_run_id`, `raw_payload` (jsonb), `received_at` |
| `tav.normalized_listings` | Cleaned per-platform record | `id`, `source`, `source_listing_id`, `url`, `title`, `year`, `make`, `model`, `trim`, `vin`, `price`, `mileage`, `city`, `state`, `region`, `seller_name`, `seller_url`, `identity_key`, `first_seen_at`, `last_seen_at`, `scrape_count`, `freshness_status`, `stale_score`, `freshness_flags` (jsonb) |
| `tav.vehicle_candidates` | Fuzzy identity rollup | `id`, `identity_key`, `canonical_year`, `canonical_make`, `canonical_model`, `canonical_trim`, `region`, `listing_count`, `first_seen_at`, `last_seen_at` |
| `tav.duplicate_groups` | Cross-source groupings | `id`, `vehicle_candidate_id`, `normalized_listing_id`, `confidence`, `is_canonical` |
| `tav.valuation_snapshots` | MMR results | `id`, `normalized_listing_id`, `vin`, `year`, `make`, `model`, `trim`, `mileage_bucket`, `region`, `mmr_value`, `method` (`vin` or `ymm`), `confidence`, `fetched_at` |
| `tav.buy_box_rules` | Rule-based scoring config | `id`, `make`, `model`, `year_min`, `year_max`, `max_mileage`, `min_mileage`, `target_price_pct_of_mmr`, `region`, `source`, `priority_score`, `notes`, `is_active` |
| `tav.leads` | Buyer-facing work items | `id`, `normalized_listing_id`, `vehicle_candidate_id`, `status`, `score`, `grade`, `deal_score`, `freshness_score`, `buy_box_score`, `region_score`, `source_confidence_score`, `reason_codes` (jsonb), `assigned_to`, `assigned_at`, `lock_expires_at`, `last_action_at` |
| `tav.lead_actions` | Audit trail | `id`, `lead_id`, `action`, `actor`, `notes`, `created_at` |
| `tav.purchase_outcomes` | Closes the feedback loop | `id`, `lead_id`, `purchased_at`, `purchase_price`, `mmr_at_purchase`, `gross_profit`, `buyer_id`, `source`, `region` |
| `tav.dead_letters` | Final-failure capture | `id`, `source`, `fingerprint`, `payload` (jsonb), `error`, `attempts`, `created_at` |
| `tav.schema_drift_events` | Unexpected field capture | `id`, `source`, `run_id`, `unexpected_fields` (jsonb), `sample_payload` (jsonb), `detected_at` |
| `tav.filtered_out` | Business-reason rejections | `id`, `source`, `source_listing_id`, `url`, `reason_code`, `details` (jsonb), `filtered_at` |

### 5.3 Required Indexes

All indexes from `docs/architecture.md §12`:

```sql
-- normalized_listings
CREATE INDEX ON tav.normalized_listings (source);
CREATE INDEX ON tav.normalized_listings (region);
CREATE INDEX ON tav.normalized_listings (freshness_status);
CREATE INDEX ON tav.normalized_listings (last_seen_at);
CREATE INDEX ON tav.normalized_listings (identity_key);
CREATE INDEX CONCURRENTLY ON tav.normalized_listings (source, source_listing_id);
CREATE INDEX ON tav.normalized_listings (listing_url);
CREATE INDEX ON tav.normalized_listings (year, make, model);

-- leads
CREATE INDEX ON tav.leads (status);
CREATE INDEX ON tav.leads (assigned_to);
CREATE INDEX ON tav.leads (created_at);
CREATE INDEX ON tav.leads (grade);
CREATE INDEX ON tav.leads (score DESC);

-- source_runs
CREATE INDEX ON tav.source_runs (source, region, scraped_at DESC);
```

### 5.4 Required Views

```sql
-- Buyer-ready leads (excludes stale_confirmed/removed, last seen within 30d)
CREATE VIEW tav.v_active_inbox AS ...;

-- Latest run per source/region
CREATE VIEW tav.v_source_health AS ...;

-- Buyer performance (Phase 7+)
CREATE VIEW tav.v_buyer_performance AS ...;
```

`v_active_inbox` is guarded by the TAV CI gate — it must exclude `stale_confirmed`, `removed`, and filter `last_seen_at > now() − 30d`.

### 5.5 Missing Indexes (Risk Items)

- **`tav.normalized_listings (source, source_listing_id)`**: This is the exact-dedupe lookup key. Without an index, every ingest run does a full table scan for each item. Must be a `CONCURRENTLY` unique partial index once data is live. Already noted in `docs/followups.md`.
- **`tav.vehicle_candidates (identity_key)`**: Fuzzy dedupe lookups hit this every ingest. Must be indexed.
- **`tav.leads (assigned_to, status)`**: Buyer inbox query filter. Composite index needed.
- **`tav.lead_actions (lead_id, created_at DESC)`**: Audit trail lookup. Needs index.

### 5.6 Schema Risks

- **`vin` field missing from `NormalizedListingInput` type definition** in architecture.md. It needs to be added as `vin?: string` — optional everywhere, used when present (AutoTrader, Cars.com).
- **`freshness_flags` column** is listed as jsonb but the specific fields are not enumerated. This creates schema-drift risk. Recommend: explicit boolean columns for `price_changed`, `description_changed`, `image_changed`, `buyer_marked_stale`, `buyer_marked_sold`, `source_no_longer_returns_url` rather than an opaque jsonb.
- **`reason_codes` column** on `tav.leads` should be a `text[]` (array) not jsonb for simpler querying.
- **No `updated_at` columns** documented. Every mutable table should have `updated_at DEFAULT now()` with an update trigger.
- **No `deleted_at` soft-delete columns**. Hard deletes of leads or normalized listings would break audit trails. Consider soft deletes.
- **`tav.buy_box_rules` has no versioning**. If rules change, there is no way to know which rule version scored a lead. Add `version` integer or link leads to rule snapshot.

### 5.7 RLS Plan

No RLS policies currently planned for v1 (service role key bypasses RLS). When the dashboard is built:
- `admin` role: full access.
- `manager` role: all leads, all actions, read buy_box_rules.
- `buyer` role: own assigned leads + inbox, own lead_actions only.
- `viewer` role: read-only on leads + lead_actions.
- `anon` role: no access.

RLS must be implemented before any dashboard key (not service role) is issued. The service role key must never be given to any non-Worker client.

### 5.8 Migration Strategy

- Use Supabase's migration system (`supabase/migrations/YYYYMMDDHHMMSS_name.sql`).
- All migrations must be idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Additive-only rule: never `DROP COLUMN`, never rename columns in place — use the additive migration pattern (new column → backfill → switch readers → drop old in separate migration).
- Every migration requires a `db:` conventional commit.

---

## 6. Data Pipeline Review

### Step 1: Listing Source (Apify)

**Current behavior:** Not implemented.  
**Gaps:**  
- No source_runs tracking (when did the scrape happen, how many items, was it a success).  
- No scraper health monitoring (is Apify returning results regularly).  
**Failure points:** Apify job fails silently → no new listings arrive → stale listings linger → buyers see outdated inventory.  
**Required improvements:** Write a `source_runs` row on every ingest call. Alert if a source has not run in 30 minutes.

---

### Step 2: Ingestion (Worker `POST /ingest`)

**Current behavior:** Not implemented.  
**Gaps:**  
- HMAC verification logic not written.  
- Zod wrapper schema not written.  
- Batch loop not written.  
**Failure points:**  
- HMAC check absent → anyone can POST fake listings.  
- No Zod validation → malformed items proceed to normalization, causing runtime errors.  
- No batch size cap → large payloads cause CPU timeout.  
**Required improvements:**  
- HMAC check is step 1, before any other processing.  
- Zod schema validates wrapper first, then each item individually (item failures do not abort the batch).  
- Cap batch at 500 items; log and dead-letter overflow.

---

### Step 3: Normalization

**Current behavior:** Not implemented. Functions specified in `docs/architecture.md §§4–5`.  
**Gaps:**  
- `cleanText.ts`, `extractYmm.ts`, `mileage.ts` not written.  
- YMM extraction from title is the hardest part — needs regex + NLP-lite parsing. Risk: false extractions produce bad identity keys.  
**Failure points:**  
- Title parsing extracts wrong year (e.g., "2021 Toyota Camry, new engine in 2023" → year 2023).  
- Mileage string parsing fails on non-standard formats ("82k miles", "82,000 mi").  
**Data quality risks:**  
- Silent normalization errors (returning `undefined` for year) downstream produce bad identity keys and wrong stale scores.  
**Required improvements:**  
- Every normalization failure (missing year, unrecognized mileage format) must produce a reason code and go to `filtered_out` — not silent `undefined`.  
- Add `test/fixtures/facebook/` with 10+ real-shaped payloads including edge cases (no year, non-standard mileage, missing title, Unicode characters).

---

### Step 4: Deduplication

**Current behavior:** Not implemented.  
**Gaps:**  
- Exact dedupe (source + source_listing_id, source + url) is straightforward.  
- Fuzzy dedupe (identity key generation from YMM + mileage band + region + seller URL) requires careful band definitions.  
**Failure points:**  
- Mileage band boundaries (e.g., 55,000–60,000) should not cause the same physical car to map to different bands when mileage is reported inconsistently across scrapes.  
- Seller URL normalization is tricky for Facebook (profile URLs can change).  
**Data quality risks:**  
- Over-aggressive fuzzy dedupe groups different vehicles together.  
- Under-aggressive dedupe allows the same listing to appear multiple times in the buyer inbox.  
**Required improvements:**  
- Write 20+ dedupe unit tests before shipping (all cases from architecture.md §6: exact URL, same source+id, fuzzy same YMM/band/region, fuzzy NOT duplicate when band or region differs).  
- Identity key must never include seller URL as a required component — it is a bonus signal only.

---

### Step 5: Enrichment (Valuation)

**Current behavior:** Not implemented.  
**Gaps:**  
- Manheim MMR adapter not written.  
- KV cache key strategy specified but not implemented.  
- Single-flight protection for token refresh not implemented (followups.md item).  
**Failure points:**  
- Manheim API down → scoring proceeds with `confidence = NONE` (correct per architecture). But if every listing gets `confidence = NONE`, buy-box scoring degrades to no-valuation mode silently.  
**Required improvements:**  
- Add `mmr_failure_rate` metric to source health view.  
- Alert if Manheim failure rate exceeds 20% over a 1-hour window.  
- Build mock Manheim adapter (returns fixed MMR values) for local dev and CI.

---

### Step 6: Scoring

**Current behavior:** Not implemented.  
**Gaps:**  
- `scoreLead.ts` not written.  
- `buyBox.ts` not written.  
- `reasonCodes.ts` not written.  
**Failure points:**  
- Division by zero if MMR is zero (price / MMR ratio).  
- Buy-box rules table is empty → all leads get `buyBoxScore = 0`.  
**Required improvements:**  
- Seed `tav.buy_box_rules` with at least 3 representative rules (Toyota Camry/Corolla/Tacoma Texas region) before testing end-to-end.  
- Add guard against zero-MMR division.

---

### Step 7: Assignment

**Current behavior:** Not implemented.  
**Gaps:**  
- Assignment algorithm (region → capacity → priority) not designed in detail.  
- Locking mechanism (lock_expires_at, idle lead recycling) not implemented.  
**Failure points:**  
- Race condition: two buyers claim the same lead simultaneously → both see it as "assigned".  
**Required improvements:**  
- Use a database-level SELECT FOR UPDATE SKIP LOCKED or optimistic locking (compare-and-swap on assigned_to + status) to prevent double-assignment.  
- Define "buyer capacity" — how many active leads can one buyer hold before new assignment stops.

---

### Step 8: Human Review

**Current behavior:** No workflow UI exists.  
**Gaps:**  
- AppSheet/Sheets temporary surface not yet defined.  
- Lead actions (contacted, passed, stale, purchased) are not yet wired.  
**Required improvements:**  
- Define the minimum buyer action set for v1: contact, pass, stale, sold.  
- Each action must write to `tav.lead_actions` and update `tav.leads.status`.

---

### Step 9: Purchase Outcome Feedback

**Current behavior:** Not implemented.  
**Gaps:**  
- `tav.purchase_outcomes` table not defined.  
- No mechanism to capture purchase price vs. MMR at time of purchase.  
**Required improvements:**  
- Purchase outcomes must record: purchase_price, mmr_at_purchase (from valuation_snapshot at assignment time), gross_profit, buyer_id, source, region.  
- This table is the foundation of the future buy-box learning layer.

---

### Step 10: Reporting / Analytics

**Current behavior:** Not implemented.  
**Gaps:**  
- `tav.v_buyer_performance` view not defined.  
- No source/region performance reporting.  
**Required improvements:**  
- Define v_buyer_performance columns before Phase 8 so the table schema is designed with reporting in mind.

---

## 7. Scalability Review

### Can the system support multiple listing platforms?

**Yes, with the current design.** The adapter pattern (`src/sources/<platform>.ts`) is the correct abstraction. Adding Craigslist, AutoTrader, or Cars.com is additive — no shared code changes, no schema changes. The `SourceName` union type in `src/types/domain.ts` just needs the new value added.

**Risk:** VIN-bearing sources (AutoTrader, Cars.com) will have different fuzzy-dedupe paths than Facebook. The identity key algorithm must handle VIN-keyed matching separately from YMM-keyed matching.

---

### Can the system handle thousands of daily listings?

**Yes, with current architecture.** At 5,000 listings/day on free tier, the Cloudflare Worker and Supabase free tier handle this comfortably. At 50,000 listings/day, move to:
- Supabase Pro (more connections, more storage).
- Cloudflare paid Workers (no daily request limits).
- Consider batching Supabase writes (upsert in batches of 50 vs. one-by-one).

---

### Can the system support 100+ buyers?

**Not yet.** The assignment, locking, and buyer workflow are not implemented. The data model supports it (assigned_to, lock_expires_at, lead_actions). The implementation requires:
- An authenticated dashboard (Supabase Auth + RLS + Next.js or AppSheet).
- Concurrency-safe lead claiming.
- Manager-level views and escalation paths.

---

### Can it reprocess stale listings?

**Yes, with the DLQ replay route.** `POST /admin/replay-dlq` (future) will re-process dead-letter items. For stale recalculation, a scheduled job (Cloudflare Cron Trigger or a periodic Apify run that pings the Worker) can recalculate stale scores without re-ingesting raw data.

---

### Can it support historical purchase-based scoring?

**Yes, after Phase 8.** The `tav.purchase_outcomes` table is designed to capture everything needed. Once 6–12 months of purchase data exist, rules can be derived from it. ML scoring is explicitly deferred until then.

---

## 8. Security Review

### 8.1 Current State

No application code means no application-level security vulnerabilities today. The risk is in the design.

### 8.2 Secrets Handling

**Good:**
- HMAC secret for webhook verification is planned.
- Service role key isolation to Worker is a hard rule.
- `.gitignore` correctly excludes `.dev.vars` and all `*.key` patterns.
- Secret scan in CI catches known variable names.

**Risks:**
- `.dev.vars.example` currently does not list the application secrets. A developer could accidentally commit `.dev.vars` with real values before knowing what to exclude.
- `NORMALIZER_SECRET` is in `.dev.vars.example` without explanation. If this is a second HMAC secret or an API key, it needs to be documented.
- CI secret scan uses a fixed pattern list. Rotate secrets to non-standard names (e.g., `SUPA_KEY`) and the scan misses them.

**Recommendations:**
- Add all application secrets to `.dev.vars.example` as `replace_me` immediately.
- Document the purpose of every secret in architecture.md §16.
- Expand the CI secret scan pattern to be broader (e.g., scan for `=eyJ` prefix which is the base64 JWT prefix Supabase uses).

### 8.3 API Authentication

**Current:** `POST /ingest` will use HMAC-SHA256 (`x-tav-signature: sha256=<sig>`) over raw request body. This is the correct approach.

**Risk:** HMAC must verify the raw body, not the parsed body. Any middleware that parses JSON before HMAC verification will introduce a timing attack or body-mutation attack surface.

**Recommendation:** Verify HMAC on raw `request.text()`, then parse. Never parse first.

### 8.4 Webhook Authentication

Same as §8.3. The Apify → Worker webhook is the only inbound webhook in v1.

### 8.5 Row-Level Security

Not implemented yet (v1 uses service role only). Must be planned before any dashboard key is issued. See §5.7 for the role plan.

### 8.6 Logging of Sensitive Data

**Risk:** The `src/valuation/manheim.ts` adapter will handle OAuth tokens. Any `console.log(response)` style logging could leak the Manheim token.

**Recommendation:** Add a logging utility that strips known sensitive fields (`token`, `access_token`, `client_secret`, `password`) before any log output.

### 8.7 Public Endpoints

`GET /health` is the only intended public endpoint. `POST /ingest` requires HMAC. All admin routes require additional auth (TBD — recommend a static admin token checked as a request header).

---

## 9. Observability Review

### 9.1 Current State

No observability infrastructure exists. The architecture specifies what to build (§14). Nothing is implemented.

### 9.2 Structured Logging

**Required but not implemented.** All Worker logs should be structured JSON:
```json
{
  "level": "info",
  "event": "ingest.processed",
  "source": "facebook",
  "run_id": "apify-123",
  "region": "dallas_tx",
  "processed": 95,
  "rejected": 5,
  "duration_ms": 1240,
  "ts": "2026-05-04T10:00:00Z"
}
```

Cloudflare Workers logs are visible in the Cloudflare dashboard and via `wrangler tail`. Add structured logging from day one.

### 9.3 Error Tables

`tav.dead_letters`, `tav.schema_drift_events`, and `tav.filtered_out` are the observability backbone. They do not exist yet but are correctly designed.

**Gap:** No `tav.source_runs` tracking. Without it, there is no way to answer "did Apify run today? How many items did it return? What was the error rate?"

### 9.4 Dead-Letter Queue

**Planned:** KV fallback `dlq:<source>:<fingerprint>:<ts>` for when Supabase writes fail and `tav.dead_letters` itself cannot be written.

**Gap:** No replay mechanism. `POST /admin/replay-dlq` is listed as a future route. It must be implemented before the first production run.

### 9.5 Alerts

**Trigger conditions from architecture.md §14:**
1. No listings in last 30 minutes → source health alert.
2. Scraper run with zero items → empty run alert.
3. MMR failure spike → valuation degradation alert.
4. Supabase write failure burst → DLQ flood alert.
5. DLQ count above threshold → DLQ overflow alert.
6. Schema drift detected → integration change alert.
7. Excellent leads unassigned → priority escalation.
8. Lead queue backlog → capacity alert.
9. Stale-rate spike → data quality alert.

**Gap:** None of these are implemented. Recommend implementing alerts 1, 2, 4, and 5 in Phase 3. Alerts 7, 8, 9 in Phase 7.

### 9.6 Dashboard Metrics

No dashboard exists. v1 uses the Cloudflare Worker dashboard + Supabase table views. Target metrics for a future admin dashboard:
- Listings ingested per source per day.
- Reject rate by reason code.
- Stale rate by source and region.
- MMR hit rate (VIN vs. YMM vs. failure).
- Lead score distribution.
- Lead assignment rate.
- Time-to-contact by buyer.
- Purchase rate by lead grade.

---

## 10. Testing Review

### 10.1 Current State

No tests exist. The CI workflow is ready to run them when they exist.

### 10.2 Required Unit Tests

All test files from `docs/architecture.md §2` (repo layout):

| File | What to test |
|---|---|
| `test/normalize.test.ts` | `cleanText`, `extractYmm`, `mileage` — happy path, edge cases, Unicode, empty strings |
| `test/staleScore.test.ts` | All stale score signal combinations, status boundary values, `0–24 new/active → 25–49 aging → 50–74 stale_suspected → 75–100 stale_confirmed` |
| `test/scoring.test.ts` | Lead scoring formula — all 5 weight components, boundary grades, zero-MMR guard, reason code generation |
| `test/dedupe.test.ts` | Exact URL dedupe, same source+id dedupe, fuzzy same identity key, fuzzy different mileage band, fuzzy different region |

### 10.3 Required Integration Tests

| Scenario | Coverage |
|---|---|
| Happy-path Facebook ingest | Full pipeline: POST /ingest → raw_listing → normalized_listing → vehicle_candidate → lead |
| Invalid HMAC | Returns 401, no writes |
| Missing YMM → filtered_out | reason_code = missing_ymm |
| Duplicate listing | Second ingest increments scrape_count, does not create duplicate lead |
| Manheim failure | Scoring proceeds with confidence NONE, reason code mmr_failed |
| DLQ write on Supabase failure | Dead-letter row or KV key created |
| v_active_inbox excludes stale_confirmed | View returns correct rows |

### 10.4 Missing Tests (High Priority)

- Facebook fixture with no title → should produce `missing_title` reason code, not throw.
- Facebook fixture with title only (no explicit YMM fields) → YMM must be extracted from title.
- Facebook fixture with VIN present → VIN stored, used for MMR.
- Stale score with all signals at maximum → confirms `stale_confirmed` status.
- Buy-box rule evaluation with no active rules → all leads get `buyBoxScore = 0`, not error.
- HMAC replay attack (same payload twice) → second call is not blocked (idempotent by design, but verify).

### 10.5 Test Infrastructure Requirements

- Vitest configuration in `package.json`.
- Test fixtures in `test/fixtures/facebook/` (minimum 10 real-shaped payloads).
- Integration tests require a test Supabase project — add `SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_ROLE_KEY` to CI secrets.
- Mock Manheim adapter for unit + integration tests (`MANHEIM_MOCK=true`).

---

## 11. Top Risks

### Critical

**RISK-001: No application code exists — zero production functionality**  
- **Why it matters:** The platform currently cannot ingest a single listing. All documentation is a liability if code does not ship.  
- **Where it appears:** Entire `src/` directory is absent.  
- **Recommended fix:** Execute Phase 0 and Phase 1 of the roadmap immediately.  
- **Effort:** Phase 0 = 1 day. Phase 1 = 2–3 days.

**RISK-002: `.dev.vars.example` is incomplete**  
- **Why it matters:** Any developer (or future Claude session) setting up locally will not know what environment variables are needed. This can lead to accidentally incomplete `.dev.vars` files and runtime crashes.  
- **Where it appears:** `docs/.dev.vars.example`.  
- **Recommended fix:** Add all 15 env vars from architecture.md §16 to the example file.  
- **Effort:** 30 minutes.

**RISK-003: No Supabase schema — no database**  
- **Why it matters:** The entire data model exists only in documentation. Without `supabase/schema.sql`, no migration can run, no tables exist, no integration tests can run.  
- **Where it appears:** `supabase/` directory is absent.  
- **Recommended fix:** Implement Phase 2 (Database Schema Hardening).  
- **Effort:** 1–2 days.

---

### High

**RISK-004: HMAC verification not implemented**  
- **Why it matters:** Without HMAC verification, the `/ingest` endpoint accepts any payload from any source. A bad actor (or a misconfigured Apify job) could inject arbitrary listings.  
- **Where it appears:** `src/auth/hmac.ts` (does not exist).  
- **Recommended fix:** Implement HMAC as the first piece of code after the Worker skeleton.  
- **Effort:** 4 hours.

**RISK-005: Facebook VIN assumption risk**  
- **Why it matters:** The CI gate checks for VIN-required code in `src/sources/facebook.ts` — but that file does not exist yet. If a developer writes the Facebook adapter with an implicit VIN assumption (e.g., by copying AutoTrader logic), the gate will catch it. But the gate only protects `throw .*VIN|require.*vin|!vin` patterns — a more subtle assumption (e.g., using VIN as the primary dedupe key) would not be caught.  
- **Where it appears:** Future `src/sources/facebook.ts`, `src/dedupe/identity.ts`.  
- **Recommended fix:** Make the identity key algorithm explicitly VIN-optional with YMM as the primary path.  
- **Effort:** Design decision — no extra code, but must be in the identity key design.

**RISK-006: No single-flight protection on Manheim token refresh**  
- **Why it matters:** If 50 items are processed concurrently and the cached token has expired, all 50 will attempt a token refresh simultaneously. This produces 50 OAuth requests in parallel, which Manheim's API will likely rate-limit or reject.  
- **Where it appears:** Future `src/valuation/manheim.ts`.  
- **Recommended fix:** Promise deduplication (one pending refresh promise shared across concurrent callers). Tracked in `docs/followups.md`.  
- **Effort:** 2 hours.

**RISK-007: No DLQ replay mechanism**  
- **Why it matters:** The dead-letter queue is the safety net for all write failures. Without a replay mechanism, any item in the DLQ is permanently lost (or requires manual SQL to recover).  
- **Where it appears:** `POST /admin/replay-dlq` not yet planned in detail.  
- **Recommended fix:** Design and implement DLQ replay in Phase 3.  
- **Effort:** 1 day.

**RISK-008: Race condition in lead assignment**  
- **Why it matters:** At 100+ concurrent buyers, two buyers could claim the same lead simultaneously if the assignment is not using database-level locking.  
- **Where it appears:** Future `src/assignment/locking.ts`.  
- **Recommended fix:** Use `SELECT ... FOR UPDATE SKIP LOCKED` or optimistic locking (compare-and-swap on `assigned_to + status`).  
- **Effort:** 4 hours.

---

### Medium

**RISK-009: `freshness_flags` is an opaque jsonb column**  
- **Why it matters:** Querying specific flags (e.g., "all listings where price changed") will require `jsonb` operators instead of simple column comparisons. This makes the stale score logic harder to index and harder to query.  
- **Where it appears:** `tav.normalized_listings.freshness_flags` (future schema).  
- **Recommended fix:** Use explicit boolean columns instead of jsonb for known flags.  
- **Effort:** Schema design decision — no extra effort, just do it right.

**RISK-010: No staging environment configured**  
- **Why it matters:** The deploy workflow gate (`staging` environment with required reviewer) is referenced in the RUNBOOK but GitHub secrets and environment are not yet configured. Without this, deploys will silently skip.  
- **Where it appears:** `.github/workflows/deploy-staging.yml`, GitHub Settings.  
- **Recommended fix:** Configure GitHub Actions secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID), STAGING_HEALTH_URL variable, and `staging` environment with `ramialbanna` as reviewer.  
- **Effort:** 30 minutes.

**RISK-011: `buy_box_rules` has no versioning**  
- **Why it matters:** If a rule changes, there is no historical record of which rule version scored a given lead. This makes post-purchase attribution analysis impossible.  
- **Where it appears:** Future `tav.buy_box_rules` schema.  
- **Recommended fix:** Add a `version` integer column to `buy_box_rules`. Store `buy_box_rule_version` snapshot on the lead at score time.  
- **Effort:** Schema addition — 2 hours.

**RISK-012: Twilio SMS alert flooding risk**  
- **Why it matters:** Without rate limiting, a transient Supabase outage could send hundreds of SMS alerts.  
- **Where it appears:** Future `src/alerts/alerts.ts`.  
- **Recommended fix:** Per-alert-type deduplication window in KV (key = `alert:<type>:<source>`, TTL = 15 minutes).  
- **Effort:** 4 hours.

---

### Low

**RISK-013: CI deploys do not depend on CI verification**  
- **Why it matters:** The staging deploy workflow does not have `needs: [verify]` in the CI workflow. A push to main that fails CI can still be approved into staging.  
- **Where it appears:** `.github/workflows/deploy-staging.yml`.  
- **Recommended fix:** Add `needs: [verify]` to the deploy job once CI is consistently green.  
- **Effort:** 1 line change.

**RISK-014: Wrangler action version not pinned**  
- **Why it matters:** `cloudflare/wrangler-action@v3` (non-specific minor) will pick up any v3.x release, including breaking changes.  
- **Where it appears:** `.github/workflows/deploy-staging.yml`.  
- **Recommended fix:** Pin to a specific tag after verifying the current working version.  
- **Effort:** 5 minutes.

**RISK-015: CHANGELOG.md and CONTRIBUTING.md are missing**  
- **Why it matters:** Architecture.md references them as part of the repo layout. Their absence means the first `feat:` commit will not have a CHANGELOG to update.  
- **Where it appears:** Repo root (files do not exist).  
- **Recommended fix:** Add stub files before the first feature commit.  
- **Effort:** 30 minutes.

---

## 12. Detailed Executable Roadmap

---

### Phase 0 — Stabilize and Document Current System

**Goal:** Close all documentation and configuration gaps before a single line of application code is written. Every Phase 1+ developer (or Claude session) should be able to bootstrap a working local environment from the repo alone.

**Files to edit:**
- `docs/.dev.vars.example` — add all 15+ env vars
- `docs/PRODUCT_SPEC.md` — expand from placeholder to minimum viable spec
- `docs/SECURITY.md` — expand with threat model and secret management
- `.github/workflows/pr-review.yml` — add graceful skip if CLAUDE_CODE_OAUTH_TOKEN is absent
- `.github/workflows/deploy-staging.yml` — pin Wrangler action version

**Files to create:**
- `CHANGELOG.md` — stub
- `CONTRIBUTING.md` — stub pointing to CLAUDE.md
- `docs/adr/` — empty directory with `.gitkeep`

**Tasks:**
1. Update `docs/.dev.vars.example` with all required env vars from architecture.md §16.
2. Expand `docs/PRODUCT_SPEC.md` with: 4 regions, buyer role definition, MVP success metrics, non-goals.
3. Expand `docs/SECURITY.md` with: threat model table, secret rotation procedure, public/private endpoint list, planned RLS roles.
4. Create `CHANGELOG.md` stub.
5. Create `CONTRIBUTING.md` stub.
6. Create `docs/adr/` directory.
7. Fix `pr-review.yml` to skip gracefully when CLAUDE_CODE_OAUTH_TOKEN is absent.
8. Pin Wrangler action version in `deploy-staging.yml`.
9. Confirm GitHub secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) and STAGING_HEALTH_URL are configured.

**Acceptance criteria:**
- `docs/.dev.vars.example` contains every variable from architecture.md §16.
- CI is green.
- `CHANGELOG.md` and `CONTRIBUTING.md` exist.
- `docs/adr/` directory exists.

**Test commands:** `git push origin main` → CI green.

**Rollback:** Any change here is documentation only. `git revert` to previous commit.

---

### Phase 1 — Project Foundation and Worker Skeleton

**Goal:** `package.json`, TypeScript, Wrangler, and a working `GET /health` endpoint. CI runs lint + typecheck + Vitest on every push. The Worker can be deployed to Cloudflare.

**Files to create:**
- `package.json` — includes scripts: `lint`, `typecheck`, `test`, `test:int`, `build`, `deploy`, `dev`
- `tsconfig.json` — strict mode, Cloudflare Workers types
- `wrangler.toml` — Worker name, KV namespace binding, env separation (staging/production)
- `src/index.ts` — Worker entry with `GET /health`
- `src/types/env.ts` — Worker bindings type
- `src/types/domain.ts` — SourceName union, NormalizedListingInput type (with optional vin), four-concept types
- `vitest.config.ts` — Vitest configuration
- `test/.gitkeep` — empty test directory marker

**Dependencies to install:**
- `@cloudflare/workers-types`
- `wrangler` (devDependency)
- `zod`
- `vitest` (devDependency)
- `@supabase/supabase-js`
- `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`

**Tasks:**
1. Scaffold `package.json` with all scripts and dependencies.
2. Write `tsconfig.json` with strict mode and Cloudflare Workers lib.
3. Write `wrangler.toml` with TAV_KV binding and staging + production environments.
4. Write `src/index.ts` with `GET /health` returning `{ ok: true, service: "tav-enterprise", version: "0.1.0", timestamp }`.
5. Write `src/types/env.ts` with `Env` interface matching all Worker bindings.
6. Write `src/types/domain.ts` with `SourceName`, `NormalizedListingInput` (with optional `vin`), `ScoredLead`, `LeadStatus`.
7. Write `vitest.config.ts`.
8. Run verification loop: lint → typecheck → test → `wrangler dev` smoke.

**Acceptance criteria:**
- `npm run lint` exits 0.
- `npm run typecheck` exits 0.
- `npm test` exits 0 (no tests yet — that is expected).
- `npm run dev` starts the Worker locally.
- `curl http://localhost:8787/health` returns `{"ok":true,...}`.
- CI is green.

**Test commands:**
```bash
npm run lint
npm run typecheck
npm test -- --run
```

**Rollback:** Remove `package.json`, `tsconfig.json`, `wrangler.toml`, `src/` — restore to pre-Phase-1 state.

---

### Phase 2 — Database Schema Hardening

**Goal:** `supabase/schema.sql` defines all 13 tables, all required indexes, and 2 views (`v_active_inbox`, `v_source_health`). The TAV CI gate for `v_active_inbox` passes.

**Files to create:**
- `supabase/schema.sql` — full DDL
- `supabase/migrations/20260504000000_init_tav_schema.sql` — first migration (same as schema.sql)
- `supabase/seed.sql` — seed file with 3 representative `buy_box_rules` rows

**Files to edit:**
- `docs/architecture.md` — add explicit `freshness_flags` column definition (boolean columns, not jsonb), add `vin?` to NormalizedListingInput, add `buy_box_rule_version` to leads table

**Tasks:**
1. Write `supabase/schema.sql` with: schema `tav`, all 13 tables, all required indexes, `updated_at` triggers, `v_active_inbox` view, `v_source_health` view.
2. Replace `freshness_flags jsonb` with explicit boolean columns: `price_changed`, `description_changed`, `image_changed`, `buyer_marked_stale`, `buyer_marked_sold`, `source_no_longer_returns`.
3. Use `text[]` (not jsonb) for `reason_codes` on `tav.leads`.
4. Add `buy_box_rule_version` integer column to `tav.leads`.
5. Write `supabase/migrations/20260504000000_init_tav_schema.sql`.
6. Write `supabase/seed.sql` with 3 Toyota buy-box rules (Camry, Corolla, Tacoma — Texas region).
7. Run migration against a test Supabase project. Verify all tables and views exist.
8. Confirm TAV CI gate passes (`v_active_inbox` references `stale_confirmed` and `last_seen_at`).

**Acceptance criteria:**
- `psql -f supabase/schema.sql` applies cleanly.
- `SELECT * FROM tav.v_active_inbox` executes without error.
- CI TAV gates pass.
- All 13 tables and 2 views exist in the test Supabase project.

**Test commands:**
```bash
npm run typecheck
# Manual: apply schema to test Supabase project and verify tables
```

**Rollback:** `DROP SCHEMA tav CASCADE;` — apply to test project only.

---

### Phase 3 — Ingestion Run Tracking and Error Handling

**Goal:** `POST /ingest` accepts payloads, verifies HMAC, validates with Zod, writes `source_runs`, persists raw listings with retry + DLQ, and returns a structured response. Failures go to `dead_letters`. Nothing is silently dropped.

**Files to create:**
- `src/auth/hmac.ts` — HMAC-SHA256 verification over raw body
- `src/validate.ts` — Zod schema for wrapper (source, run_id, region, scraped_at, items) and per-item minimum validation
- `src/persistence/supabase.ts` — service-role client (Worker-only), export `getClient(env: Env)`
- `src/persistence/retry.ts` — 3-attempt exponential backoff wrapper
- `src/persistence/deadLetter.ts` — write to `tav.dead_letters`, fallback to KV
- `src/types/database.ts` — generated Supabase table types (or manually written for now)
- `test/fixtures/facebook/` — 10+ real-shaped Facebook payloads
- `test/ingest.test.ts` — unit tests for HMAC verification and Zod validation

**Files to edit:**
- `src/index.ts` — add `POST /ingest` handler that calls HMAC verify → Zod validate → batch loop → source_runs write → return response

**Tasks:**
1. Write `src/auth/hmac.ts` — verify `x-tav-signature: sha256=<sig>` against raw body using `WEBHOOK_HMAC_SECRET`.
2. Write `src/validate.ts` — wrapper Zod schema (source enum, items non-empty, run_id, region), per-item minimum (source + (url || sourceListingId) + title).
3. Write `src/persistence/supabase.ts` — create service-role client once per request using `env.SUPABASE_URL` and `env.SUPABASE_SERVICE_ROLE_KEY`.
4. Write `src/persistence/retry.ts` — generic retry wrapper: 3 attempts, 250/1000/4000ms backoff.
5. Write `src/persistence/deadLetter.ts` — write to `tav.dead_letters` with retry; on failure write to KV.
6. Add `POST /ingest` to `src/index.ts`: HMAC check (raw body), Zod validate wrapper, loop items, write `source_runs` row, persist each raw listing via retry, return structured response.
7. Add 10+ Facebook fixture files under `test/fixtures/facebook/`.
8. Write `test/ingest.test.ts` covering: valid HMAC, invalid HMAC returns 401, Zod wrapper failure, per-item rejection, happy path.
9. Run verification loop.

**Acceptance criteria:**
- `POST /ingest` with valid HMAC and Facebook payload returns `{"ok":true,"processed":N,...}`.
- `POST /ingest` with invalid HMAC returns 401.
- Invalid items produce rows in `tav.filtered_out` with reason codes.
- `tav.source_runs` row is written for every ingest call.
- `tav.raw_listings` rows are written for each valid item.
- DLQ row is written when Supabase is unreachable (test with invalid URL).
- `npm run lint` and `npm run typecheck` exit 0.
- All new unit tests pass.

**Test commands:**
```bash
npm run lint
npm run typecheck
npm test -- --run
npm run test:int
```

**Rollback:** Revert `src/index.ts` to health-only version. Remove Phase 3 source files.

---

### Phase 4 — Source-Agnostic Listing Model (Facebook Adapter + Normalization)

**Goal:** Facebook adapter produces `NormalizedListingInput` from raw payloads. Normalization utilities extract YMM, clean text, parse mileage/price. Normalized listings are persisted. Every rejected item has a reason code.

**Files to create:**
- `src/sources/facebook.ts` — VIN-tolerant Facebook adapter
- `src/sources/index.ts` — adapter registry (SourceName → adapter function)
- `src/normalize/cleanText.ts` — strip HTML, normalize whitespace, Unicode normalization
- `src/normalize/extractYmm.ts` — year/make/model extraction from title
- `src/normalize/mileage.ts` — mileage string parser ("82k miles", "82,000 mi", etc.)
- `src/scoring/reasonCodes.ts` — centralized reason-code constants
- `test/normalize.test.ts` — unit tests for all normalization utilities
- `test/fixtures/facebook/edge-cases/` — edge-case payloads (no title, Unicode, malformed mileage)

**Files to edit:**
- `src/index.ts` — add normalization step to ingest loop
- `src/persistence/supabase.ts` — add `upsertNormalizedListing` function

**Tasks:**
1. Write `src/scoring/reasonCodes.ts` with all constants from architecture.md §10.
2. Write `src/normalize/cleanText.ts`.
3. Write `src/normalize/mileage.ts` — handle "82k", "82,000", "82000", "82 miles", "82k mi".
4. Write `src/normalize/extractYmm.ts` — regex + known make/model list approach. Return `{year?, make?, model?, trim?}`. On failure, return `{reason: 'missing_ymm'}`.
5. Write `src/sources/facebook.ts` — adapter that calls normalization utilities, tolerates absent VIN, returns `NormalizedListingInput` or `{error: reason_code}`.
6. Write `src/sources/index.ts` — registry mapping `SourceName` to adapter.
7. Update `src/index.ts` ingest loop: for each raw item, call adapter → on error write to `filtered_out` → on success write to `normalized_listings`.
8. Write `test/normalize.test.ts` with 20+ test cases.
9. Run verification loop. Facebook fixtures must all pass.

**Acceptance criteria:**
- Facebook fixture with full YMM in title → normalized listing with correct year/make/model.
- Facebook fixture with no explicit YMM → `missing_ymm` in `filtered_out`.
- Facebook fixture with no VIN → normalized listing with `vin = null`, no error.
- All `reason_code` constants come from `src/scoring/reasonCodes.ts`.
- CI TAV gate: `src/sources/facebook.ts` does not contain `throw .*VIN|require.*vin|!vin`.
- `npm run lint`, `npm run typecheck`, `npm test -- --run` all exit 0.

**Test commands:**
```bash
npm run lint
npm run typecheck
npm test -- --run
npm run test:int
```

**Rollback:** Remove `src/sources/`, `src/normalize/`, revert `src/index.ts`.

---

### Phase 5 — Deduplication and Stale Listing Detection

**Goal:** Exact and fuzzy deduplication work. Identity keys are generated and consistent. Vehicle candidates are upserted. Stale scores are calculated and freshness statuses assigned. The TAV CI gate for `v_active_inbox` confirms stale_confirmed listings are excluded.

**Files to create:**
- `src/dedupe/identity.ts` — identity key generator (`year|make|model|trim|mileage_band|city|state`)
- `src/dedupe/exactDedupe.ts` — check source + source_listing_id and source + url against DB
- `src/dedupe/fuzzyDedupe.ts` — query `tav.vehicle_candidates` by identity key
- `src/stale/staleScore.ts` — 0–100 score calculation from freshness signals
- `src/stale/freshnessStatus.ts` — status derivation from score
- `test/dedupe.test.ts` — unit tests for all dedupe scenarios
- `test/staleScore.test.ts` — unit tests for all stale score signal combinations

**Files to edit:**
- `src/index.ts` — add dedupe + stale scoring steps to ingest loop
- `src/persistence/supabase.ts` — add `upsertVehicleCandidate`, `upsertDuplicateGroup`, `updateFreshnessStatus` functions

**Tasks:**
1. Write `src/dedupe/identity.ts` — mileage band at 5,000-mile intervals, city lowercased + state code.
2. Write `src/dedupe/exactDedupe.ts` — returns existing normalized_listing_id if found, else null.
3. Write `src/dedupe/fuzzyDedupe.ts` — queries vehicle_candidates by identity_key, returns candidate or null.
4. Write `src/stale/staleScore.ts` — implement all signals from architecture.md §7.
5. Write `src/stale/freshnessStatus.ts` — derive `FreshnessStatus` from stale score.
6. Update ingest loop: after normalization, run exact dedupe → if match, increment scrape_count, recalculate stale score, continue. If no match, run fuzzy dedupe, upsert vehicle_candidate, create normalized_listing.
7. Write `test/dedupe.test.ts` with all cases from architecture.md §6.
8. Write `test/staleScore.test.ts` with all signal combinations and boundary values.
9. Run verification loop.

**Acceptance criteria:**
- Exact duplicate ingest increments `scrape_count`, does not create duplicate normalized_listing.
- Fuzzy duplicate groups under same `vehicle_candidate_id` in `tav.duplicate_groups`.
- Stale score of 0 for a listing seen in last 24 hours with no aging signals.
- Stale score of 75+ → `freshness_status = stale_confirmed`.
- `v_active_inbox` excludes `stale_confirmed` listings.
- All new unit tests pass.

**Test commands:**
```bash
npm run lint
npm run typecheck
npm test -- --run
npm run test:int
```

**Rollback:** Remove `src/dedupe/`, `src/stale/`. Revert `src/index.ts` to Phase 4 state.

---

### Phase 6 — Scoring and Buy-Box Engine

**Goal:** Lead scoring formula calculates all 5 weighted components. Buy-box rules from `tav.buy_box_rules` are evaluated. Leads are created for listings that pass the gate (not stale_confirmed, not duplicate, score above threshold). Every scored listing has a grade and reason codes.

**Files to create:**
- `src/valuation/valuationTypes.ts` — ValuationResult type, confidence enum
- `src/valuation/valuationCache.ts` — KV cache read/write with TTL
- `src/valuation/manheim.ts` — OAuth2 token fetch + MMR lookup (VIN → YMM fallback)
- `src/scoring/buyBox.ts` — rule evaluation against buy_box_rules table
- `src/scoring/scoreLead.ts` — weighted final score calculation
- `test/scoring.test.ts` — unit tests for scoring formula and buy-box evaluation

**Files to edit:**
- `src/index.ts` — add valuation + scoring + lead creation to ingest loop
- `src/persistence/supabase.ts` — add `createLead`, `upsertValuationSnapshot`, `getBuyBoxRules`

**Tasks:**
1. Write `src/valuation/valuationTypes.ts` with `ValuationResult { mmrValue, method, confidence, fetched_at }`.
2. Write `src/valuation/valuationCache.ts` — KV get/set with keys from architecture.md §8.
3. Write `src/valuation/manheim.ts` — OAuth2 token (cached), VIN MMR call, YMM fallback. Never throws — returns `{ confidence: 'NONE', reason: 'mmr_failed' }` on any error.
4. Write `src/scoring/buyBox.ts` — load active rules from DB, evaluate each, return match boolean + matched rule ID.
5. Write `src/scoring/scoreLead.ts` — implement the 5-weight formula from architecture.md §10. Guard against zero-MMR division.
6. Update ingest loop: for each normalized listing that passes dedupe gate, call valuation → score → if `finalScore ≥ threshold AND freshness_status != stale_confirmed` → create lead.
7. Write `test/scoring.test.ts` covering: all 5 weight components, grade boundaries, zero-MMR guard, no-buy-box-rules case, excellent/good/fair/pass grade assignment.
8. Run verification loop.

**Acceptance criteria:**
- Lead is created for a Toyota Camry 2020 at 75% MMR with `grade = excellent`.
- No lead is created for `freshness_status = stale_confirmed`.
- `tav.v_active_inbox` returns the lead.
- `mmr_failed` reason code present when Manheim is unreachable (mock test).
- All scoring tests pass.
- Full MVP acceptance criteria from architecture.md §22 items 1–10 are satisfied.

**Test commands:**
```bash
npm run lint
npm run typecheck
npm test -- --run
npm run test:int
```

**Rollback:** Remove `src/valuation/`, `src/scoring/`. Revert `src/index.ts` to Phase 5 state.

---

### Phase 7 — Assignment and Workflow System

**Goal:** Leads can be assigned to buyers. Assignment is concurrency-safe. Lead actions are audited. Idle leads recycle back to the queue. Excellent leads escalate to priority queues after 15 minutes unclaimed.

**Files to create:**
- `src/assignment/assignLead.ts` — assignment algorithm (region → capacity → priority)
- `src/assignment/locking.ts` — lead locking with `lock_expires_at` + SELECT FOR UPDATE SKIP LOCKED
- `src/types/domain.ts` additions — `LeadStatus` (full enum from architecture.md §11)
- Worker route `POST /leads/:id/assign` and `POST /leads/:id/action`

**Tasks:**
1. Define buyer model (minimal: `buyer_id`, `name`, `region`, `max_active_leads`).
2. Write `src/assignment/locking.ts` — optimistic lock: UPDATE leads SET assigned_to = ?, assigned_at = now(), lock_expires_at = now() + 15min WHERE id = ? AND assigned_to IS NULL.
3. Write `src/assignment/assignLead.ts` — query unassigned leads by region + grade + score DESC, call locking.
4. Add `POST /leads/:id/action` — accepts `{action, actor, notes}`, writes to `tav.lead_actions`, updates `tav.leads.status`, validates state machine.
5. Add background check (Cloudflare Cron Trigger or manual call) for leads where `lock_expires_at < now()` — reset to unassigned.
6. Write integration tests for assignment and locking.

**Acceptance criteria:**
- Concurrent requests to assign the same lead result in exactly one success.
- Lead action `passed` transitions status to `passed`.
- Lead action `purchased` transitions status to `purchased`.
- Leads unclaimed for 15 minutes reappear in the unassigned queue.

**Test commands:**
```bash
npm run lint
npm run typecheck
npm test -- --run
npm run test:int
```

**Rollback:** Remove `src/assignment/`. Revert route additions in `src/index.ts`.

---

### Phase 8 — Purchase Outcome Feedback Loop

**Goal:** Purchase outcomes are captured with full attribution (buyer, source, region, purchase price, MMR at purchase, gross profit). The `tav.purchase_outcomes` table is queryable for buy-box learning.

**Files to create:**
- Worker route `POST /leads/:id/purchase-outcome`
- `src/persistence/supabase.ts` additions — `createPurchaseOutcome`, `getValuationAtAssignment`

**Tasks:**
1. Add `POST /leads/:id/purchase-outcome` — accepts `{ purchase_price, purchased_at }`, looks up MMR snapshot at assignment time, calculates gross profit, writes to `tav.purchase_outcomes`, transitions lead status to `purchased`.
2. Add `tav.v_buyer_performance` view — joins leads + lead_actions + purchase_outcomes, aggregates assigned, contacted, purchased, conversion rate, gross profit, time-to-contact per buyer.
3. Seed test purchase outcomes for end-to-end analytics testing.

**Acceptance criteria:**
- `POST /leads/:id/purchase-outcome` creates a row with correct gross_profit calculation.
- `tav.v_buyer_performance` returns sensible aggregates.
- Lead status transitions to `purchased`.

**Test commands:**
```bash
npm run lint
npm run typecheck
npm run test:int
```

**Rollback:** Remove purchase-outcome route. Drop `v_buyer_performance` view.

---

### Phase 9 — Observability and Admin Dashboard

**Goal:** Structured logging is in place. Source health and DLQ metrics are queryable. Alerts fire for critical conditions. An AppSheet or Next.js buyer inbox is functional.

**Files to create:**
- `src/alerts/alerts.ts` — alert dispatcher with KV-based rate limiting
- Worker route `GET /admin/source-health`
- Worker route `POST /admin/replay-dlq`
- `src/util/logger.ts` — structured JSON logger (sanitizes sensitive fields)

**Tasks:**
1. Write `src/util/logger.ts` — structured JSON output, strips `token`, `access_token`, `client_secret`, `password` fields.
2. Replace all `console.log` calls with `logger`.
3. Write `src/alerts/alerts.ts` — rate-limited webhook + optional Twilio SMS. KV key per alert type with 15-minute TTL.
4. Wire all 9 alert conditions from architecture.md §14.
5. Add `GET /admin/source-health` — queries `tav.v_source_health`, returns JSON.
6. Add `POST /admin/replay-dlq` — reads DLQ rows from `tav.dead_letters`, reprocesses each, returns `{replayed, failed}`.
7. Set up AppSheet or define Next.js buyer inbox (future).

**Acceptance criteria:**
- `GET /admin/source-health` returns latest run per source.
- `POST /admin/replay-dlq` successfully replays a dead-letter row.
- A Twilio SMS fires when no listings arrive for 30 minutes (test in staging).
- No secret values appear in any log output.

**Test commands:**
```bash
npm run lint
npm run typecheck
npm run test:int
```

**Rollback:** Disable alert wiring. Remove admin routes. Revert to `console.log`.

---

### Phase 10 — Test Coverage and Deployment Hardening

**Goal:** ≥ 20 unit tests pass (MVP requirement). Integration tests run against a dedicated test Supabase project in CI. Deployment is production-ready. README deployment instructions are complete.

**Files to edit:**
- `.github/workflows/ci.yml` — add `SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_ROLE_KEY` secrets, upgrade reason-code gate to `::error::`, add `needs: [verify]` to deploy
- `.github/workflows/deploy-staging.yml` — pin Wrangler version, add `needs: verify`
- `README.md` — update to reflect actual deployment steps
- `docs/RUNBOOK.md` — add application runbook sections (DLQ replay, source reprocess, stale recalc)

**Tasks:**
1. Add integration test CI secrets (test Supabase project).
2. Upgrade reason-code centralization CI gate from `::warning::` to `::error::`.
3. Add `needs: [verify]` to staging deploy job.
4. Pin Wrangler action to specific minor version.
5. Audit test count — confirm ≥ 20 unit tests cover normalize, stale, scoring, dedupe.
6. Write end-to-end integration test: full Facebook listing → v_active_inbox.
7. Update README with complete deployment steps and secrets checklist.
8. Add application runbook sections to RUNBOOK.md.
9. Do a production deploy dry-run with all Cloudflare secrets confirmed.
10. Smoke test: POST fixture Facebook payload against staging Worker, confirm lead appears in v_active_inbox.

**Acceptance criteria:**
- All 22 MVP acceptance criteria from architecture.md §22 are satisfied.
- ≥ 20 unit tests pass.
- CI is green with integration tests.
- Staging Worker is deployed and `/health` returns `{"ok":true}`.
- One real Facebook Apify payload produces a lead in `tav.v_active_inbox`.

**Test commands:**
```bash
npm run lint
npm run typecheck
npm test -- --run
npm run test:int
curl https://tav-aip-staging.workers.dev/health
```

**Rollback:** N/A — this is a hardening phase. Any individual change can be reverted without affecting functionality.

---

## 13. Concrete Implementation Tasks

---

```md
Task ID: T-001
Title: Fix .dev.vars.example — add all application secrets
Files: docs/.dev.vars.example
Objective: Every env var from architecture.md §16 must appear as a replace_me placeholder.
Steps:
  1. Read architecture.md §16.
  2. Replace the current .dev.vars.example content with all 15 vars, all set to replace_me.
  3. Preserve CLAUDE_CODE_OAUTH_TOKEN and CLAUDE_CODE_OAUTH_SCOPES.
  4. Add APP_ENV=replace_me and LOG_LEVEL=replace_me if confirmed needed.
Acceptance Criteria:
  - .dev.vars.example contains SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WEBHOOK_HMAC_SECRET,
    NORMALIZER_SECRET, MANHEIM_CLIENT_ID, MANHEIM_CLIENT_SECRET, MANHEIM_USERNAME,
    MANHEIM_PASSWORD, MANHEIM_TOKEN_URL, MANHEIM_MMR_URL, ALERT_WEBHOOK_URL,
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_TO_NUMBER — all replace_me.
  - CI secret scan still passes.
Test Command: git push origin main → CI green
Rollback: git revert HEAD
```

---

```md
Task ID: T-002
Title: Initialize Node project with package.json and tsconfig.json
Files: package.json, tsconfig.json
Objective: Establish the Cloudflare Worker TypeScript project so CI can run lint, typecheck, test.
Steps:
  1. Create package.json with name "tav-aip", scripts: dev, build, deploy, lint, typecheck, test, test:int.
  2. Install devDependencies: wrangler, typescript, @cloudflare/workers-types, vitest,
     @typescript-eslint/eslint-plugin, @typescript-eslint/parser, eslint.
  3. Install dependencies: zod, @supabase/supabase-js.
  4. Create tsconfig.json with strict: true, lib: [ES2022], target: ES2022, module: ESNext,
     moduleResolution: Bundler, types: [@cloudflare/workers-types].
  5. Create .eslintrc.json with @typescript-eslint/recommended rules.
  6. Run npm install. Commit package.json, package-lock.json, tsconfig.json.
Acceptance Criteria:
  - npm run lint exits 0 (no source files yet — expected pass).
  - npm run typecheck exits 0.
  - npm test -- --run exits 0.
  - CI is green.
Test Command: npm run lint && npm run typecheck && npm test -- --run
Rollback: git rm package.json package-lock.json tsconfig.json .eslintrc.json && git commit
```

---

```md
Task ID: T-003
Title: Create wrangler.toml with KV binding and environment separation
Files: wrangler.toml
Objective: Wrangler config for Worker name, KV binding (TAV_KV), staging and production environments.
Steps:
  1. Create wrangler.toml with: name = "tav-aip", main = "src/index.ts", compatibility_date = "2024-01-01".
  2. Add [[ kv_namespaces ]] block with binding = "TAV_KV" and placeholder id = "REPLACE_ME_STAGING_KV_ID".
  3. Add [env.staging] and [env.production] sections.
  4. Note: actual KV namespace IDs must be filled in after running `wrangler kv namespace create TAV_KV`.
Acceptance Criteria:
  - wrangler.toml is valid and `wrangler dev` starts without error.
  - No secrets appear in wrangler.toml.
Test Command: npx wrangler dev --dry-run
Rollback: git rm wrangler.toml && git commit
```

---

```md
Task ID: T-004
Title: Write Worker entry point with GET /health
Files: src/index.ts, src/types/env.ts, src/types/domain.ts
Objective: Minimal Worker that handles GET /health and returns 404 for all other routes.
Steps:
  1. Create src/types/env.ts with interface Env { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string;
     WEBHOOK_HMAC_SECRET: string; TAV_KV: KVNamespace; ... (all bindings) }.
  2. Create src/types/domain.ts with SourceName union, NormalizedListingInput (with vin?: string), ScoredLead, LeadStatus.
  3. Create src/index.ts with export default { async fetch(request, env) } pattern.
     Handle GET /health → { ok: true, service: "tav-enterprise", version: "0.1.0", timestamp: new Date().toISOString() }.
     Return 404 for all other routes.
  4. Run: npm run typecheck, npm run dev, curl http://localhost:8787/health.
Acceptance Criteria:
  - curl http://localhost:8787/health returns {"ok":true,"service":"tav-enterprise",...}.
  - npm run typecheck exits 0.
  - curl http://localhost:8787/anything-else returns 404.
Test Command: npm run typecheck && npm run dev (then curl in another terminal)
Rollback: git revert HEAD
```

---

```md
Task ID: T-005
Title: Write full Supabase schema DDL
Files: supabase/schema.sql, supabase/migrations/20260504000000_init_tav_schema.sql
Objective: All 13 tables, all required indexes, updated_at triggers, v_active_inbox, v_source_health.
Steps:
  1. Create supabase/ directory.
  2. Write supabase/schema.sql with: CREATE SCHEMA IF NOT EXISTS tav;
     All 13 tables with explicit boolean freshness flag columns (not jsonb).
     text[] for reason_codes on leads.
     updated_at DEFAULT now() on every mutable table, with UPDATE trigger.
     All indexes from architecture.md §12 plus: vehicle_candidates(identity_key), leads(assigned_to, status), lead_actions(lead_id, created_at DESC).
     v_active_inbox view: excludes freshness_status IN ('stale_confirmed', 'removed') AND last_seen_at > now() - INTERVAL '30 days'.
     v_source_health view: latest source_runs row per (source, region).
  3. Copy schema.sql to migrations/20260504000000_init_tav_schema.sql.
  4. Apply to test Supabase project and verify.
  5. Run: grep stale_confirmed supabase/schema.sql (CI gate check).
Acceptance Criteria:
  - Schema applies without error.
  - All 13 tables exist.
  - v_active_inbox query executes and references stale_confirmed and last_seen_at (CI gate passes).
  - All documented indexes exist.
Test Command: npm run typecheck && (manual: apply schema to test Supabase project)
Rollback: DROP SCHEMA tav CASCADE; (test project only)
```

---

```md
Task ID: T-006
Title: Write HMAC verification middleware
Files: src/auth/hmac.ts
Objective: HMAC-SHA256 verification of x-tav-signature header over raw request body.
Steps:
  1. Create src/auth/hmac.ts.
  2. Function signature: verifyHmac(rawBody: string, signature: string, secret: string): Promise<boolean>.
  3. Use Web Crypto API (available in Cloudflare Workers): crypto.subtle.importKey + crypto.subtle.sign.
  4. Expected format: "sha256=<hex_sig>".
  5. Constant-time comparison to avoid timing attacks (XOR comparison of ArrayBuffers).
  6. Write unit test: valid HMAC passes, invalid HMAC fails, missing header fails.
Acceptance Criteria:
  - verifyHmac returns true for correct HMAC.
  - verifyHmac returns false for tampered body.
  - verifyHmac returns false for wrong secret.
  - No timing attack surface (constant-time comparison).
Test Command: npm test -- --run
Rollback: git rm src/auth/hmac.ts
```

---

```md
Task ID: T-007
Title: Write Zod validation schemas for ingest wrapper and per-item validation
Files: src/validate.ts
Objective: Validate POST /ingest wrapper (source, run_id, region, items) and each item individually. Invalid items do not abort the batch.
Steps:
  1. Create src/validate.ts.
  2. IngestWrapperSchema: z.object({ source: z.enum(['facebook', ...]), run_id: z.string().optional(),
     region: z.string().optional(), scraped_at: z.string().datetime().optional(), items: z.array(z.unknown()).min(1) }).
  3. IngestItemSchema: z.object({ url: z.string().url().optional(), sourceListingId: z.string().optional(),
     title: z.string().min(1), ... }). At least url OR sourceListingId must be present.
  4. Refine: .refine(item => item.url || item.sourceListingId, { message: 'missing_id' }).
  5. Parse wrapper — on failure return 400. Parse each item individually — on failure add to rejected[], continue.
Acceptance Criteria:
  - Wrapper with missing source returns 400.
  - Wrapper with empty items array returns 400.
  - Item with no url AND no sourceListingId is rejected with reason_code missing_id.
  - Item with no title is rejected with reason_code missing_title.
  - Valid items in same batch as invalid items are processed normally.
Test Command: npm test -- --run
Rollback: git rm src/validate.ts
```

---

```md
Task ID: T-008
Title: Write persistence layer — Supabase client, retry, dead-letter
Files: src/persistence/supabase.ts, src/persistence/retry.ts, src/persistence/deadLetter.ts
Objective: Service-role Supabase client (Worker-only), 3-attempt retry wrapper, DLQ write with KV fallback.
Steps:
  1. src/persistence/supabase.ts: export function getClient(env: Env): SupabaseClient. Use createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).
  2. src/persistence/retry.ts: export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T>.
     Delays: 250ms, 1000ms, 4000ms. Throw on final failure.
  3. src/persistence/deadLetter.ts: export async function writeDLQ(env, payload, error). 
     Try: INSERT INTO tav.dead_letters. On failure: await env.TAV_KV.put(`dlq:${source}:${fingerprint}:${Date.now()}`, JSON.stringify({payload, error})).
Acceptance Criteria:
  - withRetry retries exactly 3 times and throws on final failure.
  - writeDLQ writes to dead_letters table when Supabase is reachable.
  - writeDLQ writes to KV when Supabase is unreachable.
Test Command: npm test -- --run && npm run test:int
Rollback: git rm src/persistence/
```

---

```md
Task ID: T-009
Title: Write Facebook source adapter
Files: src/sources/facebook.ts, src/sources/index.ts, test/fixtures/facebook/ (10 files)
Objective: Facebook adapter produces NormalizedListingInput from raw Apify payload. VIN is optional. YMM extracted from title when fields absent.
Steps:
  1. Create test/fixtures/facebook/ with 10 JSON payloads: standard listing, no VIN, missing year, missing mileage, Unicode title, price in text, seller URL formats, no image, minimal listing (title only), high-mileage listing.
  2. Write src/sources/facebook.ts:
     - Input: raw Apify item (unknown shape, Zod-parsed).
     - Extract: url, title, price (parse "$13,500" → 13500), mileage (parse "82,000 miles" → 82000), year/make/model/trim (from dedicated fields or from title via extractYmm), sellerName, sellerUrl, images, postedAt, scrapedAt.
     - VIN: extract if present in raw payload, otherwise null. Never required.
     - On success: return NormalizedListingInput.
     - On failure: return { error: ReasonCode }.
  3. Write src/sources/index.ts: export function getAdapter(source: SourceName).
  4. Write unit tests in test/fixtures using the 10 fixture files.
Acceptance Criteria:
  - All 10 fixture files parse correctly (or produce expected reason codes).
  - No VIN assumption — fixture with no VIN produces normalized listing with vin = null.
  - Facebook adapter throws no exceptions — all errors return { error: ReasonCode }.
  - CI TAV gate passes (no VIN-required patterns in facebook.ts).
Test Command: npm test -- --run
Rollback: git rm src/sources/ test/fixtures/facebook/
```

---

```md
Task ID: T-010
Title: Write normalization utilities (cleanText, extractYmm, mileage, price)
Files: src/normalize/cleanText.ts, src/normalize/extractYmm.ts, src/normalize/mileage.ts, src/normalize/price.ts, test/normalize.test.ts
Objective: Pure functions for text cleaning, YMM extraction from title, mileage/price string parsing. No I/O.
Steps:
  1. src/normalize/cleanText.ts: strip HTML, normalize Unicode (NFC), collapse whitespace, trim.
  2. src/normalize/mileage.ts: parse "82k", "82,000 mi", "82000 miles", "82000" → 82000 as number. Return null on unparseable.
  3. src/normalize/price.ts: parse "$13,500", "13500", "13.5k" → 13500. Return null on unparseable.
  4. src/normalize/extractYmm.ts: regex-based year detection (4-digit year 1990–2035), known make list (Toyota, Ford, Chevrolet, etc.), model extraction. Return { year?, make?, model?, trim? }. On total failure return null.
  5. Write test/normalize.test.ts with 20+ test cases covering: all mileage formats, all price formats, Unicode titles, YMM extraction from various title formats, extractYmm returning null on garbage input.
Acceptance Criteria:
  - mileage("82k miles") === 82000.
  - mileage("not a number") === null.
  - extractYmm("2021 Toyota Camry SE") === { year: 2021, make: "toyota", model: "camry", trim: "se" }.
  - extractYmm("great car for sale") === null (not an error throw).
  - All 20+ tests pass.
Test Command: npm test -- --run
Rollback: git rm src/normalize/
```

---

```md
Task ID: T-011
Title: Write reason codes module
Files: src/scoring/reasonCodes.ts
Objective: Centralized module for all reason-code string constants. No string literals elsewhere in src/.
Steps:
  1. Create src/scoring/reasonCodes.ts.
  2. Export all constants from architecture.md §10: MISSING_PRICE, MISSING_MILEAGE, MISSING_YMM, NO_VIN, MMR_FAILED, OVERPRICED, HIGH_MILEAGE, OUT_OF_REGION, STALE_SUSPECTED, STALE_CONFIRMED, BUY_BOX_MATCH, EXCELLENT_PRICE_TO_MMR, DUPLICATE.
  3. Also export: MISSING_TITLE, MISSING_ID, SCHEMA_DRIFT, MMR_NO_DATA, BATCH_OVERFLOW, INVALID_HMAC.
  4. Export type ReasonCode = typeof REASON_CODES[keyof typeof REASON_CODES].
Acceptance Criteria:
  - All reason codes are exported from src/scoring/reasonCodes.ts.
  - No reason-code string literals appear in any other src/ file (CI gate passes once this file exists).
Test Command: npm run typecheck
Rollback: git rm src/scoring/reasonCodes.ts
```

---

```md
Task ID: T-012
Title: Write identity key generator and exact/fuzzy deduplication
Files: src/dedupe/identity.ts, src/dedupe/exactDedupe.ts, src/dedupe/fuzzyDedupe.ts, test/dedupe.test.ts
Objective: Identity key = "year|make|model|trim_if_known|mileage_band|city|state". Exact dedupe checks DB. Fuzzy dedupe queries vehicle_candidates. Pure function tests for identity key.
Steps:
  1. src/dedupe/identity.ts: function generateIdentityKey(input: NormalizedListingInput): string.
     Mileage bands at 5,000-mile intervals (0, 5000, 10000...). Floor to band start.
     All values lowercased, spaces removed.
     Example: "2021|toyota|camry|se|55000|dallas|tx".
  2. src/dedupe/exactDedupe.ts: async function findExactDuplicate(client, source, sourceListingId?, url?): Promise<string | null>. Returns normalized_listing_id if found.
  3. src/dedupe/fuzzyDedupe.ts: async function findVehicleCandidate(client, identityKey): Promise<string | null>. Returns vehicle_candidate_id if found.
  4. test/dedupe.test.ts: unit tests for generateIdentityKey (all cases), plus integration tests for exact and fuzzy lookup.
Acceptance Criteria:
  - generateIdentityKey is a pure function — no I/O, deterministic.
  - Same car with mileage 57,000 and 58,000 → same band (55000) → same identity key.
  - Different region → different identity key.
  - All dedupe unit tests pass.
Test Command: npm test -- --run && npm run test:int
Rollback: git rm src/dedupe/
```

---

```md
Task ID: T-013
Title: Write stale score engine
Files: src/stale/staleScore.ts, src/stale/freshnessStatus.ts, test/staleScore.test.ts
Objective: Pure function that calculates 0–100 stale score from freshness signals. Derives FreshnessStatus from score.
Steps:
  1. src/stale/staleScore.ts: function calculateStaleScore(signals: StaleSignals): number.
     Implement all signal weights from architecture.md §7.
     Clamp result to 0–100.
  2. src/stale/freshnessStatus.ts: function deriveFreshnessStatus(score: number): FreshnessStatus.
     0–24 → 'active', 25–49 → 'aging', 50–74 → 'stale_suspected', 75–100 → 'stale_confirmed'.
  3. Define StaleSignals type: all boolean/number inputs to the scoring function.
  4. test/staleScore.test.ts: test every signal individually, test boundary values (24/25, 49/50, 74/75), test maximum signal combination, test newly-discovered listing gets low score.
Acceptance Criteria:
  - New listing (last 24h, no aging signals) → stale score ≤ 0 (clamped to 0).
  - freshness_status = 'active'.
  - All +30 first_seen > 14d + +20 unchanged 5 scrapes + ... = correct sum.
  - Score 75 → stale_confirmed.
  - All stale score tests pass.
Test Command: npm test -- --run
Rollback: git rm src/stale/
```

---

```md
Task ID: T-014
Title: Write Manheim MMR valuation adapter with KV cache
Files: src/valuation/valuationTypes.ts, src/valuation/valuationCache.ts, src/valuation/manheim.ts
Objective: OAuth2 token fetch, MMR lookup by VIN and by YMM. KV-cached. Never throws — returns confidence NONE on any error.
Steps:
  1. src/valuation/valuationTypes.ts: type ValuationResult, enum Confidence ('HIGH' | 'MEDIUM' | 'LOW' | 'NONE'), method ('vin' | 'ymm').
  2. src/valuation/valuationCache.ts: async function getCachedValuation(kv, key): Promise<ValuationResult | null>.
     async function cacheValuation(kv, key, value, ttlSeconds): Promise<void>.
     KV key formats from architecture.md §8.
  3. src/valuation/manheim.ts: async function getMMR(env, input: NormalizedListingInput): Promise<ValuationResult>.
     Try: cache hit → return. Miss: fetch token (KV cached) → call VIN endpoint if vin present → fallback YMM endpoint.
     On any error: return { confidence: 'NONE', mmrValue: null, method: null, reason: 'mmr_failed' }.
     Sanitize all log output (no token values).
  4. Add MANHEIM_MOCK env var check: if true, return mock MMR values (for CI/local dev).
Acceptance Criteria:
  - With MANHEIM_MOCK=true, getMMR returns fixed mock value without calling the API.
  - On Manheim API failure, returns confidence NONE and reason mmr_failed (never throws).
  - Token is not logged at any level.
  - KV cache is checked before making an API call.
Test Command: npm test -- --run (mock mode)
Rollback: git rm src/valuation/
```

---

```md
Task ID: T-015
Title: Write buy-box scoring engine
Files: src/scoring/buyBox.ts, src/scoring/scoreLead.ts, test/scoring.test.ts
Objective: Buy-box rule evaluation + weighted lead score formula. Returns ScoredLead with grade and reason codes.
Steps:
  1. src/scoring/buyBox.ts: async function evaluateBuyBox(client, listing: NormalizedListingInput, valuation: ValuationResult): Promise<{ match: boolean; score: number; matchedRuleId?: string }>.
     Load active rules from tav.buy_box_rules. Evaluate each rule. Return highest-priority match.
  2. src/scoring/scoreLead.ts: function scoreLead(listing, valuation, buyBoxResult, staleScore): ScoredLead.
     Implement 5 weights from architecture.md §10. Guard: if mmrValue is 0 or null, dealScore = 0.
     Assign grade: 85–100 excellent, 70–84 good, 55–69 fair, 0–54 pass.
     Collect all applicable reason codes.
  3. test/scoring.test.ts: test all 5 weight components, grade boundary values, zero-MMR guard,
     no-buy-box-rules case, excellent/good/fair/pass grade assignment, reason code accumulation.
Acceptance Criteria:
  - Toyota Camry 2020 at 75% MMR → grade excellent.
  - stale_confirmed listing → freshnessScore = 0 in score, finalScore ≤ pass.
  - Zero MMR → dealScore = 0, no division by zero.
  - No active buy-box rules → buyBoxScore = 0, no error.
  - All scoring tests pass.
Test Command: npm test -- --run
Rollback: git rm src/scoring/
```

---

```md
Task ID: T-016
Title: Wire full ingest pipeline in src/index.ts
Files: src/index.ts
Objective: POST /ingest runs the complete pipeline: HMAC → Zod → source_run → raw persist → adapter → normalize → dedupe → stale → valuation → score → lead gate → lead create. Returns structured response.
Steps:
  1. Refactor src/index.ts to extract pipeline steps into well-named functions.
  2. Ingest handler flow:
     a. Read raw body as text.
     b. Verify HMAC (return 401 if fails).
     c. Parse wrapper with Zod (return 400 if fails).
     d. Write source_runs row.
     e. For each item: Zod item validation → adapter → normalization → exact dedupe (if match: update last_seen_at + stale score) → fuzzy dedupe/candidate upsert → stale score → valuation → lead score → lead gate → lead create or filtered_out.
     f. Wrap all Supabase writes in withRetry. On final failure: writeDLQ.
     g. Return: { ok, source, run_id, processed, rejected, created_leads, duplicates, stale_suppressed }.
  3. Ensure every item rejection writes to tav.filtered_out with reason_code.
  4. Run integration test: POST real Facebook fixture → confirm rows in raw_listings, normalized_listings, vehicle_candidates, leads, v_active_inbox.
Acceptance Criteria:
  - Full MVP acceptance criteria 1–10 from architecture.md §22 are satisfied.
  - POST with valid Facebook fixture → lead in v_active_inbox.
  - POST with stale_confirmed listing → no lead created, row in filtered_out with stale_confirmed reason.
  - POST with invalid HMAC → 401, nothing written.
Test Command: npm run lint && npm run typecheck && npm test -- --run && npm run test:int
Rollback: Revert src/index.ts to previous state. All other src/ modules remain intact.
```

---

## 14. Recommended Target Architecture

This section describes the future-state system once the MVP is proven and the platform begins scaling toward 100+ buyers and multiple sources.

---

### 14.1 Source Adapters Layer

**Current:** One adapter pattern documented (`src/sources/facebook.ts`). Nothing implemented.

**Target:** A registry-based adapter system where every source conforms to a single contract.

```
src/sources/
  index.ts              ← registry: SourceName → AdapterFn
  facebook.ts           ← VIN-tolerant; YMM from title
  craigslist.ts         ← stable post_id; YMM from title
  autotrader.ts         ← VIN-bearing; structured YMM
  carsCom.ts            ← VIN-bearing; structured YMM
  offerup.ts            ← VIN-tolerant; YMM from title
```

**Adapter contract:**
```ts
type AdapterResult =
  | { ok: true; listing: NormalizedListingInput }
  | { ok: false; reason: ReasonCode; details?: unknown };

type SourceAdapter = (rawItem: unknown, context: IngestionContext) => AdapterResult;
```

**Design rule:** Zero source-specific code outside `src/sources/<platform>.ts`. The adapter is the isolation boundary. All shared normalization logic lives in `src/normalize/`.

**Adding a new source:** Create one file, add to registry, add fixtures, add unit tests. Nothing else changes.

---

### 14.2 Canonical Listing Model

**Current:** `NormalizedListingInput` is documented as a TypeScript type. Not yet implemented.

**Target:** A strict, versioned internal representation that every source adapter produces. The schema is the contract between sources and the rest of the pipeline.

**Key design decisions for the canonical model:**
- `vin?: string` — always optional; Facebook will be null.
- `identity_key: string` — computed deterministically at normalization time, not at query time.
- `source_listing_id: string | null` — null only for sources without stable IDs (rare).
- `freshness_status: FreshnessStatus` — carried forward from the normalized listing, recalculated on each re-ingest.
- `price?: number` — normalized to integer cents or dollars (pick one, document it).
- `mileage?: number` — integer miles.
- `year?: number` — 4-digit integer, validated 1990–2035.

**Versioning:** When `NormalizedListingInput` changes shape, it is a contract change. Requires an ADR under `docs/adr/`. Existing normalized listings may need a migration or a backfill.

---

### 14.3 Dedupe Service

**Current:** Documented strategy for exact + fuzzy dedupe. Not implemented.

**Target:** A stateless service module (no I/O hidden inside) that:
1. Generates a deterministic `identity_key` from normalized input (pure function).
2. Queries the database for exact duplicates (source + id, source + url).
3. Queries the database for fuzzy candidates (identity_key match in `tav.vehicle_candidates`).
4. Returns a `DedupeResult` — never merges permanently.

```ts
type DedupeResult =
  | { type: 'exact_duplicate'; normalizedListingId: string }
  | { type: 'fuzzy_group'; vehicleCandidateId: string; confidence: number }
  | { type: 'new_listing' };
```

**Permanent merge is forbidden.** Two listings that are likely the same physical car are grouped via `tav.duplicate_groups` with a confidence score. They are never collapsed into one row. This allows the grouping to be wrong without corrupting the source record.

**Cross-source dedupe:** When a car appears on both Facebook and Craigslist, the vehicle_candidate links both normalized listings. The lead points to the vehicle_candidate, not to a single listing.

---

### 14.4 Stale Detection Service

**Current:** Stale score formula documented. Not implemented.

**Target:** A recalculable service that can run at ingest time AND as a background job.

```
Stale Detection Inputs:
  - first_seen_at, last_seen_at, scrape_count
  - freshness flags (price_changed, description_changed, etc.)
  - buyer feedback (marked_stale, marked_sold, no_response)
  - source no longer returning the URL

Stale Detection Outputs:
  - stale_score: 0–100
  - freshness_status: new | active | aging | stale_suspected | stale_confirmed | removed
  - stale_reason_codes: string[]
```

**Background recalculation:** At scale, a Cloudflare Cron Trigger (or a scheduled Apify job) calls `GET /admin/recalculate-stale?region=dallas_tx` to recalculate stale scores for all active listings in a region that have not been re-scraped in N days. This prevents listings from staying `active` forever just because Apify stopped returning them.

**Buyer feedback integration (Phase 7+):** When a buyer marks a lead as "stale" or "already sold," that signal is written to `tav.lead_actions` and immediately updates the normalized listing's stale flags, triggering a stale score recalculation.

---

### 14.5 Scoring Engine

**Current:** 5-weight formula documented. Not implemented. Buy-box is rule-based (correct — no ML yet).

**Target:** A two-layer scoring system:

**Layer 1 — Rule-based buy-box evaluation:**
- Reads `tav.buy_box_rules` (loaded at Worker startup, cached in memory for 5 minutes).
- Returns `{ match: boolean; matchedRuleId: string | null; buyBoxScore: number }`.
- Rules have priority — higher priority rules evaluated first, first match wins.

**Layer 2 — Weighted lead score:**
```
dealScore       = price / mmr (lower is better) — 35%
buyBoxScore     = buy-box rule match + priority — 25%
freshnessScore  = derived from stale score — 20%
regionScore     = buyer's target region match — 10%
sourceScore     = source confidence (VIN present? structured data?) — 10%
```

**Future ML layer (post-2026 purchase data):**
- After 6–12 months of `tav.purchase_outcomes`, derive buy-box rules from actual gross profit by YMM + region + price-to-MMR band.
- The rule format stays the same. The source of the rule values changes from manual → data-derived.
- No change to the scoring engine code — only the rules table is updated.

**Score stability:** Lead scores should be recalculated when valuation is refreshed OR when stale status changes. The score at lead creation is recorded in `tav.leads`. Score history can be tracked via `tav.lead_actions` if needed.

---

### 14.6 Assignment Workflow

**Current:** Assignment algorithm described. Not implemented.

**Target:** A state-machine-based lead workflow with explicit transitions.

```
Lead State Machine:

new ──────────────────► assigned ──► claimed ──► contacted ──► negotiating
 │                           │                                      │
 │                      (recycle)                              purchased / passed
 │                                                                   │
 └─────────────────────────────────────────────────────────────► archived
                                                                     │
                         stale / duplicate ───────────────────────────┘
```

**State transitions:**
- `new → assigned`: system assigns to buyer based on region/capacity/priority.
- `assigned → claimed`: buyer explicitly opens the lead.
- `claimed → contacted`: buyer logs first contact attempt.
- `contacted → negotiating`: buyer confirms active negotiation.
- `negotiating → purchased`: buyer logs successful purchase.
- `negotiating → passed`: buyer passes (price, condition, competition, etc.).
- `assigned → new` (recycled): `lock_expires_at` expires, no action taken.
- Any state → `stale`: source confirms listing removed OR stale score crosses threshold.
- Any state → `duplicate`: cross-source dedupe identifies this as a duplicate lead.

**Concurrency:** Lead claiming uses `SELECT ... FOR UPDATE SKIP LOCKED` to prevent double-assignment. Only one buyer can hold a lock on a lead at a time.

**Escalation:** Excellent-grade leads unclaimed for 15 minutes → manager alert. Leads with no action for 2 hours → recycled to national queue.

---

### 14.7 Purchase Outcome Feedback

**Current:** `tav.purchase_outcomes` table designed. Not implemented.

**Target:** A closed-loop attribution system.

Every purchase is attributable to:
- Which lead triggered it.
- Which source the listing came from.
- Which buyer made the purchase.
- Which buy-box rule(s) the lead matched.
- What the price-to-MMR ratio was at the time of purchase.
- What the actual gross profit was (purchase price vs. sale price, added later).

**Buy-box learning:**
After 100+ purchase outcomes exist, run SQL analytics to identify which rule parameters correlate with positive outcomes (purchases at high gross profit). Update `tav.buy_box_rules` to reflect the learned weights. This is still rule-based — the rules are data-informed, not ML-derived.

```sql
-- Example: top-performing price-to-MMR bands by make/model
SELECT
  nl.year, nl.make, nl.model,
  vs.mmr_value,
  po.purchase_price,
  ROUND(po.purchase_price / vs.mmr_value, 2) AS price_to_mmr,
  AVG(po.gross_profit) AS avg_gross,
  COUNT(*) AS purchases
FROM tav.purchase_outcomes po
JOIN tav.leads l ON po.lead_id = l.id
JOIN tav.normalized_listings nl ON l.normalized_listing_id = nl.id
JOIN tav.valuation_snapshots vs ON vs.normalized_listing_id = nl.id
WHERE po.purchased_at >= NOW() - INTERVAL '6 months'
GROUP BY nl.year, nl.make, nl.model, ROUND(po.purchase_price / vs.mmr_value, 2)
ORDER BY avg_gross DESC;
```

---

### 14.8 Admin Dashboard

**Current:** No dashboard. AppSheet/Sheets suggested as temporary surface.

**Target (two phases):**

**Phase A — AppSheet / Sheets (v1):**
- Direct read-only connection to Supabase using a restricted `viewer` role key (not service role).
- Views: `tav.v_active_inbox`, `tav.v_source_health`.
- No writes from AppSheet — all mutations via the Worker API.
- This is sufficient for validating lead quality before building a full dashboard.

**Phase B — Next.js Dashboard (v2):**
```
Dashboard stack:
  Next.js 14 (App Router)
  Supabase Auth (email + magic link)
  Supabase RLS (buyer | manager | admin roles)
  Tailwind CSS
  Deployed to Vercel or Cloudflare Pages
```

**Dashboard views:**
- Buyer Inbox: v_active_inbox filtered by assigned_to = current buyer.
- Lead Detail: listing info, MMR, score, stale signals, history.
- Source Health: v_source_health — last run per source/region, item counts, error rates.
- Manager View: all leads, all buyers, assignment queue, escalations.
- Analytics: purchase outcomes, buyer performance, source performance, buy-box efficacy.

**Security requirement:** Dashboard uses Supabase Auth + anon key + RLS. The service role key is never exposed to the dashboard. RLS policies enforce row-level data isolation per buyer role.

---

### 14.9 Analytics Layer

**Current:** No analytics. Data model supports it.

**Target:** SQL-first analytics built on top of the existing data model.

**Required views (Phase 8+):**
- `tav.v_buyer_performance` — assigned, contacted, purchased, conversion rate, avg gross, time-to-contact per buyer per period.
- `tav.v_source_performance` — listings per source, reject rate, stale rate, lead rate, purchase rate, avg score per source.
- `tav.v_buybox_efficacy` — for each buy-box rule: matched leads, leads purchased, avg gross, price-to-MMR correlation.
- `tav.v_stale_by_region` — stale rate per region per source over time.

**Reporting cadence:**
- Daily: source health email/Slack (listings ingested, reject rate, new leads created).
- Weekly: buyer performance report (leads worked, contacts made, purchases, gross).
- Monthly: buy-box rule efficacy report (which rules are driving purchases).

**Long-term:** Once `tav.purchase_outcomes` has 6 months of data, run the buy-box learning query above and adjust rules. This is the buy-box feedback loop.

---

### 14.10 Architecture Evolution Principles

These principles should guide every architectural decision as the system grows:

1. **The four-concept rule is permanent.** Raw / Normalized / Vehicle Candidate / Lead are distinct forever. Any proposal to collapse two of them requires an ADR and explicit sign-off.

2. **One Worker until the Worker is the bottleneck.** Do not split into microservices because it feels cleaner. Split when a specific deploy, CPU, or memory constraint forces it.

3. **Rule-based scoring until 2026 purchase data exists.** ML buy-box requires labeled outcomes. There are none yet. Do not build ML infrastructure before data exists.

4. **Buyer dashboard after lead quality is proven.** Do not spend 3 months on a Next.js dashboard before confirming that the leads are worth working. AppSheet + a spreadsheet is a valid v1 operator surface.

5. **Source adapters are cheap to add.** Each new source is one file, a fixture set, and a unit test. The pattern is designed to make this a 1-day task per source.

6. **Stale detection is core, not optional.** Every proposal to skip or defer stale detection gets rejected. The business problem (buyers wasting time on sold cars) is solved by stale detection, not by building more features.

7. **Horizontal scale at the database, not the Worker.** The Cloudflare Worker scales automatically. The bottleneck will be Supabase connection count and query performance. Index design, connection pooling (pgBouncer), and read replicas are the scale levers.

---

## 15. Immediate Next 5 Actions

These are the five actions to take before any code is written. They are ordered by dependency.

---

### Action 1: Fix `.dev.vars.example` (30 minutes)

**What:** Add every env var from `docs/architecture.md §16` to `docs/.dev.vars.example` as `replace_me` placeholders.

**Why it matters:** Without this, no developer (or Claude session) can set up a working local environment. This is a prerequisite for every subsequent action.

**Command:**
```bash
# Edit docs/.dev.vars.example to include all 15 vars from architecture.md §16
# Then push and confirm CI is green.
git push origin main
```

---

### Action 2: Configure GitHub Actions secrets and staging environment (30 minutes)

**What:** In `ramialbanna/TAV-VAIP` GitHub Settings:
1. Add repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLAUDE_CODE_OAUTH_TOKEN`.
2. Add repository variable: `STAGING_HEALTH_URL=https://tav-aip-staging.workers.dev/health`.
3. Create `staging` environment with required reviewer (`ramialbanna`).

**Why it matters:** Until this is done, the staging deploy workflow silently skips every time. The Claude PR review workflow fails on every PR. CI is technically green but not fully enforcing anything.

**Verification:**
```bash
gh run list --workflow=deploy-staging.yml
# Confirm the last run shows "staging" environment gate triggered
```

---

### Action 3: Initialize Node project and Worker skeleton (Phase 1, 2–3 hours)

**What:** Create `package.json`, `tsconfig.json`, `wrangler.toml`, `src/index.ts` (health endpoint only), `src/types/env.ts`, `src/types/domain.ts`.

**Why it matters:** CI cannot run lint, typecheck, or tests without `package.json`. Nothing can be deployed without `wrangler.toml`. This is the foundation that every other task depends on.

**Execute:**
```bash
# Delegate to implementer subagent with Phase 1 task list (Tasks T-002, T-003, T-004)
# Run verification loop after each file
npm run lint && npm run typecheck
curl http://localhost:8787/health
```

---

### Action 4: Write Supabase schema DDL (Phase 2, 1–2 days)

**What:** Create `supabase/schema.sql` and `supabase/migrations/20260504000000_init_tav_schema.sql` with all 13 tables, all required indexes, `updated_at` triggers, `v_active_inbox`, and `v_source_health`.

**Why it matters:** Without the schema, no integration tests can run, no data can be persisted, and the pipeline cannot be tested end-to-end. This is the second foundational dependency.

**Critical design decision needed before writing the schema:**

> **Do you want `freshness_flags` as explicit boolean columns or a jsonb bag?**
>
> This plan recommends explicit boolean columns (`price_changed`, `description_changed`, `image_changed`, `buyer_marked_stale`, `buyer_marked_sold`, `source_no_longer_returns`). This is queryable, indexable, and type-safe.
>
> If the set of flags needs to be extensible without migrations, jsonb is acceptable — but it cannot be indexed column-by-column and requires `->>`-style queries everywhere.
>
> **Recommendation: explicit boolean columns.** The flag set is small and well-defined. Use jsonb only if you expect runtime-defined flags.

**Execute:**
```bash
# Delegate to data-modeler subagent with Task T-005
# Apply to test Supabase project and verify
```

---

### Action 5: Write HMAC verification and the POST /ingest skeleton (Phase 3, 1 day)

**What:** `src/auth/hmac.ts`, `src/validate.ts`, `src/persistence/supabase.ts`, `src/persistence/retry.ts`, `src/persistence/deadLetter.ts`. Wire `POST /ingest` in `src/index.ts` to: verify HMAC → Zod validate → write `source_runs` → persist raw listing.

**Why it matters:** This is the first user-visible feature of the system — a working ingest endpoint that does not lose data and does not accept unauthenticated payloads. All subsequent phases build on this.

**Verification:**
```bash
# Post a real Facebook Apify fixture payload to the local Worker
curl -X POST http://localhost:8787/ingest \
  -H "Content-Type: application/json" \
  -H "x-tav-signature: sha256=$(echo -n '...' | openssl dgst -sha256 -hmac 'test-secret' | cut -d' ' -f2)" \
  -d @test/fixtures/facebook/standard.json

# Confirm tav.raw_listings has a row
# Confirm tav.source_runs has a row
# Confirm invalid HMAC returns 401
```

---

### Biggest Architectural Decision Needed

**Question: Should the Worker process listings synchronously (current plan) or push to a queue for async processing?**

**Option A — Synchronous processing (current plan):**
- Every item in the ingest payload is fully normalized, deduped, scored, and written before the Worker returns a response.
- Pros: Simple. No queue infrastructure. Directly observable.
- Cons: Large payloads (500 items) take significant CPU time. Cloudflare Worker has a 30-second CPU limit. At 500 items × ~50ms per item = 25 seconds — right at the limit.
- **Recommendation for MVP:** This is fine. Cap batch at 200 items. At 1,000 listings/day, CPU limits are not hit.

**Option B — Async processing via queue:**
- Worker writes raw listings to a queue (Cloudflare Queues or a Supabase-backed job table). A separate Consumer Worker processes each item asynchronously.
- Pros: No CPU time limit pressure. Better observability per item. Backpressure built-in.
- Cons: More infrastructure. Two Workers to deploy. Queue consumer adds latency.
- **Recommendation for scale (>10,000 listings/day):** Switch to this pattern when synchronous processing reliably takes >20 seconds per call.

**Decision:** Build synchronous first with a 200-item cap. Design the persistence layer so the processing loop can be extracted into a Consumer Worker later with minimal refactoring (the loop body becomes the Consumer handler). Do not build Queues infrastructure now.

---

### What Should Not Be Built Yet

| Do Not Build Yet | Reason |
|---|---|
| ML buy-box scoring | No purchase outcome data exists. Rule-based is the correct approach until mid-2026. |
| Next.js dashboard | Lead quality is not proven. AppSheet + v_active_inbox is sufficient for v1 operator workflow. |
| Microservices / separate Workers | One Worker handles all routes. Split only when deploy or CPU constraints force it. |
| Complex RLS policies | No dashboard exists. Service role key is correct for v1. RLS is required before issuing any non-service-role database key. |
| Image similarity / computer vision for dedupe | YMM + mileage + region + seller URL is sufficient for v1 dedupe. Image hashing adds complexity without proven incremental accuracy. |
| Craigslist / AutoTrader / Cars.com adapters | Facebook adapter first. Add other sources only after Facebook is proven end-to-end. |
| Public-facing product, billing, multi-tenancy | This is an internal operations platform. No SaaS features until the internal use case is validated. |
| Cloudflare Queues or async processing | Synchronous Worker is sufficient for MVP volume. Queue infrastructure adds complexity without benefit at current scale. |

---

### What Must Be Fixed Before Scaling

These items are prerequisites for any meaningful scale increase. Do not accept more than 5,000 listings/day without addressing all of them.

1. **`CONCURRENTLY` index on `(source, source_listing_id)`** — exact-dedupe lookup runs on every item. Without this index, it is a full table scan at scale. (Tracked in `docs/followups.md`.)

2. **Single-flight protection on Manheim token refresh** — at 50+ concurrent items, the token can expire mid-batch, causing 50 simultaneous refresh requests. (Tracked in `docs/followups.md`.)

3. **Batch size cap with overflow DLQ** — the Worker must reject batches over the cap (200 items) with a 422 response and a reason, not process them silently until CPU timeout.

4. **Supabase connection pooling** — at high concurrency, Cloudflare Workers create many Supabase REST connections. Configure pgBouncer (Supabase Pro) before hitting 50+ concurrent Worker invocations.

5. **Alert rate limiting** — without per-alert-type deduplication in KV, a transient outage triggers hundreds of SMS messages. This is a billing and reliability risk.

6. **Lead assignment locking** — the `SELECT ... FOR UPDATE SKIP LOCKED` pattern must be in place before the first buyer uses the system. Without it, two buyers can claim the same lead simultaneously.

7. **DLQ replay mechanism** — the dead-letter queue is useless without a replay endpoint. Items in the DLQ represent real listings that could be leads. They must be replayable before the first production run.

---

*End of ENGINEERING_REVIEW_AND_EXECUTION_PLAN.md*

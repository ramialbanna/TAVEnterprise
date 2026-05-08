# Session Handoff — 2026-05-08

## Branch and latest commit

- **Branch:** `main` (all phase work merged directly; no feature branch)
- **Latest committed:** `1ce0579` — "Document Manheim UAT validation plan"
- **Working tree:** 6 files modified, **not yet committed** (see section below)

---

## Verification status (as of end of session)

```
npm run lint      → 8 warnings, 0 errors  (same pre-existing baseline as start of session)
npm run typecheck → clean
npm test          → 646/646 pass, 49 test files
npm run test:int  → not run (no schema/persistence files changed after last int-test run)
```

---

## Phases completed today

### G.4 — Structured valuation foundation
- Added `ValuationMethod` type and `valuationMethod` field to `ValuationResult` in `src/types/domain.ts`
- Removed the stale `method` / `mapConfidence` pattern from `valuationSnapshots.ts`
- Updated `schema.sql` and applied migration to add `valuation_method` column to `tav.valuation_snapshots`
- Added `writeValuationSnapshot` unit test suite (`src/persistence/__tests__/valuationSnapshots.test.ts`, 8 tests)
- Commits: `786b732`, `7156646`

### G.5.1 — `MANHEIM_LOOKUP_MODE` feature flag
- Added `getValuationLookupMode(env)` helper; flag defaults to `"direct"` in all wrangler.toml env blocks
- Commits: included in `786b732`

### G.5.2 — `MANHEIM_LOOKUP_MODE="worker"` wiring
- `src/valuation/workerClient.ts`: `getMmrValueFromWorker()` with 5 s timeout, `WorkerTimeoutError` / `WorkerRateLimitError` / `WorkerUnavailableError`
- `src/ingest/handleIngest.ts`: branches on lookup mode; worker errors are non-blocking
- Intelligence worker routes: `x-tav-service-secret` service-identity bypass
- 13 workerClient tests added
- Commits: `ce2c9bf`

### G.5.3 — Manheim reference normalization
- Migrations `0038` (4 reference/alias tables, vehicle_enrichments CHECK extensions, seed data) and `0039` (4 nullable normalization columns on `valuation_snapshots`) — applied to remote
- `src/valuation/normalizeMmrParams.ts` — pure normalizer with `NormalizationConfidence` type
- `src/valuation/loadMmrReferenceData.ts` — DB loader with 60-min module-level TTL cache
- `workerClient.ts` YMM path: loads reference data, normalizes, degrades confidence to `"low"` on partial/none, attaches metadata; VIN path unchanged
- `ValuationResult` extended with `lookupMake?`, `lookupModel?`, `lookupTrim?`, `normalizationConfidence?`
- `src/persistence/vehicleEnrichments.ts` — new persistence helper
- `handleIngest.ts`: conditional `writeVehicleEnrichment` for YMM+worker+vcId path
- Full test coverage added for all new modules
- Commits: `cafbfd7`

### G.5.4 — UAT validation plan (document only, no code)
- `docs/manheim-uat-validation-plan.md` — full staging validation plan covering OAuth, VIN/YMM test matrix, response shape, distribution fields, rate-limit path, worker-mode sequence, smoke checklist, logging events, rollback, pass/fail criteria, code/config gaps
- Commits: `1ce0579`

---

## Current in-progress work (NOT yet committed)

### Readiness cleanup — 6 files modified

These changes are complete and verified but not committed:

| File | Change |
|---|---|
| `workers/tav-intelligence-worker/src/types/env.ts` | Added optional `MANHEIM_GRANT_TYPE?: string` with doc comments explaining password vs client_credentials |
| `workers/tav-intelligence-worker/src/clients/manheimHttp.ts` | `fetchAndStoreToken` branches on `MANHEIM_GRANT_TYPE`; `client_credentials` omits username/password from token body; `manheim.token.refresh_started` log now includes `grant_type` field |
| `workers/tav-intelligence-worker/src/clients/__tests__/manheimHttp.test.ts` | Added `initOfCall` helper + 3 new tests (tests 18–20): client_credentials body, explicit password body, undefined-defaults-to-password |
| `src/valuation/workerClient.ts` | Added `log` import from `../logging/logger`; emits `ingest.mmr_worker_called { endpoint, method, vin_present }` before every worker fetch |
| `docs/followups.md` | Marked 4 completed items done; updated MANHEIM_LOOKUP_MODE prereqs with UAT plan link, grant-type blocker, updated production secrets list |
| `docs/RUNBOOK.md` | Added "Intelligence Worker Staging Readiness" section |

To commit:
```
git add docs/RUNBOOK.md docs/followups.md src/valuation/workerClient.ts \
  workers/tav-intelligence-worker/src/clients/__tests__/manheimHttp.test.ts \
  workers/tav-intelligence-worker/src/clients/manheimHttp.ts \
  workers/tav-intelligence-worker/src/types/env.ts
git commit -m "feat: readiness cleanup — MANHEIM_GRANT_TYPE support, worker call logging, doc updates"
```

---

## What has been committed vs not committed

### Committed (on `main`, pushed to `origin/main`)
- All G.4, G.5.1, G.5.2, G.5.3 implementation (commits `786b732`–`cafbfd7`)
- G.5.4 UAT plan (`1ce0579`)
- All schema migrations through `0039` applied to remote Supabase

### Not committed (working tree — verified clean, ready to commit)
- `MANHEIM_GRANT_TYPE` intelligence worker support (env, auth branching, 3 tests)
- `ingest.mmr_worker_called` log event in `workerClient.ts`
- `docs/followups.md` cleanup and prereqs update
- `docs/RUNBOOK.md` intelligence worker staging section
- `docs/session-handoff-2026-05-08.md` (this file)

---

## Known Manheim/Cox blockers — waiting on vendor response

These cannot be resolved by code. Do not attempt workarounds. Do not call live APIs until all are confirmed.

| Blocker | Impact |
|---|---|
| **Grant type unknown** — password grant or client_credentials? | Cannot provision Manheim secrets correctly. MANHEIM_USERNAME/MANHEIM_PASSWORD only needed for password grant. |
| **UAT base URLs unconfirmed** | `.dev.vars.example` has assumed URLs (`uat.api.manheim.com`). May differ per provisioned package. |
| **YMM endpoint returns 596** | `GET /valuations/search` is not provisioned on the current account. No code fix. Contact rep to enable. |
| **No UAT test VINs provided** | Cannot run V-01–V-03 or any end-to-end smoke test without valid UAT VINs. |
| **Expected response shape unconfirmed** | `adjustedPricing.wholesale.{above,average,below}` and `sampleSize` string format need validation against actual UAT response. |

Ask list for Cox/Manheim rep (verbatim from UAT plan §0.5):
1. Confirm UAT base URLs for token endpoint and MMR endpoint
2. Confirm grant type (`password` or `client_credentials`) and whether any OAuth scope is required
3. Confirm whether `GET /valuations/search` (YMM endpoint) is provisioned for this account
4. Provide 2+ known-good UAT VINs and 2+ known-good YMM combos with expected data
5. Confirm `adjustedPricing.wholesale.{above,average,below}` and `sampleSize` field shape in UAT responses

---

## Next recommended steps (in order)

1. **Commit the 6 uncommitted files** (command above) — no blockers, tests are green.

2. **Send the ask list to Cox/Manheim rep** — use the 5 questions above. Block UAT on the response.

3. **Provision staging service-to-service secrets** (can do without Manheim response):
   ```
   wrangler secret put INTEL_WORKER_URL        # staging URL of tav-intelligence-worker
   wrangler secret put INTEL_WORKER_SECRET     # any strong random value
   wrangler secret put INTEL_SERVICE_SECRET \
     --config workers/tav-intelligence-worker/wrangler.toml --env staging
   ```

4. **Deploy intelligence worker to staging** (can do without Manheim response):
   ```
   wrangler deploy --config workers/tav-intelligence-worker/wrangler.toml --env staging
   ```

5. **Once Manheim answers:** provision Manheim secrets on intelligence worker staging, set `MANHEIM_GRANT_TYPE` if client_credentials, then run UAT plan §3–§9 in order.

6. **After staging UAT passes all criteria in §12:** set `MANHEIM_LOOKUP_MODE = "worker"` in `[env.staging.vars]`, redeploy main worker, run end-to-end smoke test.

7. **Production deploy blockers** (tracked in `docs/followups.md`): provision `TAV_INTEL_KV` production namespace, all production secrets. Do not deploy to production until staging is fully validated.

---

## Commands to resume safely

```bash
# Verify working tree state
git status
git diff --stat HEAD

# Confirm tests are still green before any new work
npm run lint && npm run typecheck && npm test

# Commit the pending readiness cleanup if not yet done
git add docs/RUNBOOK.md docs/followups.md src/valuation/workerClient.ts \
  workers/tav-intelligence-worker/src/clients/__tests__/manheimHttp.test.ts \
  workers/tav-intelligence-worker/src/clients/manheimHttp.ts \
  workers/tav-intelligence-worker/src/types/env.ts \
  docs/session-handoff-2026-05-08.md
git commit -m "feat: readiness cleanup — MANHEIM_GRANT_TYPE support, worker call logging, doc updates"

# Review open follow-ups before starting new work
cat docs/followups.md

# Review UAT plan before beginning any staging work
cat docs/manheim-uat-validation-plan.md
```

---

## WARNING — Do not call live Manheim/Cox APIs

> **Do not set real Manheim credentials, do not point `MANHEIM_TOKEN_URL` or `MANHEIM_MMR_URL` at production endpoints, and do not run any code path that triggers an OAuth token request or MMR lookup against live Cox/Manheim infrastructure until the following are confirmed:**
>
> 1. Grant type is known (password vs client_credentials)
> 2. UAT base URLs are confirmed for this account
> 3. Known-good test VINs and YMM combos are in hand
> 4. YMM endpoint provisioning is confirmed (currently returns 596)
>
> Using production credentials against UAT, or UAT credentials against production, risks account lockout, exhausted rate-limit quota, and audit log pollution. All current test coverage is fully mocked — no live calls have been made during this session.

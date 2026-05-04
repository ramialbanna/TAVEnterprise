## CI/CD & Staging Deploy – Wiring Checklist

This project’s CI and staging deploy workflows depend on GitHub configuration that **cannot** live in the repo. Use this checklist when setting up a new environment or rotating credentials.

### 1. Required GitHub Actions secrets

Repository: `ramialbanna/TAV-VAIP` → **Settings → Secrets and variables → Actions → Secrets**

Create these **repository secrets**:

1. `CLOUDFLARE_API_TOKEN`
   - Cloudflare API token with permission to deploy Workers for this account.
   - Recommended: use the “Edit Cloudflare Workers” template in the Cloudflare dashboard when creating it.

2. `CLOUDFLARE_ACCOUNT_ID`
   - 32‑character Cloudflare account ID.
   - Visible in the Cloudflare dashboard URL or in account settings.

3. `CLAUDE_CODE_OAUTH_TOKEN`
   - OAuth token created via `claude setup-token`.
   - Used by the “PR Review (Claude reviewer subagents)” workflow to talk back to Claude Code.

These are **never** stored in the repo; they only exist as GitHub secrets.

### 2. Required GitHub Actions variable

Repository: `ramialbanna/TAV-VAIP` → **Settings → Secrets and variables → Actions → Variables**

Create this **repository variable**:

- `STAGING_HEALTH_URL`
  - Example placeholder: `https://tav-aip-staging.workers.dev/health`
  - Once staging is live, set to the real `/health` URL for the staging Worker.

Used by `.github/workflows/deploy-staging.yml` to verify deploy success with a `/health` check.

### 3. Staging environment with required reviewer

Repository: `ramialbanna/TAV-VAIP` → **Settings → Environments**

1. Create an environment named exactly: `staging`.
2. In the `staging` environment settings:
   - Enable **Required reviewers**.
   - Add at least one reviewer (for now: `ramialbanna`).
3. Optionally, you may move Cloudflare secrets and/or `STAGING_HEALTH_URL` to environment‑scoped secrets/variables later, but the current workflows read from repo‑level secrets by default.

Effect: pushes to `main` trigger the “Deploy (staging)” workflow, which pauses at the `staging` environment gate until an approved reviewer explicitly allows the deploy.

### 4. Expected behavior when wiring is correct

- **CI workflow (`CI`):**
  - Runs on pushes and PRs.
  - `verify` job:
    - If no `package.json` + `package-lock.json`: Node steps are **skipped**, job still passes.
    - Once the Node app exists: runs `npm ci`, lint, typecheck, tests, and (conditionally) integration tests.
  - `secret-scan` and `tav-gates` always run.

- **Staging deploy workflow (`Deploy (staging)`):**
  - Runs on pushes to `main`.
  - If Node project is missing: Node steps and deploy are **skipped** cleanly.
  - If secrets/variable are missing: `Verify deploy prerequisites` marks deploy as skipped with a notice.
  - When everything is wired and the `staging` environment approval is granted:
    - Runs Wrangler deploy with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
    - Polls `STAGING_HEALTH_URL` until it sees `{"ok": true}` or fails after ~25 seconds.

If CI or deploy are red, first check:
1. Repo secrets (three names above).
2. Repo variable (`STAGING_HEALTH_URL`).
3. `staging` environment exists and has at least one required reviewer.

---

## Incident Response

This section is the fast-response guide for production, staging, CI/CD, and data-integrity incidents in TAV-AIP. For full postmortems, use `docs/incidents/incident-template.md`.

### Severity levels

- **SEV-1** — Production outage, corrupted data, broken pricing/scoring decisions, bad deploy affecting user-facing or operational workflows, exposed secrets, or any incident that can materially affect buying, inventory, messaging, or compliance.
- **SEV-2** — Major degradation with a usable workaround, staging deploys blocked, one critical integration down, delayed syncs, or partial data integrity risk.
- **SEV-3** — Non-critical failures, noisy alerts, isolated CI failures, documentation drift, or issues with no immediate operational impact.

### First 10 minutes

When an incident is detected:

1. Identify the blast radius:
   - Is this **production**, **staging**, **CI/CD**, or a single integration?
   - Is the issue affecting **data correctness**, **availability**, **deployability**, or **security**?

2. Freeze risky changes:
   - Do not merge additional PRs until the issue is understood.
   - If the incident began immediately after a deploy, assume the newest deploy is suspect first.

3. Classify the incident:
   - If customer/operational workflows, pricing logic, inventory integrity, title/compliance logic, or secrets are involved, treat it as at least **SEV-2** until proven otherwise.

4. Open an incident note:
   - Record: start time, who noticed it, affected environment, suspected trigger, immediate symptoms, and current mitigation status.
   - Use `docs/incidents/incident-template.md` to create `docs/incidents/YYYY-MM-DD-short-slug.md` once mitigation is underway.

### Immediate containment

**Production deploy / runtime incident**

- Pause additional deploys.
- Review the most recent commits merged to `main`.
- Check the latest GitHub Actions runs for `CI` and `Deploy (staging)`.
- If the incident correlates with the last deploy, roll back to the previous known-good commit or redeploy the previous known-good artifact/config.
- If rollback is faster and safer than forward-fixing, prefer rollback.

**Staging deploy incident**

- Verify:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLAUDE_CODE_OAUTH_TOKEN`
  - `STAGING_HEALTH_URL`
  - `staging` environment and required reviewer
- Confirm whether the failure is:
  - workflow syntax/config,
  - missing secrets/variables,
  - Cloudflare auth,
  - failed health check,
  - or application boot failure.

**Secret exposure or suspected secret exposure**

- Treat as **SEV-1**.
- Immediately rotate exposed credentials:
  - Cloudflare tokens,
  - Claude Code OAuth token,
  - any Twilio, Supabase, webhook, or third-party integration secrets.
- Remove exposed values from the repo, Actions logs, screenshots, and local notes where possible.
- Re-run secret scan and verify no secret remains committed.
- Assume any pasted live credential is compromised.

**Data integrity incident**

Examples:
- VIN handling broken,
- duplicate listings not deduped correctly,
- wrong reason codes,
- stale/removed inventory shown as active,
- score/pricing logic misfiring,
- integration payload drift causing wrong writes.

Response:
- Stop or disable the affected write path if possible.
- Avoid running bulk backfills until the bug is understood.
- Preserve evidence: failing payloads, sample record IDs, commit SHA, logs, and timestamps.
- Identify whether the issue is limited to reads, writes, or historical data already persisted.
- If writes are wrong, prioritize preventing further bad writes over repairing old ones.

### Investigation checklist

Work through these in order:

1. **What changed?**
   - Last deploy, merged PRs, config/secret changes, dependency bumps, workflow edits.

2. **Where is the failure?**
   - GitHub Actions,
   - app boot/runtime,
   - Cloudflare Worker deploy,
   - Supabase/schema/data,
   - third-party integration,
   - scoring/business rules,
   - secret/config wiring.

3. **Can it be reproduced safely?**
   - Prefer staging or local reproduction first.
   - Do not test risky fixes directly in production.

4. **Is the issue code, config, or data?**
   - Code bug,
   - missing/invalid secret,
   - environment mismatch,
   - migration/schema regression,
   - upstream payload change,
   - bad historical data.

### TAV-AIP high-risk incident classes

Treat these as priority investigation areas:

- **VIN/pathology incidents** — missing VIN assumptions, malformed VIN handling, VIN-required code paths where VIN should be optional.
- **Inventory state incidents** — stale or removed listings resurfacing, bad active/inactive classification, broken `v_active_inbox` semantics.
- **Reason-code incidents** — codes duplicated or hardcoded outside the canonical module, scoring explanation mismatch.
- **Marketplace/integration incidents** — source adapter drift, schema changes, bad translator logic, webhook signature failures.
- **Messaging/compliance incidents** — Twilio or outbound communications flowing without correct safeguards or auditability.
- **Secret/config incidents** — repo secrets missing, expired, rotated without update, or accidentally exposed.

### Rollback guidance

Use rollback when:

- the incident started immediately after a deploy,
- the previous version is known-good,
- forward-fix is uncertain,
- or data risk increases every minute the current version stays live.

Rollback steps:

1. Identify the last known-good commit SHA.
2. Revert or redeploy that version.
3. Confirm health check passes.
4. Verify the specific broken user path or operational path is restored.
5. Only then begin root-cause fix work.

Do not continue stacking hotfixes on top of an unknown-bad deployment if a clean rollback is faster.

### Communication

For SEV-1 and SEV-2:

- Record when the incident started.
- Record current status at key milestones:
  - detected,
  - contained,
  - rollback started,
  - mitigation complete,
  - root cause identified,
  - permanent fix shipped.
- Keep communication factual:
  - what is broken,
  - who/what is affected,
  - what is being done now,
  - whether data integrity is at risk.

Do not claim resolution until:

- the failing path has been tested,
- monitoring or health checks are green,
- and no further mitigation is pending.

### Recovery validation

An incident is not resolved until all applicable checks pass:

- GitHub Actions workflows are green or intentionally skipped.
- Staging deploy succeeds and `/health` returns `{"ok": true}`.
- The broken workflow/path is manually re-tested.
- If data was involved, a representative sample has been verified.
- If secrets were rotated, all dependent systems have been updated.
- If a migration or schema change was involved, confirm no downstream query/view behavior regressed.

### Post-incident review & follow-ups

Within 24 hours of a meaningful incident:

- Create `docs/incidents/YYYY-MM-DD-short-slug.md` using `docs/incidents/incident-template.md`.
- Capture:
  - summary of what happened,
  - start and end time,
  - root cause and triggering change,
  - detection method,
  - impacted systems/records/workflows,
  - mitigation taken,
  - permanent corrective action,
  - follow-up items with owners and due dates.

After resolution, consider whether the incident should result in one or more of:

- a new CI gate,
- a stronger `.claude/rules/` rule,
- a new invariant check,
- a health endpoint improvement,
- a safer deploy prerequisite check,
- better secret rotation documentation,
- stricter schema/view assertions,
- or a fixture/test that reproduces the failure.

The goal is not only to restore service, but to make the same class of failure harder to repeat.
# GitHub Integration — TAV-VAIP

> Companion to CLAUDE.md §4 and `.claude/agents/gh-integration.md`. Pulled in via `@docs/github.md`.

## Repo facts
- **URL:** https://github.com/ramialbanna/TAV-VAIP
- **Owner / repo:** `ramialbanna/TAV-VAIP`
- **Default branch:** `main`
- **Visibility:** public

## Workflow files

| File | Trigger | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | push, PR, manual | Verification loop in CI: install → lint → typecheck → vitest → (integration if I/O/sources/migrations changed) → secret-scan → TAV gates |
| `.github/workflows/pr-review.yml` | PR opened / synced / ready_for_review | Runs the parallel reviewer subagents (`/review`) via the Claude Code Action and posts the aggregated review as a PR comment |
| `.github/workflows/deploy-staging.yml` | push to `main`, manual | Re-runs lint/typecheck/test, then `wrangler deploy --env staging`, then a `/health` smoke check |

## Issue templates
- `bug_report.md`
- `feature_request.md`
- `source_adapter.md` — for new platform adapters (links to `docs/plan-prompts/01-add-source-adapter.md`)
- `schema_change.md` — for schema migrations (links to `docs/plan-prompts/05-schema-migration.md`)

## PR template
`.github/pull_request_template.md` — built around the verification report from `docs/verification/template.md`. The TAV self-check tickboxes are mandatory; merging without them is a process violation, not a style nit.

## CODEOWNERS
`@ramialbanna` owns everything by default, with explicit ownership called out for `CLAUDE.md`, `docs/architecture.md`, `docs/identity.md`, `docs/voice.md`, `docs/adr/`, `supabase/`, `src/sources/`, `.github/`, `.claude/`, and `scripts/`.

## Branch protection (configure in repo Settings)
Required for `main`:
- Require PR before merging
- Require status checks: `Verification Loop (lint → typecheck → vitest → integration)`, `Secret-leak guard`, `TAV gates (no-VIN, reason-codes, stale intact)`, `Parallel reviewer subagents (TAV layer-aware)`
- Require CODEOWNERS review
- Disallow force-push
- Disallow deletions
- Linear history (encourages squash merges)

## Required repo secrets

| Name | Used by | Source |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `deploy-staging.yml` | Cloudflare dashboard → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy-staging.yml` | Cloudflare dashboard → right sidebar |
| `CLAUDE_CODE_OAUTH_TOKEN` | `pr-review.yml` | Created by `claude /install-github-app` from a local Claude Code session, or via the Anthropic GitHub App |

**Worker runtime secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_HMAC_SECRET`, `MANHEIM_*`, `TWILIO_*`, `ALERT_*`) are **not** GitHub secrets — they live in Cloudflare via `wrangler secret put`. The deploy workflow does not see them.

## Required repo variables

| Name | Used by | Example |
|---|---|---|
| `STAGING_HEALTH_URL` | `deploy-staging.yml` | `https://tav-aip-staging.<account>.workers.dev/health` |

## Environments
- **`staging`** — required reviewer set, used by `deploy-staging.yml`. Add a production environment later when you're ready to gate prod deploys.

## Merge contract
A PR may be merged only when:
1. CI is green (`ci.yml` succeeded — verification loop, secret-scan, TAV gates).
2. `pr-review.yml` posted its aggregated review with no BLOCKERS.
3. CODEOWNERS review approved.
4. The PR template's TAV self-check is fully ticked.
5. The diff respects the four-concept rule (Raw / Normalized / Vehicle Candidate / Lead).

These are non-negotiable. The `gh-integration` subagent will not bypass them, and humans should not either.

## Bootstrap (empty repo first push)

The repo at `ramialbanna/TAV-VAIP` is currently empty. To seed it:

```bash
cd /path/to/tav-vaip-local
git init -b main
git remote add origin https://github.com/ramialbanna/TAV-VAIP.git

# copy the starter kit contents into this directory first
git add .
git commit -m "chore: bootstrap TAV-VAIP with starter kit (CLAUDE.md, .claude/, .github/, docs/)"
git push -u origin main
```

After the first push:
1. Add the three required repo secrets above.
2. Add `STAGING_HEALTH_URL` repo variable.
3. Configure branch protection on `main`.
4. Create the `staging` environment.
5. (Optional) `claude /install-github-app` from a local Claude Code session to wire `CLAUDE_CODE_OAUTH_TOKEN`.
6. Open the first issue using `source_adapter.md` for the Facebook adapter (or use `docs/architecture.md` §18 step 1 — project foundation — as the inaugural PR).

## Day-to-day commands (cheat sheet)

```bash
# read-only — allowed without confirmation
gh pr list --state open
gh pr view <n>
gh pr diff <n>
gh pr checks <n>
gh run list --branch <branch> --limit 5
gh issue list --state open --label source-adapter

# gated (will prompt)
gh pr create --base main --head <branch> --title "feat: ..." --body-file pr-body.md
gh pr comment <n> --body-file verification-report.md
gh issue create --template source_adapter.md
gh release create v0.1.0 --generate-notes --draft

# denied at the settings layer (won't run)
gh pr merge --admin
gh repo delete
gh secret set / gh secret delete
git push --force
```

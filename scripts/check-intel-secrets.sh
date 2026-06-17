#!/usr/bin/env bash
# check-intel-secrets.sh
#
# Verifies all required secrets are present on tav-intelligence-worker before deploy.
# Blocks the deploy if any Manheim or service secret is missing, so credentials
# are never silently absent after a new environment is created or a worker is recreated.
#
# Usage (Git Bash / WSL / Linux / macOS / CI):
#   ./scripts/check-intel-secrets.sh --env staging
#   ./scripts/check-intel-secrets.sh --env production
#
# CI: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in the environment.
# Local: run `wrangler login` first, or set CLOUDFLARE_API_TOKEN.

set -euo pipefail

ENV=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$ENV" ]]; then
  echo "Usage: $0 --env staging|production" >&2
  exit 1
fi

CONFIG="workers/tav-intelligence-worker/wrangler.toml"

# Secrets that MUST be set manually via `wrangler secret put` for tav-intelligence-worker.
# These are the only values not committed to wrangler.toml [vars].
#
# NOT checked here (committed as [vars] in wrangler.toml — can never go missing):
#   MANHEIM_API_VENDOR, MANHEIM_GRANT_TYPE, MANHEIM_SCOPE, MANHEIM_MMR_URL
#
# Source of truth: workers/tav-intelligence-worker/wrangler.toml secrets comment block.
REQUIRED_SECRETS=(
  INTEL_SERVICE_SECRET
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  MANHEIM_CLIENT_ID
  MANHEIM_CLIENT_SECRET
  MANHEIM_TOKEN_URL
)

echo ""
echo "==> Checking secrets on tav-intelligence-worker (--env $ENV) ..."
echo ""

# wrangler secret list prints a table or JSON; capture stdout+stderr together.
# Use || true so a non-zero exit (e.g. no secrets set yet) doesn't abort the script
# before we can report *which* secrets are missing.
SECRETS_LIST=$(wrangler secret list \
  --config "$CONFIG" \
  --env "$ENV" 2>&1 || true)

MISSING=()
for secret in "${REQUIRED_SECRETS[@]}"; do
  # -w (word boundary) prevents e.g. MANHEIM_CLIENT_ID matching MANHEIM_CLIENT_ID_OLD
  if ! echo "$SECRETS_LIST" | grep -qw "$secret"; then
    MISSING+=("$secret")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "DEPLOY BLOCKED — the following secrets are missing on tav-intelligence-worker"
  echo "(--env $ENV). Manheim credentials will be absent after deploy and every"
  echo "MMR lookup will fail with 401 / 500."
  echo ""
  for s in "${MISSING[@]}"; do
    echo "  MISSING: $s"
  done
  echo ""
  echo "Set each missing secret, then re-run the deploy:"
  echo ""
  for s in "${MISSING[@]}"; do
    echo "  wrangler secret put $s \\"
    echo "    --config $CONFIG \\"
    echo "    --env $ENV"
    echo ""
  done
  echo "Note: Cloudflare secrets survive redeployments of the same worker name."
  echo "They must be set manually when:"
  echo "  - deploying to a new environment for the first time"
  echo "  - after a worker is renamed or recreated in the dashboard"
  echo "  - after wrangler secret delete is run"
  exit 1
fi

echo "All required secrets present on tav-intelligence-worker (--env $ENV)."
echo "Safe to deploy."
echo ""

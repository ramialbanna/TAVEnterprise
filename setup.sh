#!/usr/bin/env bash
# ============================================================================
#  TAV Marketplace — Claude Code bootstrap
# ----------------------------------------------------------------------------
#  Loads secrets from ~/.tav-marketplace.env (chmod 600), validates them,
#  and launches Claude Code with CLAUDE.md + the build prompt pre-loaded.
#
#  USAGE
#    First-time setup:   ./setup.sh --init
#    Daily run:          ./setup.sh
#    Validate only:      ./setup.sh --check
#
#  REQUIREMENTS
#    - claude (Claude Code CLI):  npm i -g @anthropic-ai/claude-code
#    - wrangler (for Phase 5.5):  npm i -g wrangler
#    - jq, curl
# ============================================================================

set -euo pipefail

ENV_FILE="$HOME/.tav-marketplace.env"
WORKDIR="$HOME/Claude/tav-marketplace"
PROMPT_FILE="$WORKDIR/claude_code_prompt.md"
CLAUDE_MD="$WORKDIR/CLAUDE.md"

# ---------------------------------------------------------------------------
# --init: interactive secrets capture (run once, or to rotate)
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--init" ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    read -r -p "⚠️  $ENV_FILE exists. Overwrite? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
  fi

  echo
  echo "═══════════════════════════════════════════════════════════════"
  echo "  TAV Marketplace — Secrets Setup"
  echo "═══════════════════════════════════════════════════════════════"
  echo "Paste your tokens. Sensitive input is hidden."
  echo

  # ── Apify ─────────────────────────────────────────────────────────────
  echo "── Apify ──────────────────────────────────────────────────────"
  echo "Get from: https://console.apify.com/settings/integrations"
  read -r -s -p "  APIFY_API_TOKEN: " APIFY_API_TOKEN; echo

  # ── Make ──────────────────────────────────────────────────────────────
  echo
  echo "── Make.com ───────────────────────────────────────────────────"
  echo "Make.com → Profile → API → generate token"
  echo "Required scopes: scenarios:write, connections:write, hooks:write"
  read -r -s -p "  MAKE_API_TOKEN:  " MAKE_API_TOKEN; echo
  read -r    -p "  MAKE_ZONE [us2]: " MAKE_ZONE
  MAKE_ZONE="${MAKE_ZONE:-us2}"

  # ── Supabase ──────────────────────────────────────────────────────────
  echo
  echo "── Supabase ───────────────────────────────────────────────────"
  echo "Create project at: https://supabase.com/dashboard"
  echo "Values from: Project Settings → API and Database"
  read -r    -p "  SUPABASE_PROJECT_REF (subdomain prefix): " SUPABASE_PROJECT_REF
  SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"
  echo "  SUPABASE_URL = $SUPABASE_URL"
  read -r -s -p "  SUPABASE_SERVICE_ROLE_KEY: " SUPABASE_SERVICE_ROLE_KEY; echo
  read -r -s -p "  SUPABASE_ANON_KEY:         " SUPABASE_ANON_KEY; echo
  read -r -s -p "  SUPABASE_DB_PASSWORD:      " SUPABASE_DB_PASSWORD; echo

  # ── Cloudflare Workers ────────────────────────────────────────────────
  echo
  echo "── Cloudflare Workers (normalizer) ─────────────────────────────"
  echo "Sign up free at: https://dash.cloudflare.com/sign-up"
  echo "Account ID is shown on the right rail of any zone page."
  read -r    -p "  CLOUDFLARE_ACCOUNT_ID: " CLOUDFLARE_ACCOUNT_ID
  echo "  Generating NORMALIZER_SECRET (32-byte hex)..."
  NORMALIZER_SECRET="$(openssl rand -hex 32)"
  echo "  ✓ NORMALIZER_SECRET generated (will be set in Cloudflare via wrangler later)"
  echo "  NORMALIZER_URL will be filled in after first 'wrangler deploy' in Phase 5.5"
  NORMALIZER_URL=""

  # ── Gmail SMTP (drift alerts) ─────────────────────────────────────────
  echo
  echo "── Gmail SMTP (drift alerts) ──────────────────────────────────"
  echo "Generate App Password at: https://myaccount.google.com/apppasswords"
  echo "(Requires 2FA on the Google account.)"
  read -r    -p "  GMAIL_SMTP_USER (full email):  " GMAIL_SMTP_USER
  read -r -s -p "  GMAIL_SMTP_APP_PASSWORD (16ch): " GMAIL_SMTP_APP_PASSWORD; echo
  read -r    -p "  ALERT_TO_EMAIL [rami@texasautovalue.com]: " ALERT_TO_EMAIL
  ALERT_TO_EMAIL="${ALERT_TO_EMAIL:-rami@texasautovalue.com}"

  # ── Sheet view layer (optional) ───────────────────────────────────────
  echo
  echo "── Google Sheet (optional view layer) ─────────────────────────"
  read -r -p "  GOOGLE_SHEET_ID (blank to skip): " GOOGLE_SHEET_ID

  # ── Buy-box ───────────────────────────────────────────────────────────
  echo
  echo "── Buy-box ────────────────────────────────────────────────────"
  read -r -p "  PRICE_MIN   [3000]:    "  PRICE_MIN;   PRICE_MIN="${PRICE_MIN:-3000}"
  read -r -p "  PRICE_MAX   [25000]:   "  PRICE_MAX;   PRICE_MAX="${PRICE_MAX:-25000}"
  read -r -p "  YEAR_MIN    [2012]:    "  YEAR_MIN;    YEAR_MIN="${YEAR_MIN:-2012}"
  read -r -p "  YEAR_MAX    [2024]:    "  YEAR_MAX;    YEAR_MAX="${YEAR_MAX:-2024}"
  read -r -p "  MILEAGE_MAX [175000]:  "  MILEAGE_MAX; MILEAGE_MAX="${MILEAGE_MAX:-175000}"

  umask 077
  cat > "$ENV_FILE" <<EOF
# TAV Marketplace secrets — DO NOT COMMIT TO GIT
# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Apify
APIFY_API_TOKEN="$APIFY_API_TOKEN"

# Make.com
MAKE_API_TOKEN="$MAKE_API_TOKEN"
MAKE_ZONE="$MAKE_ZONE"

# Supabase
SUPABASE_URL="$SUPABASE_URL"
SUPABASE_PROJECT_REF="$SUPABASE_PROJECT_REF"
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD"

# Cloudflare Workers (normalizer)
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
NORMALIZER_URL="$NORMALIZER_URL"
NORMALIZER_SECRET="$NORMALIZER_SECRET"

# Gmail SMTP (drift alerts)
GMAIL_SMTP_USER="$GMAIL_SMTP_USER"
GMAIL_SMTP_APP_PASSWORD="$GMAIL_SMTP_APP_PASSWORD"
ALERT_TO_EMAIL="$ALERT_TO_EMAIL"

# Google
GOOGLE_SHEET_ID="$GOOGLE_SHEET_ID"

# Buy-box
PRICE_MIN=$PRICE_MIN
PRICE_MAX=$PRICE_MAX
YEAR_MIN=$YEAR_MIN
YEAR_MAX=$YEAR_MAX
MILEAGE_MAX=$MILEAGE_MAX
EOF
  chmod 600 "$ENV_FILE"
  echo
  echo "✅ Wrote $ENV_FILE (chmod 600)."
  echo
  echo "Next steps:"
  echo "  1. cd ~/Claude/tav-marketplace"
  echo "  2. ./setup.sh   # launches Claude Code with the build prompt"
  echo
  echo "Note: NORMALIZER_URL is intentionally blank — Phase 5.5 of the build"
  echo "      prompt deploys the Worker via wrangler and writes the URL back"
  echo "      to ~/.tav-marketplace.env."
  exit 0
fi

# ---------------------------------------------------------------------------
# Load env
# ---------------------------------------------------------------------------
[[ -f "$ENV_FILE" ]] || { echo "❌ $ENV_FILE not found. Run: ./setup.sh --init"; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mkdir -p "$WORKDIR/tasks" "$WORKDIR/state" "$WORKDIR/scripts"

# ---------------------------------------------------------------------------
# Token validation
# ---------------------------------------------------------------------------
echo "🔑 Validating credentials..."

# Apify
APIFY_USER=$(curl -fsS "https://api.apify.com/v2/users/me?token=$APIFY_API_TOKEN" 2>/dev/null \
              | jq -r .data.username 2>/dev/null || true)
[[ -n "$APIFY_USER" && "$APIFY_USER" != "null" ]] \
  || { echo "   ❌ Apify token invalid. Rotate and re-run --init."; exit 1; }
echo "   ✓ Apify       → user: $APIFY_USER"

# Make.com
MAKE_OK=$(curl -fsS -H "Authorization: Token $MAKE_API_TOKEN" \
              "https://$MAKE_ZONE.make.com/api/v2/users/me" 2>/dev/null \
              | jq -r .authUser.email 2>/dev/null || true)
[[ -n "$MAKE_OK" && "$MAKE_OK" != "null" ]] \
  || { echo "   ❌ Make token invalid for zone $MAKE_ZONE."; exit 1; }
echo "   ✓ Make.com    → user: $MAKE_OK"

# Supabase service-role
SUPA_STATUS=$(curl -o /dev/null -w "%{http_code}" -fsS "$SUPABASE_URL/rest/v1/" \
               -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
               -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" 2>/dev/null || echo "000")
[[ "$SUPA_STATUS" == "200" ]] \
  || { echo "   ❌ Supabase unreachable (HTTP $SUPA_STATUS) for $SUPABASE_URL."; exit 1; }
echo "   ✓ Supabase    → $SUPABASE_PROJECT_REF.supabase.co"

# Normalizer Worker (only check after Phase 5.5 has populated NORMALIZER_URL)
if [[ -n "${NORMALIZER_URL:-}" ]]; then
  NORM_CHECK=$(curl -fsS "${NORMALIZER_URL}/health" 2>/dev/null \
                | jq -r .ok 2>/dev/null || true)
  if [[ "$NORM_CHECK" == "true" ]]; then
    echo "   ✓ Normalizer  → $NORMALIZER_URL"
  else
    echo "   ⚠️  Normalizer endpoint set but health check failed — verify deploy"
  fi
else
  echo "   ⏭  Normalizer  → not yet deployed (Phase 5.5 will deploy)"
fi

# Cloudflare account check (light — just verifies wrangler can see the account)
if command -v wrangler >/dev/null 2>&1; then
  echo "   ✓ wrangler    → $(wrangler --version 2>/dev/null | head -1)"
else
  echo "   ⏭  wrangler    → not installed yet (npm i -g wrangler before Phase 5.5)"
fi

if [[ "${1:-}" == "--check" ]]; then
  echo
  echo "✅ All credentials valid."
  exit 0
fi

# ---------------------------------------------------------------------------
# Pre-flight file checks
# ---------------------------------------------------------------------------
command -v claude >/dev/null 2>&1 \
  || { echo "❌ 'claude' CLI not found. Install: npm i -g @anthropic-ai/claude-code"; exit 1; }

[[ -f "$PROMPT_FILE" ]] \
  || { echo "❌ Prompt not found at $PROMPT_FILE."; exit 1; }
[[ -f "$CLAUDE_MD" ]] \
  || { echo "❌ CLAUDE.md not found at $CLAUDE_MD."; exit 1; }

cd "$WORKDIR"
echo
echo "🚀 Launching Claude Code in $WORKDIR"
echo "   Project context: CLAUDE.md (auto-loaded)"
echo "   Build prompt:    claude_code_prompt.md"
echo

claude "$(cat "$PROMPT_FILE")"

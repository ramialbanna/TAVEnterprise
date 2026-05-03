#!/usr/bin/env bash
# PostToolUse hook for TAV-AIP: lightweight verification after every Edit/Write.
# Stays fast (<5s). Heavy verification = the /verify command.
#
# Reads tool input from stdin as JSON; we extract file_path with jq if available.

set -uo pipefail

INPUT="$(cat || true)"
FILE_PATH=""
if command -v jq >/dev/null 2>&1; then
  FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
fi

[[ -z "${FILE_PATH}" ]] && exit 0
[[ ! -f "${FILE_PATH}" ]] && exit 0

# 0. Secret-leak guard. Refuse to leave the file alone if it appears to contain a real secret.
if grep -E -q '^(SUPABASE_SERVICE_ROLE_KEY|WEBHOOK_HMAC_SECRET|MANHEIM_(CLIENT_SECRET|PASSWORD)|TWILIO_AUTH_TOKEN)=[A-Za-z0-9_\-\.]{16,}' "${FILE_PATH}" 2>/dev/null; then
  if [[ "${FILE_PATH}" != *".dev.vars.example" ]]; then
    echo "post-edit-verify: possible secret committed to ${FILE_PATH}. Refusing." >&2
    exit 2
  fi
fi

# 1. Format-on-edit (best-effort, never blocks).
case "${FILE_PATH}" in
  *.ts|*.tsx|*.js|*.json|*.md)
    if command -v npx >/dev/null 2>&1 && [[ -f "package.json" ]]; then
      npx --no-install prettier --write "${FILE_PATH}" >/dev/null 2>&1 || true
    fi
    ;;
  *.sql)
    # leave SQL alone — formatting a migration is risky
    :
    ;;
esac

# 2. Quick syntax check — surface failures back to Claude as a non-blocking note.
SYNTAX_OK=1
case "${FILE_PATH}" in
  *.ts|*.tsx)
    if command -v npx >/dev/null 2>&1; then
      # Single-file noEmit pass; project tsconfig governs strictness.
      npx --no-install tsc --noEmit --skipLibCheck "${FILE_PATH}" 2>&1 | head -n 20 >&2 || SYNTAX_OK=0
    fi
    ;;
  *.sh)
    bash -n "${FILE_PATH}" 2>&1 | head -n 20 >&2 || SYNTAX_OK=0
    ;;
  *.json)
    if command -v jq >/dev/null 2>&1; then
      jq -e '.' "${FILE_PATH}" >/dev/null 2>&1 || SYNTAX_OK=0
    fi
    ;;
esac

if [[ "${SYNTAX_OK}" -eq 0 ]]; then
  echo "post-edit-verify: syntax check failed for ${FILE_PATH}" >&2
  exit 2
fi

exit 0
